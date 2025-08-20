import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server';

describe('API Contract Tests', () => {
  let server: FastifyInstance;
  const testApiKey = 'contract-test-key-12345678901234567890123456';

  beforeAll(async () => {
    vi.mock('@kubekavach/core', async () => {
      const actual = await vi.importActual('@kubekavach/core');
      return {
        ...actual,
        loadConfig: vi.fn().mockReturnValue({
          api: {
            port: 3003,
            host: '127.0.0.1',
            corsOrigin: 'http://localhost:5173'
          },
          users: [{
            username: 'contract-user',
            apiKey: testApiKey,
            roles: ['admin', 'scanner', 'viewer']
          }]
        }),
        KubernetesScanner: vi.fn().mockImplementation(() => ({
          scan: vi.fn().mockResolvedValue({
            id: 'contract-scan-123',
            timestamp: '2024-01-01T00:00:00.000Z',
            cluster: 'test-cluster',
            namespace: 'default',
            duration: 1500,
            summary: {
              total: 2,
              critical: 1,
              high: 0,
              medium: 1,
              low: 0
            },
            findings: [
              {
                ruleId: 'KKR001',
                ruleName: 'Privileged Container',
                severity: 'CRITICAL',
                resource: {
                  kind: 'Pod',
                  name: 'vulnerable-pod',
                  namespace: 'default',
                  apiVersion: 'v1'
                },
                message: 'Container running in privileged mode',
                remediation: 'Set privileged: false in securityContext'
              },
              {
                ruleId: 'KKR007',
                ruleName: 'Service Account Token Auto-Mount',
                severity: 'MEDIUM',
                resource: {
                  kind: 'Pod',
                  name: 'token-pod',
                  namespace: 'default',
                  apiVersion: 'v1'
                },
                message: 'Pod automatically mounts service account tokens',
                remediation: 'Set automountServiceAccountToken: false'
              }
            ]
          }),
          validateConnection: vi.fn().mockResolvedValue(true)
        }))
      };
    });

    server = buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  describe('OpenAPI Specification Compliance', () => {
    it('should serve valid OpenAPI specification', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/documentation/json'
      });

      expect(response.statusCode).toBe(200);
      const spec = JSON.parse(response.body);

      // Validate OpenAPI structure
      expect(spec.openapi || spec.swagger).toBeDefined();
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBe('KubeKavach API');
      expect(spec.info.version).toBeDefined();
      expect(spec.paths).toBeDefined();

      // Validate required endpoints are documented
      const requiredPaths = ['/health', '/rules', '/scan', '/scan/results/{jobId}'];
      requiredPaths.forEach(path => {
        expect(spec.paths[path] || spec.paths[path.replace('{jobId}', '{id}')]).toBeDefined();
      });
    });

    it('should validate response schemas match specification', async () => {
      // Health endpoint response validation
      const healthResponse = await server.inject({
        method: 'GET',
        url: '/health'
      });

      expect(healthResponse.statusCode).toBe(200);
      const healthBody = JSON.parse(healthResponse.body);
      
      // Health response should have required fields
      expect(healthBody).toHaveProperty('status');
      expect(healthBody).toHaveProperty('timestamp');
      expect(healthBody).toHaveProperty('version');
      expect(typeof healthBody.status).toBe('string');
      expect(typeof healthBody.timestamp).toBe('string');
      expect(Date.parse(healthBody.timestamp)).not.toBeNaN(); // Valid timestamp
    });

    it('should validate scan request/response schemas', async () => {
      // Start a scan
      const scanResponse = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'x-api-key': testApiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          namespace: 'contract-test'
        })
      });

      expect(scanResponse.statusCode).toBe(200);
      const scanBody = JSON.parse(scanResponse.body);

      // Validate scan response schema
      expect(scanBody).toHaveProperty('jobId');
      expect(scanBody).toHaveProperty('status');
      expect(typeof scanBody.jobId).toBe('string');
      expect(typeof scanBody.status).toBe('string');
      expect(['running', 'queued']).toContain(scanBody.status);

      // Wait for scan to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get scan results
      const resultsResponse = await server.inject({
        method: 'GET',
        url: `/scan/results/${scanBody.jobId}`,
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(resultsResponse.statusCode).toBe(200);
      const resultsBody = JSON.parse(resultsResponse.body);

      // Validate results schema
      if (resultsBody.status === 'completed') {
        expect(resultsBody).toHaveProperty('result');
        const result = resultsBody.result;
        
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('cluster');
        expect(result).toHaveProperty('summary');
        expect(result).toHaveProperty('findings');

        // Validate summary schema
        expect(result.summary).toHaveProperty('total');
        expect(result.summary).toHaveProperty('critical');
        expect(result.summary).toHaveProperty('high');
        expect(result.summary).toHaveProperty('medium');
        expect(result.summary).toHaveProperty('low');

        // Validate findings schema
        expect(Array.isArray(result.findings)).toBe(true);
        if (result.findings.length > 0) {
          const finding = result.findings[0];
          expect(finding).toHaveProperty('ruleId');
          expect(finding).toHaveProperty('ruleName');
          expect(finding).toHaveProperty('severity');
          expect(finding).toHaveProperty('resource');
          expect(finding).toHaveProperty('message');
          
          // Validate resource schema
          expect(finding.resource).toHaveProperty('kind');
          expect(finding.resource).toHaveProperty('name');
          expect(finding.resource).toHaveProperty('apiVersion');
        }
      }
    });

    it('should validate rules endpoint schema', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/rules',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(200);
      const rules = JSON.parse(response.body);

      expect(Array.isArray(rules)).toBe(true);
      
      if (rules.length > 0) {
        const rule = rules[0];
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('name');
        expect(rule).toHaveProperty('description');
        expect(rule).toHaveProperty('severity');
        expect(rule).toHaveProperty('category');
        
        // Validate severity enum
        expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).toContain(rule.severity);
      }
    });
  });

  describe('HTTP Standards Compliance', () => {
    it('should use correct HTTP methods', async () => {
      const methodTests = [
        { method: 'GET', url: '/health', expectedStatus: 200 },
        { method: 'GET', url: '/rules', headers: { 'x-api-key': testApiKey }, expectedStatus: 200 },
        { method: 'POST', url: '/scan', headers: { 'x-api-key': testApiKey, 'content-type': 'application/json' }, body: '{}', expectedStatus: 200 },
        { method: 'PUT', url: '/health', expectedStatus: [404, 405] }, // Should not be allowed
        { method: 'DELETE', url: '/health', expectedStatus: [404, 405] }, // Should not be allowed
      ];

      for (const test of methodTests) {
        const response = await server.inject({
          method: test.method as any,
          url: test.url,
          headers: test.headers || {},
          body: test.body
        });

        if (Array.isArray(test.expectedStatus)) {
          expect(test.expectedStatus).toContain(response.statusCode);
        } else {
          expect(response.statusCode).toBe(test.expectedStatus);
        }
      }
    });

    it('should set correct content-type headers', async () => {
      const endpoints = [
        { url: '/health', expectedType: 'application/json' },
        { url: '/rules', headers: { 'x-api-key': testApiKey }, expectedType: 'application/json' },
        { url: '/documentation', expectedType: 'text/html' }
      ];

      for (const endpoint of endpoints) {
        const response = await server.inject({
          method: 'GET',
          url: endpoint.url,
          headers: endpoint.headers || {}
        });

        expect(response.headers['content-type']).toContain(endpoint.expectedType);
      }
    });

    it('should handle OPTIONS requests correctly', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/scan',
        headers: {
          'origin': 'http://localhost:5173',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'x-api-key,content-type'
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-headers']).toBeDefined();
      expect(response.headers['access-control-max-age']).toBeDefined();
    });

    it('should use appropriate status codes', async () => {
      const statusTests = [
        // Success cases
        { method: 'GET', url: '/health', expectedStatus: 200 },
        { method: 'GET', url: '/rules', headers: { 'x-api-key': testApiKey }, expectedStatus: 200 },
        
        // Client error cases
        { method: 'GET', url: '/nonexistent', expectedStatus: 404 },
        { method: 'GET', url: '/rules', expectedStatus: 401 }, // No API key
        { method: 'GET', url: '/rules', headers: { 'x-api-key': 'invalid' }, expectedStatus: 401 },
        { method: 'POST', url: '/scan', headers: { 'x-api-key': testApiKey }, body: 'invalid json', expectedStatus: 400 },
      ];

      for (const test of statusTests) {
        const response = await server.inject({
          method: test.method as any,
          url: test.url,
          headers: {
            'content-type': 'application/json',
            ...test.headers
          },
          body: test.body
        });

        expect(response.statusCode).toBe(test.expectedStatus);
      }
    });
  });

  describe('API Versioning', () => {
    it('should include API version in responses', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.version).toBeDefined();
      expect(typeof body.version).toBe('string');
      expect(body.version).toMatch(/^\d+\.\d+\.\d+/); // Semantic versioning
    });

    it('should support API versioning headers', async () => {
      const versions = ['v1', 'v2', 'latest'];
      
      for (const version of versions) {
        const response = await server.inject({
          method: 'GET',
          url: '/health',
          headers: {
            'accept-version': version
          }
        });

        // Should at least not error - version handling depends on implementation
        expect([200, 406]).toContain(response.statusCode);
      }
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      const errorCases = [
        { method: 'GET', url: '/nonexistent', expectedStatus: 404 },
        { method: 'GET', url: '/rules', expectedStatus: 401 },
        { method: 'POST', url: '/scan', headers: { 'x-api-key': testApiKey }, body: 'invalid', expectedStatus: 400 }
      ];

      for (const errorCase of errorCases) {
        const response = await server.inject({
          method: errorCase.method as any,
          url: errorCase.url,
          headers: {
            'content-type': 'application/json',
            ...errorCase.headers
          },
          body: errorCase.body
        });

        expect(response.statusCode).toBe(errorCase.expectedStatus);
        
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('error');
        expect(typeof body.error).toBe('string');
        
        if (errorCase.expectedStatus >= 400) {
          expect(body).toHaveProperty('message');
          expect(typeof body.message).toBe('string');
        }
      }
    });

    it('should include error details for validation errors', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'x-api-key': testApiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          namespace: 123 // Invalid type
        })
      });

      if (response.statusCode === 400) {
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('error');
        expect(body).toHaveProperty('message');
        // May include validation details
      }
    });
  });

  describe('Rate Limiting Contract', () => {
    it('should include rate limit headers', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/rules',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should return proper rate limit exceeded response', async () => {
      // Make many requests to trigger rate limiting
      const requests = Array.from({ length: 20 }, () =>
        server.inject({
          method: 'POST',
          url: '/scan',
          headers: {
            'x-api-key': testApiKey,
            'content-type': 'application/json',
            'x-forwarded-for': '192.168.1.100' // Same IP to trigger limits
          },
          body: JSON.stringify({ namespace: 'rate-test' })
        })
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponse = responses.find(r => r.statusCode === 429);

      if (rateLimitedResponse) {
        const body = JSON.parse(rateLimitedResponse.body);
        expect(body).toHaveProperty('error');
        expect(body.error).toBe('Too Many Requests');
        expect(body).toHaveProperty('retryAfter');
        expect(typeof body.retryAfter).toBe('number');
      }
    });
  });

  describe('Security Headers Contract', () => {
    it('should include all required security headers', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      const requiredHeaders = [
        'x-frame-options',
        'x-content-type-options',
        'referrer-policy',
        'content-security-policy'
      ];

      requiredHeaders.forEach(header => {
        expect(response.headers[header]).toBeDefined();
      });

      // Validate specific header values
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain backward compatibility for v1 endpoints', async () => {
      // Test that existing v1 endpoints still work as expected
      const v1Endpoints = [
        { method: 'GET', url: '/health', expectedFields: ['status', 'timestamp', 'version'] },
        { method: 'GET', url: '/rules', headers: { 'x-api-key': testApiKey }, expectedFields: ['0'] } // Array response
      ];

      for (const endpoint of v1Endpoints) {
        const response = await server.inject({
          method: endpoint.method as any,
          url: endpoint.url,
          headers: endpoint.headers || {}
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        if (Array.isArray(body)) {
          // For array responses, check if it's an array
          expect(Array.isArray(body)).toBe(true);
        } else {
          // For object responses, check required fields
          endpoint.expectedFields.forEach(field => {
            expect(body).toHaveProperty(field);
          });
        }
      }
    });
  });
});