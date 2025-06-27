import Fastify from 'fastify';
import { ScanResultSchema, z, loadConfig, initializeObservability, User } from '@kubekavach/core';
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

const fastify = Fastify({ logger: { level: 'info', transport: { target: 'pino-pretty' } } }); // Structured logging
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

// Register rate limiting
fastify.register(fastifyRateLimit, {
  max: config.api?.rateLimit.max,
  timeWindow: config.api?.rateLimit.timeWindow,
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

// API Key authentication hook
fastify.addHook('preHandler', (request, reply, done) => {
  const providedApiKey = request.headers['x-api-key'];

  if (!providedApiKey) {
    fastify.log.warn({ ip: request.ip }, 'API access attempt without API Key');
    reply.code(401).send({ error: 'Unauthorized', message: 'API Key is required' });
    return;
  }

  const user = config.users?.find(u => u.apiKey === providedApiKey);

  if (!user) {
    fastify.log.warn({ ip: request.ip, providedApiKeyHash: providedApiKey ? 'redacted' : 'missing' }, 'Unauthorized API access attempt with invalid API Key');
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid API Key' });
    return;
  }

  request.user = user; // Attach user to request context
  done();
});

const ScanRequestSchema = z.object({
  namespace: z.string().optional(),
  ruleIds: z.array(z.string()).optional(),
});

fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
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
  preHandler: authorize(['scanner']),
}, async (request, reply) => {
  const { namespace, ruleIds } = request.body as z.infer<typeof ScanRequestSchema>;
  const jobId = randomUUID();

  fastify.log.info({ jobId, namespace, ruleIds, user: request.user?.username }, 'Scan job initiated');

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
  preHandler: authorize(['viewer', 'scanner']),
}, async (request, reply) => {
  const { jobId } = request.params as { jobId: string };
  const job = scanJobs.get(jobId);

  if (!job) {
    fastify.log.warn({ jobId }, 'Scan job not found');
    reply.code(404).send({ error: 'Not Found', message: 'Scan job not found' });
    return;
  }

  fastify.log.info({ jobId, status: job.status, user: request.user?.username }, 'Scan job status requested');
  reply.send(job);
});

async function runScan(jobId: string, namespace?: string, ruleIds?: string[]) {
  const startTime = Date.now();
  
  try {
    fastify.log.info({ jobId, namespace, ruleIds }, 'Starting background scan process');
    
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
    
    // Fetch pods
    const pods = namespace 
      ? await clients.core.listNamespacedPod(namespace) 
      : await clients.core.listPodForAllNamespaces();
    resources.push(...pods.body.items);

    // Fetch deployments
    const deployments = namespace 
      ? await clients.apps.listNamespacedDeployment(namespace) 
      : await clients.apps.listDeploymentForAllNamespaces();
    resources.push(...deployments.body.items);

    // Fetch daemonsets
    const daemonSets = namespace 
      ? await clients.apps.listNamespacedDaemonSet(namespace) 
      : await clients.apps.listDaemonSetForAllNamespaces();
    resources.push(...daemonSets.body.items);

    // Fetch statefulsets
    const statefulSets = namespace 
      ? await clients.apps.listNamespacedStatefulSet(namespace) 
      : await clients.apps.listStatefulSetForAllNamespaces();
    resources.push(...statefulSets.body.items);

    // Fetch jobs
    const jobs = namespace 
      ? await clients.batch.listNamespacedJob(namespace) 
      : await clients.batch.listJobForAllNamespaces();
    resources.push(...jobs.body.items);

    fastify.log.info({ jobId, resourceCount: resources.length }, 'Fetched resources from cluster');

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
          fastify.log.warn({ 
            jobId, 
            resource: `${resource.kind}/${resource.metadata?.name}` 
          }, 'Skipping invalid manifest');
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
            fastify.log.warn({ 
              jobId, 
              ruleId: rule.id, 
              resource: `${resource.kind}/${resource.metadata?.name}`,
              error: error.message 
            }, 'Rule execution failed');
          }
        }
        processedCount++;
      } catch (error: any) {
        fastify.log.warn({ 
          jobId, 
          resource: `${resource.kind}/${resource.metadata?.name}`,
          error: error.message 
        }, 'Error processing resource');
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
    
    fastify.log.info({ 
      jobId, 
      duration, 
      findingsCount: findings.length,
      summary 
    }, 'Background scan process completed');
    
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
    
    fastify.log.error({ 
      jobId, 
      error: error.message, 
      stack: error.stack,
      duration 
    }, 'Background scan process failed');
  }
}

export const startServer = async () => {
  try {
    await fastify.listen({ port: config.api?.port, host: config.api?.host });
    fastify.log.info(`Server listening on ${config.api?.host}:${config.api?.port}`);

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        fastify.log.info(`Received ${signal}. Shutting down gracefully...`);
        await fastify.close();
        fastify.log.info('Server closed.');
        process.exit(0);
      });
    });

  } catch (err) {
    fastify.log.error(err, 'Server failed to start');
    process.exit(1);
  }
};