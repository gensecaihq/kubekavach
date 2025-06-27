import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server';

// Mock dependencies
vi.mock('@kubekavach/core', () => ({
  KubernetesScanner: vi.fn().mockImplementation(() => ({
    scan: vi.fn().mockResolvedValue({
      summary: { total: 2, critical: 1, high: 1, medium: 0, low: 0 },
      findings: [
        {
          ruleId: 'KKR001',
          ruleName: 'Test Rule',
          severity: 'CRITICAL',
          resource: { kind: 'Pod', name: 'test-pod', namespace: 'default' },
          message: 'Test finding'
        }
      ]
    })
  })),
  loadConfig: vi.fn().mockReturnValue({
    api: {
      port: 3000,
      host: 'localhost',
      cors: { origin: true },
      security: { apiKeys: ['test-key'] }
    }
  })
}));

vi.mock('@kubekavach/rules', () => ({
  allRules: [
    {
      id: 'KKR001',
      name: 'Privileged Container',
      description: 'Detects privileged containers',
      severity: 'CRITICAL',
      category: 'Pod Security'
    }
  ]
}));

describe('API Server', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = buildServer();
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
      expect(body.version).toBeDefined();
    });
  });

  describe('Rules Endpoint', () => {
    it('should return all rules', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/rules',
        headers: {
          'x-api-key': 'test-key'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(1);
      expect(body[0].id).toBe('KKR001');
    });

    it('should require API key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/rules'
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject invalid API key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/rules',
        headers: {
          'x-api-key': 'invalid-key'
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Scan Endpoint', () => {
    it('should start a scan', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'x-api-key': 'test-key',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          namespace: 'default'
        })
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.jobId).toBeDefined();
      expect(body.status).toBe('running');
    });

    it('should start a scan without namespace', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'x-api-key': 'test-key',
          'content-type': 'application/json'
        },
        body: JSON.stringify({})
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.jobId).toBeDefined();
      expect(body.status).toBe('running');
    });

    it('should require API key for scan', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({})
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Scan Results Endpoint', () => {
    it('should return scan results for completed job', async () => {
      // First start a scan
      const scanResponse = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'x-api-key': 'test-key',
          'content-type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const { jobId } = JSON.parse(scanResponse.body);

      // Wait a bit for the scan to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get results
      const resultsResponse = await server.inject({
        method: 'GET',
        url: `/scan/results/${jobId}`,
        headers: {
          'x-api-key': 'test-key'
        }
      });

      expect(resultsResponse.statusCode).toBe(200);
      const body = JSON.parse(resultsResponse.body);
      expect(body.status).toBeDefined();
      expect(['running', 'completed', 'failed']).toContain(body.status);
    });

    it('should return 404 for non-existent job', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/scan/results/non-existent-job',
        headers: {
          'x-api-key': 'test-key'
        }
      });

      expect(response.statusCode).toBe(404);
    });

    it('should require API key for results', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/scan/results/some-job-id'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/non-existent-route',
        headers: {
          'x-api-key': 'test-key'
        }
      });

      expect(response.statusCode).toBe(404);
    });

    it('should handle invalid JSON', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'x-api-key': 'test-key',
          'content-type': 'application/json'
        },
        body: 'invalid json'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('CORS', () => {
    it('should handle CORS preflight requests', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/scan',
        headers: {
          'origin': 'http://localhost:5173',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'x-api-key'
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-headers']).toBeDefined();
    });
  });
});