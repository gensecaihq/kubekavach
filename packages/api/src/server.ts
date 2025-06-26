
import Fastify from 'fastify';
import { ScanResultSchema, z, loadConfig } from '@kubekavach/core';
import fastifyRateLimit from '@fastify/rate-limit';
import { randomUUID } from 'crypto';

const fastify = Fastify({ logger: true });
const config = loadConfig();

// In-memory store for scan jobs
const scanJobs = new Map<string, { status: string; result: any }>();

// Register rate limiting
fastify.register(fastifyRateLimit, {
  max: config.api?.rateLimit.max,
  timeWindow: config.api?.rateLimit.timeWindow,
});

// API Key authentication hook
fastify.addHook('preHandler', (request, reply, done) => {
  if (config.api?.apiKey && request.headers['x-api-key'] !== config.api.apiKey) {
    reply.code(401).send({ error: 'Unauthorized' });
  } else {
    done();
  }
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
}, async (request, reply) => {
  const { namespace, ruleIds } = request.body as z.infer<typeof ScanRequestSchema>;
  const jobId = randomUUID();

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
}, async (request, reply) => {
  const { jobId } = request.params as { jobId: string };
  const job = scanJobs.get(jobId);

  if (!job) {
    reply.code(404).send({ error: 'Job not found' });
    return;
  }

  reply.send(job);
});

async function runScan(jobId: string, namespace?: string, ruleIds?: string[]) {
  try {
    // Placeholder for the actual scan logic
    console.log(`Running scan for job ${jobId}...`);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate a long scan

    const result = {
      id: jobId,
      timestamp: new Date().toISOString(),
      cluster: 'my-cluster',
      duration: 5000,
      summary: { total: 1, critical: 1, high: 0, medium: 0, low: 0 },
      findings: [], // Add findings here
    };

    scanJobs.set(jobId, { status: 'completed', result });
  } catch (error: any) {
    scanJobs.set(jobId, { status: 'failed', result: { error: error.message } });
  }
}

export const startServer = async () => {
  try {
    await fastify.listen({ port: config.api?.port, host: config.api?.host });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
