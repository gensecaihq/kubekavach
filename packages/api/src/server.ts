import Fastify from 'fastify';
import { ScanResultSchema, z, loadConfig, initializeObservability, User } from '@kubekavach/core';
import { rateLimiter, RateLimitConfigs } from '@kubekavach/core/utils/rate-limiter';
import { security } from '@kubekavach/core/utils/security';
import { logger, createRequestLogger } from '@kubekavach/core/utils/logger';
import { metrics, KubeKavachMetrics } from '@kubekavach/core/utils/metrics';
import { healthManager } from '@kubekavach/core/utils/health';
import { gracefulShutdown, createShutdownMiddleware } from '@kubekavach/core/utils/graceful-shutdown';
import { withRetryAndCircuitBreaker } from '@kubekavach/core/utils/error-recovery';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { randomUUID } from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

// Initialize production logger
const fastify = Fastify({ 
  logger: false, // Disable built-in logger, use our custom one
  requestIdLogLabel: 'requestId',
  requestIdHeader: 'x-request-id'
});
const config = loadConfig();

// Initialize observability tools
initializeObservability(fastify);

// Register CORS
fastify.register(fastifyCors, {
  origin: config.api?.corsOrigin || 'http://localhost:3000', // Default to localhost for security
  methods: ['GET', 'POST'],
});

// Register Helmet for security headers
fastify.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Adjust as needed for UI frameworks
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
});

// Register Swagger for OpenAPI documentation
fastify.register(fastifySwagger, {
  swagger: {
    info: {
      title: 'KubeKavach API',
      description: 'REST API for KubeKavach security scanner and replay engine.',
      version: '0.1.0',
    },
    host: `${config.api?.host}:${config.api?.port}`,
    schemes: ['http'],
    consumes: ['application/json'],
    produces: ['application/json'],
    tags: [
      { name: 'scan', description: 'Scan related endpoints' },
      { name: 'health', description: 'Health check endpoints' },
    ],
  },
});

fastify.register(fastifySwaggerUi, {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: false,
  },
  uiHooks: {
    onRequest: function (request, reply, next) { next(); },
    preHandler: function (request, reply, next) { next(); },
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
});

// In-memory store for scan jobs
const scanJobs = new Map<string, { status: string; result: any }>();

// Initialize rate limiters
const apiLimiter = rateLimiter.createLimiter('api', RateLimitConfigs.api);
const authLimiter = rateLimiter.createLimiter('auth', RateLimitConfigs.auth);
const scanLimiter = rateLimiter.createLimiter('scan', RateLimitConfigs.scan);

// Shutdown middleware
fastify.addHook('onRequest', async (request, reply) => {
  if (!gracefulShutdown.isHealthy()) {
    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Server is shutting down'
    });
    return;
  }
});

// Request logging and security middleware
fastify.addHook('onRequest', async (request, reply) => {
  const requestLogger = createRequestLogger({ 
    method: request.method,
    url: request.url,
    ip: request.ip,
    userAgent: request.headers['user-agent']
  });
  
  request.log = requestLogger;
  
  // Security headers
  const headers = security.getSecurityHeaders();
  for (const [key, value] of Object.entries(headers)) {
    reply.header(key, value);
  }

  // Detect suspicious activity
  const suspiciousCheck = security.detectSuspiciousActivity({
    userAgent: request.headers['user-agent'],
    headers: request.headers as Record<string, string>,
    path: request.url
  });

  if (suspiciousCheck.suspicious) {
    logger.security('Suspicious request detected', {
      ip: request.ip,
      reasons: suspiciousCheck.reasons,
      path: request.url
    });
    
    metrics.incrementCounter('suspicious_requests_total', 1, {
      ip: security.sanitizeIdentifier(request.ip)
    });
  }
});

// Rate limiting middleware
fastify.addHook('preHandler', async (request, reply) => {
  const startTime = Date.now();
  
  // Apply different rate limits based on endpoint
  let limiter;
  let config;
  
  if (request.url.startsWith('/scan')) {
    limiter = scanLimiter;
    config = RateLimitConfigs.scan;
  } else {
    limiter = apiLimiter;
    config = RateLimitConfigs.api;
  }
  
  const key = config.keyGenerator(request);
  const result = limiter.check(key);
  
  // Add rate limit headers
  reply.header('X-RateLimit-Limit', config.maxRequests);
  reply.header('X-RateLimit-Remaining', result.remaining);
  reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
  
  if (!result.allowed) {
    logger.security('Rate limit exceeded', {
      ip: request.ip,
      path: request.url,
      hits: result.totalHits
    });
    
    reply.code(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
    });
    return;
  }
  
  // Record API metrics
  const duration = Date.now() - startTime;
  KubeKavachMetrics.apiRequest(request.method, request.url, 200, duration);
});

