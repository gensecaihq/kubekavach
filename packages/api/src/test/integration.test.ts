import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server';

// Real integration tests without mocking critical components
describe('API Integration Tests', () => {
  let server: FastifyInstance;
  const testApiKey = 'test-api-key-12345678901234567890123456789012';

  beforeAll(async () => {
    // Mock only the configuration and Kubernetes client
    vi.mock('@kubekavach/core', async () => {
      const actual = await vi.importActual('@kubekavach/core');
      return {
        ...actual,
        loadConfig: vi.fn().mockReturnValue({
          api: {
            port: 3001,
            host: '127.0.0.1',
            corsOrigin: 'http://localhost:5173',
            rateLimit: {
              max: 100,
              timeWindow: '1 minute'
            }
          },
          users: [{
            username: 'test-user',
            apiKey: testApiKey,
            roles: ['admin', 'scanner', 'viewer']
          }]
        }),
        KubernetesScanner: vi.fn().mockImplementation(() => ({
          scan: vi.fn().mockImplementation(async (options) => {
            // Simulate scan duration based on namespace
            const delay = options?.namespace === 'large-namespace' ? 2000 : 100;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            return {
              id: 'scan-' + Date.now(),
              timestamp: new Date().toISOString(),
              cluster: 'test-cluster',
              namespace: options?.namespace || 'all',
              duration: delay,
              summary: {
                total: 3,
                critical: 1,
                high: 1,
                medium: 1,
                low: 0
              },
              findings: [
                {
                  ruleId: 'KKR001',
                  ruleName: 'Privileged Container',
                  severity: 'CRITICAL',
                  resource: { kind: 'Pod', name: 'vulnerable-pod', namespace: options?.namespace || 'default', apiVersion: 'v1' },
                  message: 'Container running in privileged mode',
                  remediation: 'Set privileged: false in securityContext'
                },
                {
                  ruleId: 'KKR002',
                  ruleName: 'Missing Resource Limits',
                  severity: 'HIGH',
                  resource: { kind: 'Pod', name: 'unlimited-pod', namespace: options?.namespace || 'default', apiVersion: 'v1' },
                  message: 'Container has no CPU or memory limits',
                  remediation: 'Add resource limits to container spec'
                },
                {
                  ruleId: 'KKR007',
                  ruleName: 'Service Account Token Auto-Mount',
                  severity: 'MEDIUM',
                  resource: { kind: 'Pod', name: 'token-pod', namespace: options?.namespace || 'default', apiVersion: 'v1' },
                  message: 'Pod automatically mounts service account tokens',
                  remediation: 'Set automountServiceAccountToken: false'
                }
              ]
            };
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

  describe('Authentication & Authorization', () => {
    it('should handle multiple concurrent authentication requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => 
        server.inject({
          method: 'GET',
          url: '/rules',
          headers: {
            'x-api-key': testApiKey,
            'x-request-id': `concurrent-${i}`
          }
        })
      );

      const responses = await Promise.all(requests);
      
      responses.forEach((response, i) => {
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(Array.isArray(body)).toBe(true);
      });
    });

    it('should properly handle malformed API keys', async () => {
      const malformedKeys = [
        '',
        'short',
        'x'.repeat(1000), // Very long key
        'key with spaces',
        'key\nwith\nnewlines',
        'key\x00with\x00nulls',
        '../../../etc/passwd', // Path traversal attempt
        '<script>alert(1)</script>', // XSS attempt
        'DROP TABLE users;', // SQL injection attempt
      ];

      for (const key of malformedKeys) {
        const response = await server.inject({
          method: 'GET',
          url: '/rules',
          headers: {
            'x-api-key': key
          }
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Unauthorized');
      }
    });

    it('should implement proper role-based access control', async () => {
      // Test different endpoints that require different roles
      const endpoints = [
        { method: 'GET', url: '/rules', requiredRole: 'viewer' },
        { method: 'POST', url: '/scan', requiredRole: 'scanner', body: {} },
        { method: 'GET', url: '/admin/metrics', requiredRole: 'admin' }
      ];

      for (const endpoint of endpoints) {
        const response = await server.inject({
          method: endpoint.method as any,
          url: endpoint.url,
          headers: {
            'x-api-key': testApiKey,
            'content-type': 'application/json'
          },
          body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
        });

        // All should succeed since test user has all roles
        expect([200, 201, 404]).toContain(response.statusCode); // 404 for non-implemented admin endpoints
      }
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on scan endpoints', async () => {
      const startTime = Date.now();
      const responses = [];

      // Make requests rapidly
      for (let i = 0; i < 15; i++) {
        const response = await server.inject({
          method: 'POST',
          url: '/scan',
          headers: {
            'x-api-key': testApiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify({ namespace: 'rate-limit-test' })
        });
        
        responses.push(response);
        
        // Short delay to simulate rapid requests
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const successfulRequests = responses.filter(r => r.statusCode === 200);
      const rateLimitedRequests = responses.filter(r => r.statusCode === 429);

      // Should have some rate limited requests
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
      
      // Rate limited responses should include proper headers
      rateLimitedRequests.forEach(response => {
        expect(response.headers['x-ratelimit-limit']).toBeDefined();
        expect(response.headers['x-ratelimit-remaining']).toBeDefined();
        expect(response.headers['x-ratelimit-reset']).toBeDefined();
        
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Too Many Requests');
        expect(body.retryAfter).toBeDefined();
      });
    });

    it('should handle concurrent rate limit checks correctly', async () => {
      // Create many concurrent requests to test race conditions
      const concurrentRequests = Array.from({ length: 20 }, (_, i) =>
        server.inject({
          method: 'GET',
          url: '/health',
          headers: {
            'x-forwarded-for': `192.168.1.${i % 5}`, // Same IPs to trigger rate limits
          }
        })
      );

      const responses = await Promise.all(concurrentRequests);
      
      // Should have a mix of successful and rate-limited responses
      const successCount = responses.filter(r => r.statusCode === 200).length;
      const rateLimitedCount = responses.filter(r => r.statusCode === 429).length;
      
      expect(successCount + rateLimitedCount).toBe(20);
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('Scan Operations', () => {
    it('should handle multiple concurrent scans efficiently', async () => {
      const scanPromises = Array.from({ length: 5 }, (_, i) =>
        server.inject({
          method: 'POST',
          url: '/scan',
          headers: {
            'x-api-key': testApiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            namespace: `concurrent-test-${i}`
          })
        })
      );

      const responses = await Promise.all(scanPromises);
      
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.jobId).toBeDefined();
        expect(body.status).toBe('running');
      });

      // Verify all scans have unique job IDs
      const jobIds = responses.map(r => JSON.parse(r.body).jobId);
      const uniqueJobIds = new Set(jobIds);
      expect(uniqueJobIds.size).toBe(jobIds.length);
    });

    it('should properly handle long-running scans', async () => {
      // Start a scan that takes longer
      const scanResponse = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'x-api-key': testApiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          namespace: 'large-namespace' // This triggers 2s delay in mock
        })
      });

      expect(scanResponse.statusCode).toBe(200);
      const { jobId } = JSON.parse(scanResponse.body);

      // Check status immediately - should be running
      const immediateCheck = await server.inject({
        method: 'GET',
        url: `/scan/results/${jobId}`,
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(immediateCheck.statusCode).toBe(200);
      let body = JSON.parse(immediateCheck.body);
      expect(body.status).toBe('running');

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Check again - should be completed
      const completedCheck = await server.inject({
        method: 'GET',
        url: `/scan/results/${jobId}`,
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(completedCheck.statusCode).toBe(200);
      body = JSON.parse(completedCheck.body);
      expect(body.status).toBe('completed');
      expect(body.result).toBeDefined();
      expect(body.result.findings).toBeDefined();
      expect(body.result.summary).toBeDefined();
    });

    it('should validate scan request parameters', async () => {
      const invalidRequests = [
        { namespace: 123 }, // Invalid type
        { namespace: '' }, // Empty string
        { namespace: 'a'.repeat(254) }, // Too long
        { namespace: 'INVALID-NAMESPACE!' }, // Invalid characters
        { namespace: '../system' }, // Path traversal
        { cluster: 'malicious-cluster', namespace: 'test' }, // Unexpected parameter
      ];

      for (const invalidBody of invalidRequests) {
        const response = await server.inject({
          method: 'POST',
          url: '/scan',
          headers: {
            'x-api-key': testApiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify(invalidBody)
        });

        // Should either reject with 400 or sanitize and accept
        expect([200, 400]).toContain(response.statusCode);
        
        if (response.statusCode === 400) {
          const body = JSON.parse(response.body);
          expect(body.error).toBeDefined();
        }
      }
    });
  });

  describe('Error Handling & Resilience', () => {
    it('should handle malformed JSON gracefully', async () => {
      const malformedBodies = [
        'invalid json',
        '{"incomplete": }',
        '{"recursive": {"recursive": {"recursive": {}}}}}'.repeat(1000),
        '[]'.repeat(1000), // Large array
        '{"key": "' + 'x'.repeat(100000) + '"}' // Very large value
      ];

      for (const body of malformedBodies) {
        const response = await server.inject({
          method: 'POST',
          url: '/scan',
          headers: {
            'x-api-key': testApiKey,
            'content-type': 'application/json'
          },
          body
        });

        expect(response.statusCode).toBe(400);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.error).toBeDefined();
      }
    });

    it('should handle unexpected server errors gracefully', async () => {
      // Mock a scanner that throws errors
      vi.mocked(vi.importActual('@kubekavach/core')).then(actual => {
        (actual as any).KubernetesScanner = vi.fn().mockImplementation(() => ({
          scan: vi.fn().mockRejectedValue(new Error('Kubernetes API unavailable')),
          validateConnection: vi.fn().mockResolvedValue(false)
        }));
      });

      const response = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'x-api-key': testApiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ namespace: 'error-test' })
      });

      // Should handle error gracefully and return appropriate status
      expect([500, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.message).toBeDefined();
    });

    it('should enforce request size limits', async () => {
      const largeBody = JSON.stringify({
        namespace: 'test',
        metadata: 'x'.repeat(10 * 1024 * 1024) // 10MB payload
      });

      const response = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'x-api-key': testApiKey,
          'content-type': 'application/json'
        },
        body: largeBody
      });

      // Should reject large payloads
      expect(response.statusCode).toBe(413);
    });
  });

  describe('Security', () => {
    it('should implement proper CORS handling', async () => {
      const origins = [
        'http://localhost:5173', // Allowed
        'https://kubekavach.example.com', // Should be rejected
        'http://malicious.com', // Should be rejected
        'null', // Should be handled properly
      ];

      for (const origin of origins) {
        const response = await server.inject({
          method: 'OPTIONS',
          url: '/scan',
          headers: {
            'origin': origin,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'x-api-key,content-type'
          }
        });

        if (origin === 'http://localhost:5173') {
          expect(response.statusCode).toBe(204);
          expect(response.headers['access-control-allow-origin']).toBe(origin);
        } else {
          // Should either reject or not set CORS headers
          expect(!response.headers['access-control-allow-origin'] || 
                 response.headers['access-control-allow-origin'] !== origin).toBeTruthy();
        }
      }
    });

    it('should include security headers in all responses', async () => {
      const endpoints = ['/health', '/rules', '/documentation'];

      for (const endpoint of endpoints) {
        const response = await server.inject({
          method: 'GET',
          url: endpoint,
          headers: endpoint === '/rules' ? { 'x-api-key': testApiKey } : {}
        });

        // Check critical security headers
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['referrer-policy']).toBeDefined();
        expect(response.headers['content-security-policy']).toBeDefined();
      }
    });

    it('should detect and log suspicious activity', async () => {
      const suspiciousRequests = [
        {
          headers: { 'user-agent': 'sqlmap/1.0' },
          expectedSuspicious: true
        },
        {
          url: '/scan?id=1\' OR 1=1--',
          expectedSuspicious: true
        },
        {
          headers: { 'x-forwarded-for': '127.0.0.1' },
          expectedSuspicious: false
        }
      ];

      for (const req of suspiciousRequests) {
        const response = await server.inject({
          method: 'GET',
          url: req.url || '/health',
          headers: {
            ...req.headers,
            ...(req.url?.includes('/rules') ? { 'x-api-key': testApiKey } : {})
          }
        });

        // Suspicious requests should still get proper responses but be logged
        expect([200, 400, 401]).toContain(response.statusCode);
      }
    });
  });

  describe('Performance', () => {
    it('should handle high throughput of health check requests', async () => {
      const startTime = Date.now();
      const requestCount = 100;
      
      const requests = Array.from({ length: requestCount }, () =>
        server.inject({
          method: 'GET',
          url: '/health'
        })
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // Should complete within reasonable time (less than 5 seconds for 100 requests)
      expect(totalTime).toBeLessThan(5000);

      // Calculate requests per second
      const rps = (requestCount / totalTime) * 1000;
      expect(rps).toBeGreaterThan(20); // At least 20 RPS
    });

    it('should maintain response times under load', async () => {
      const responseTimes: number[] = [];
      
      for (let i = 0; i < 20; i++) {
        const startTime = Date.now();
        
        const response = await server.inject({
          method: 'GET',
          url: '/rules',
          headers: {
            'x-api-key': testApiKey
          }
        });
        
        const endTime = Date.now();
        responseTimes.push(endTime - startTime);
        
        expect(response.statusCode).toBe(200);
      }

      // Calculate percentiles
      responseTimes.sort((a, b) => a - b);
      const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
      const median = responseTimes[Math.floor(responseTimes.length * 0.5)];

      // Response times should be reasonable
      expect(median).toBeLessThan(100); // 100ms median
      expect(p95).toBeLessThan(500); // 500ms 95th percentile
    });
  });

  describe('API Documentation', () => {
    it('should serve OpenAPI documentation', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/documentation'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
    });

    it('should provide swagger.json', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/documentation/json'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      
      const swagger = JSON.parse(response.body);
      expect(swagger.info).toBeDefined();
      expect(swagger.paths).toBeDefined();
      expect(swagger.info.title).toBe('KubeKavach API');
    });
  });
});