// Authorization helper
const authorize = (roles: string[]) => (request: FastifyRequest, reply: any, done: () => void) => {
  if (!request.user) {
    fastify.log.warn({ ip: request.ip }, 'Authorization failed: No user attached to request');
    reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    return;
  }
  const hasRequiredRole = roles.some(role => request.user?.roles.includes(role));
  if (!hasRequiredRole) {
    fastify.log.warn({ user: request.user.username, roles: request.user.roles, requiredRoles: roles }, 'Authorization failed: Insufficient roles');
    reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
    return;
  }
  done();
};

// API Key authentication hook with security hardening
fastify.addHook('preHandler', async (request, reply) => {
  // Skip auth for health checks and documentation
  if (request.url === '/health' || request.url.startsWith('/documentation')) {
    return;
  }

  const providedApiKey = request.headers['x-api-key'] as string;
  const clientIP = request.ip;
  
  // Check if IP is locked out
  if (security.isLockedOut(clientIP)) {
    logger.security('Request from locked out IP', { ip: clientIP });
    reply.code(429).send({ 
      error: 'Account Locked', 
      message: 'Too many failed attempts. Please try again later.' 
    });
    return;
  }

  if (!providedApiKey) {
    logger.security('API access attempt without API Key', { ip: clientIP });
    security.recordFailedAttempt(clientIP);
    
    // Apply auth rate limiting
    const authKey = RateLimitConfigs.auth.keyGenerator(request);
    const authResult = authLimiter.check(authKey);
    
    if (!authResult.allowed) {
      logger.security('Auth rate limit exceeded', { ip: clientIP });
    }
    
    KubeKavachMetrics.authAttempt(false, 'missing_api_key');
    reply.code(401).send({ error: 'Unauthorized', message: 'API Key is required' });
    return;
  }

  // Validate API key format
  if (typeof providedApiKey !== 'string' || providedApiKey.length < 16) {
    logger.security('Invalid API key format', { 
      ip: clientIP,
      keyLength: providedApiKey?.length || 0
    });
    security.recordFailedAttempt(clientIP);
    KubeKavachMetrics.authAttempt(false, 'invalid_format');
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid API Key format' });
    return;
  }

  // Find user by API key (in production, this should use hashed comparison)
  const user = config.users?.find(u => u.apiKey === providedApiKey);

  if (!user) {
    logger.security('Unauthorized API access attempt', { 
      ip: clientIP,
      providedApiKey: security.sanitizeApiKey(providedApiKey)
    });
    
    security.recordFailedAttempt(clientIP);
    KubeKavachMetrics.authAttempt(false, 'invalid_key');
    
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid API Key' });
    return;
  }

  // Successful authentication
  security.clearFailedAttempts(clientIP);
  KubeKavachMetrics.authAttempt(true);
  
  logger.audit('Successful API authentication', {
    username: user.username,
    ip: clientIP,
    roles: user.roles
  });

  request.user = user;
});

const ScanRequestSchema = z.object({
  namespace: z.string().optional(),
  ruleIds: z.array(z.string()).optional(),
});

// Health check endpoints
fastify.get('/health', async (request, reply) => {
  const health = await healthManager.getHealth();
  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'warning' ? 200 : 503;
  
  reply.code(statusCode).send(health);
});

fastify.get('/health/liveness', async (request, reply) => {
  const liveness = await healthManager.getLiveness();
  const statusCode = liveness.alive ? 200 : 503;
  
  reply.code(statusCode).send(liveness);
});

fastify.get('/health/readiness', async (request, reply) => {
  const readiness = await healthManager.getReadiness();
  const statusCode = readiness.ready ? 200 : 503;
  
  reply.code(statusCode).send(readiness);
});

// Metrics endpoint
fastify.get('/metrics', async (request, reply) => {
  const allMetrics = metrics.getMetrics();
  
  // Convert to Prometheus format
  const prometheusMetrics = allMetrics.map(metric => {
    const labels = metric.labels ? 
      Object.entries(metric.labels).map(([k, v]) => `${k}="${v}"`).join(',') : '';
    const labelsStr = labels ? `{${labels}}` : '';
    return `${metric.name}${labelsStr} ${metric.value} ${metric.timestamp}`;
  }).join('\n');
  
  reply.header('Content-Type', 'text/plain').send(prometheusMetrics);
});

// Asynchronous scan endpoint
fastify.post('/scan', {
  schema: {
    body: ScanRequestSchema,
    response: {
      202: z.object({ jobId: z.string() }),
    },
  },
  tags: ['scan'],
  summary: 'Initiate a security scan',
  description: 'Starts an asynchronous security scan of the Kubernetes cluster.',
  preHandler: [authorize(['scanner'])],
}, async (request, reply) => {
  const { namespace, ruleIds } = request.body as z.infer<typeof ScanRequestSchema>;
  const jobId = randomUUID();

  logger.info('Scan job initiated', { jobId, namespace, ruleIds, user: request.user?.username });
  KubeKavachMetrics.scanStarted(namespace);

  // Start the scan in the background
  scanJobs.set(jobId, { status: 'running', result: null });
  runScan(jobId, namespace, ruleIds);

  reply.code(202).send({ jobId });
});

// Endpoint to get scan results
fastify.get('/scan/results/:jobId', {
  schema: {
    response: {
      200: z.object({ status: z.string(), result: ScanResultSchema.optional() }),
    },
  },
  tags: ['scan'],
  summary: 'Get security scan results',
  description: 'Retrieves the status and results of a previously initiated security scan.',
  preHandler: [authorize(['viewer', 'scanner'])],
}, async (request, reply) => {
  const { jobId } = request.params as { jobId: string };
  const job = scanJobs.get(jobId);

  if (!job) {
    logger.warn('Scan job not found', { jobId });
    reply.code(404).send({ error: 'Not Found', message: 'Scan job not found' });
    return;
  }

  logger.info('Scan job status requested', { jobId, status: job.status, user: request.user?.username });
  reply.send(job);
});

async function runScan(jobId: string, namespace?: string, ruleIds?: string[]) {
  const startTime = Date.now();
  
  try {
    logger.info('Starting background scan process', { jobId, namespace, ruleIds });
    
    // Import required modules
    const { KubeConfig, CoreV1Api, AppsV1Api, BatchV1Api } = await import('@kubernetes/client-node');
    const { allRules } = await import('@kubekavach/rules');
    const { validateKubernetesManifest } = await import('@kubekavach/core');
    
    // Initialize Kubernetes client
    const kc = new KubeConfig();
    kc.loadFromDefault();
    
    const clients = {
      core: kc.makeApiClient(CoreV1Api),
      apps: kc.makeApiClient(AppsV1Api),
      batch: kc.makeApiClient(BatchV1Api),
    };

    // Get current context cluster name
    const currentContext = kc.getCurrentContext();
    const clusterName = kc.getContexts().find(ctx => ctx.name === currentContext)?.cluster || 'unknown';

    // Fetch all resources
    const resources: any[] = [];
    
    // Fetch resources with retry and circuit breaker
    const fetchResources = async (fetchFn: () => Promise<any>, resourceType: string) => {
      return withRetryAndCircuitBreaker(
        fetchFn,
        `kubernetes-${resourceType}`,
        { maxAttempts: 3, initialDelay: 1000 },
        { failureThreshold: 3, recoveryTimeout: 30000 }
      );
    };

    // Fetch pods
    const pods = await fetchResources(
      () => namespace 
        ? clients.core.listNamespacedPod(namespace) 
        : clients.core.listPodForAllNamespaces(),
      'pods'
    );
    resources.push(...pods.body.items);

    // Fetch deployments
    const deployments = await fetchResources(
      () => namespace 
        ? clients.apps.listNamespacedDeployment(namespace) 
        : clients.apps.listDeploymentForAllNamespaces(),
      'deployments'
    );
    resources.push(...deployments.body.items);

    // Fetch daemonsets
    const daemonSets = await fetchResources(
      () => namespace 
        ? clients.apps.listNamespacedDaemonSet(namespace) 
        : clients.apps.listDaemonSetForAllNamespaces(),
      'daemonsets'
    );
    resources.push(...daemonSets.body.items);

    // Fetch statefulsets
    const statefulSets = await fetchResources(
      () => namespace 
        ? clients.apps.listNamespacedStatefulSet(namespace) 
        : clients.apps.listStatefulSetForAllNamespaces(),
      'statefulsets'
    );
    resources.push(...statefulSets.body.items);

    // Fetch jobs
    const jobs = await fetchResources(
      () => namespace 
        ? clients.batch.listNamespacedJob(namespace) 
        : clients.batch.listJobForAllNamespaces(),
      'jobs'
    );
    resources.push(...jobs.body.items);

    logger.info('Fetched resources from cluster', { jobId, resourceCount: resources.length });

    // Filter rules if specified
    const rulesToApply = ruleIds ? allRules.filter(rule => ruleIds.includes(rule.id)) : allRules;
    
    // Run security rules
    const findings: any[] = [];
    let processedCount = 0;
    let skippedCount = 0;

    for (const resource of resources) {
      try {
        // Validate manifest
        if (!validateKubernetesManifest(resource)) {
          logger.warn('Skipping invalid manifest', { 
            jobId, 
            resource: `${resource.kind}/${resource.metadata?.name}` 
          });
          skippedCount++;
          continue;
        }

        // Apply rules
        for (const rule of rulesToApply) {
          try {
            if (!rule.validate(resource)) {
              findings.push(rule.getFinding(resource));
            }
          } catch (error: any) {
            logger.warn('Rule execution failed', { 
              jobId, 
              ruleId: rule.id, 
              resource: `${resource.kind}/${resource.metadata?.name}`,
              error: error.message 
            });
          }
        }
        processedCount++;
      } catch (error: any) {
        logger.warn('Error processing resource', { 
          jobId, 
          resource: `${resource.kind}/${resource.metadata?.name}`,
          error: error.message 
        });
        skippedCount++;
      }
    }

    const duration = Date.now() - startTime;
    
    // Calculate summary
    const summary = findings.reduce((acc, finding) => {
      acc.total++;
      switch (finding.severity) {
        case 'CRITICAL': acc.critical++; break;
        case 'HIGH': acc.high++; break;
        case 'MEDIUM': acc.medium++; break;
        case 'LOW': acc.low++; break;
      }
      return acc;
    }, { total: 0, critical: 0, high: 0, medium: 0, low: 0 });

    const result = {
      id: jobId,
      timestamp: new Date().toISOString(),
      cluster: clusterName,
      namespace,
      duration,
      summary,
      findings,
      metadata: {
        resourcesProcessed: processedCount,
        resourcesSkipped: skippedCount,
        rulesApplied: rulesToApply.length
      }
    };

    scanJobs.set(jobId, { status: 'completed', result });
    
    logger.info('Background scan process completed', { 
      jobId, 
      duration, 
      findingsCount: findings.length,
      summary 
    });
    
    KubeKavachMetrics.scanCompleted(namespace, duration);
    
    // Record findings metrics
    for (const [severity, count] of Object.entries(summary)) {
      if (severity !== 'total' && count > 0) {
        KubeKavachMetrics.findingsDetected(severity.toUpperCase(), count as number);
      }
    }
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    scanJobs.set(jobId, { 
      status: 'failed', 
      result: { 
        error: error.message,
        duration,
        timestamp: new Date().toISOString()
      } 
    });
    
    logger.error('Background scan process failed', error, { 
      jobId, 
      duration 
    });
    
    KubeKavachMetrics.scanFailed(namespace, error.message);
  }
}

export const startServer = async () => {
  try {
    await fastify.listen({ port: config.api?.port, host: config.api?.host });
    logger.info('Server started successfully', {
      host: config.api?.host,
      port: config.api?.port
    });

    // Register shutdown handlers
    gracefulShutdown.registerHandler({
      name: 'fastify-server',
      priority: 50,
      handler: async () => {
        logger.info('Closing Fastify server');
        await fastify.close();
      },
      timeout: 10000
    });

    gracefulShutdown.registerHandler({
      name: 'scan-jobs-cleanup',
      priority: 30,
      handler: async () => {
        logger.info('Cleaning up scan jobs');
        // Save any running jobs state if needed
        const runningJobs = Array.from(scanJobs.entries())
          .filter(([_, job]) => job.status === 'running')
          .map(([id]) => id);
        
        if (runningJobs.length > 0) {
          logger.warn('Found running scan jobs during shutdown', {
            jobIds: runningJobs
          });
        }
      },
      timeout: 5000
    });

  } catch (err) {
    logger.error('Server failed to start', err as Error);
    process.exit(1);
  }
};