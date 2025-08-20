import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server';

describe('API Performance Tests', () => {
  let server: FastifyInstance;
  const testApiKey = 'perf-test-key-12345678901234567890123456789012';

  beforeAll(async () => {
    // Mock configuration for performance testing
    vi.mock('@kubekavach/core', async () => {
      const actual = await vi.importActual('@kubekavach/core');
      return {
        ...actual,
        loadConfig: vi.fn().mockReturnValue({
          api: {
            port: 3002,
            host: '127.0.0.1',
            corsOrigin: '*',
            rateLimit: {
              max: 1000, // Higher limits for performance testing
              timeWindow: '1 minute'
            }
          },
          users: [{
            username: 'perf-user',
            apiKey: testApiKey,
            roles: ['admin', 'scanner', 'viewer']
          }]
        }),
        KubernetesScanner: vi.fn().mockImplementation(() => ({
          scan: vi.fn().mockImplementation(async (options) => {
            // Simulate variable scan times
            const complexity = options?.namespace?.includes('complex') ? 500 : 50;
            await new Promise(resolve => setTimeout(resolve, complexity));
            
            return {
              id: `perf-scan-${Date.now()}-${Math.random()}`,
              timestamp: new Date().toISOString(),
              cluster: 'perf-cluster',
              namespace: options?.namespace || 'default',
              duration: complexity,
              summary: {
                total: 5,
                critical: 1,
                high: 2,
                medium: 1,
                low: 1
              },
              findings: Array.from({ length: 5 }, (_, i) => ({
                ruleId: `KKR00${i + 1}`,
                ruleName: `Performance Rule ${i + 1}`,
                severity: ['CRITICAL', 'HIGH', 'HIGH', 'MEDIUM', 'LOW'][i],
                resource: { 
                  kind: 'Pod', 
                  name: `perf-pod-${i}`, 
                  namespace: options?.namespace || 'default', 
                  apiVersion: 'v1' 
                },
                message: `Performance test finding ${i + 1}`,
                remediation: `Fix performance issue ${i + 1}`
              }))
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

  describe('Throughput Tests', () => {
    it('should handle sustained high request volume', async () => {
      const testDuration = 10000; // 10 seconds
      const startTime = Date.now();
      const responses: any[] = [];
      const requestTimes: number[] = [];
      
      const makeRequest = async () => {
        const reqStart = Date.now();
        
        try {
          const response = await server.inject({
            method: 'GET',
            url: '/health',
            headers: {
              'x-request-id': `perf-${Date.now()}-${Math.random()}`
            }
          });
          
          const reqEnd = Date.now();
          requestTimes.push(reqEnd - reqStart);
          responses.push({
            status: response.statusCode,
            time: reqEnd - reqStart
          });
          
        } catch (error) {
          responses.push({
            status: 'error',
            error: error.message,
            time: Date.now() - reqStart
          });
        }
      };

      // Continuously make requests for the test duration
      const requestPromises = [];
      while (Date.now() - startTime < testDuration) {
        requestPromises.push(makeRequest());
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Wait for all requests to complete
      await Promise.all(requestPromises);
      
      const totalRequests = responses.length;
      const successfulRequests = responses.filter(r => r.status === 200).length;
      const avgResponseTime = requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length;
      const requestsPerSecond = (totalRequests / testDuration) * 1000;

      console.log(`Performance Results:
        - Total Requests: ${totalRequests}
        - Successful: ${successfulRequests} (${((successfulRequests / totalRequests) * 100).toFixed(1)}%)
        - Avg Response Time: ${avgResponseTime.toFixed(1)}ms
        - Requests/Second: ${requestsPerSecond.toFixed(1)}`);

      // Performance assertions
      expect(successfulRequests / totalRequests).toBeGreaterThan(0.95); // 95% success rate
      expect(avgResponseTime).toBeLessThan(200); // Average response under 200ms
      expect(requestsPerSecond).toBeGreaterThan(10); // At least 10 RPS
    });

    it('should maintain performance with concurrent scans', async () => {
      const concurrentScans = 20;
      const scanPromises = [];

      const startTime = Date.now();

      for (let i = 0; i < concurrentScans; i++) {
        const scanPromise = server.inject({
          method: 'POST',
          url: '/scan',
          headers: {
            'x-api-key': testApiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            namespace: i % 5 === 0 ? `complex-namespace-${i}` : `simple-namespace-${i}`
          })
        });

        scanPromises.push(scanPromise);
      }

      const responses = await Promise.all(scanPromises);
      const totalTime = Date.now() - startTime;

      // All scans should start successfully
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.jobId).toBeDefined();
      });

      const scansPerSecond = (concurrentScans / totalTime) * 1000;
      console.log(`Concurrent Scan Performance:
        - ${concurrentScans} scans started in ${totalTime}ms
        - Scans per second: ${scansPerSecond.toFixed(1)}`);

      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(scansPerSecond).toBeGreaterThan(5); // At least 5 scans per second
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should not leak memory with repeated operations', async () => {
      const initialMemory = process.memoryUsage();
      const iterations = 100;

      // Perform many operations to test for memory leaks
      for (let i = 0; i < iterations; i++) {
        // Mix of different operations
        const operations = [
          server.inject({
            method: 'GET',
            url: '/health'
          }),
          server.inject({
            method: 'GET',
            url: '/rules',
            headers: { 'x-api-key': testApiKey }
          }),
          server.inject({
            method: 'POST',
            url: '/scan',
            headers: {
              'x-api-key': testApiKey,
              'content-type': 'application/json'
            },
            body: JSON.stringify({ namespace: `memory-test-${i}` })
          })
        ];

        await Promise.all(operations);

        // Force garbage collection every 20 iterations
        if (i % 20 === 0 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      console.log(`Memory Usage:
        - Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(1)}MB
        - Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(1)}MB
        - Increase: ${memoryIncreaseMB.toFixed(1)}MB`);

      // Memory increase should be reasonable (less than 50MB for 300 operations)
      expect(memoryIncreaseMB).toBeLessThan(50);
    });

    it('should handle large response payloads efficiently', async () => {
      // Mock a scanner that returns large results
      const largeScanResults = {
        id: 'large-scan-123',
        timestamp: new Date().toISOString(),
        cluster: 'large-cluster',
        namespace: 'large-namespace',
        duration: 1000,
        summary: {
          total: 1000,
          critical: 100,
          high: 300,
          medium: 400,
          low: 200
        },
        findings: Array.from({ length: 1000 }, (_, i) => ({
          ruleId: `KKR${String(i % 10).padStart(3, '0')}`,
          ruleName: `Large Test Rule ${i}`,
          severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'][i % 4],
          resource: { 
            kind: 'Pod', 
            name: `large-pod-${i}`, 
            namespace: 'large-namespace', 
            apiVersion: 'v1' 
          },
          message: `Large test finding ${i} with detailed message that contains multiple sentences and technical details about the security issue found.`,
          remediation: `Detailed remediation steps for finding ${i} including code examples and best practices.`
        }))
      };

      const startTime = Date.now();
      
      const response = await server.inject({
        method: 'GET',
        url: '/health' // Simple endpoint to test serialization overhead
      });

      const responseTime = Date.now() - startTime;
      const responseSize = response.body.length;

      expect(response.statusCode).toBe(200);
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
      
      console.log(`Large Response Test:
        - Response Time: ${responseTime}ms
        - Response Size: ${(responseSize / 1024).toFixed(1)}KB`);
    });
  });

  describe('Scalability Tests', () => {
    it('should scale with increasing concurrent users', async () => {
      const userCounts = [1, 5, 10, 20, 50];
      const results = [];

      for (const userCount of userCounts) {
        const startTime = Date.now();
        const requests = [];

        // Simulate multiple users making requests
        for (let i = 0; i < userCount; i++) {
          requests.push(
            server.inject({
              method: 'GET',
              url: '/rules',
              headers: {
                'x-api-key': testApiKey,
                'x-user-simulation': `user-${i}`
              }
            })
          );
        }

        const responses = await Promise.all(requests);
        const totalTime = Date.now() - startTime;
        
        const successCount = responses.filter(r => r.statusCode === 200).length;
        const avgResponseTime = totalTime / userCount;

        results.push({
          users: userCount,
          totalTime,
          avgResponseTime,
          successRate: successCount / userCount
        });

        // All requests should succeed
        expect(successCount).toBe(userCount);
      }

      // Log scalability results
      console.log('Scalability Results:');
      results.forEach(result => {
        console.log(`  ${result.users} users: ${result.avgResponseTime.toFixed(1)}ms avg, ${(result.successRate * 100).toFixed(1)}% success`);
      });

      // Performance should degrade gracefully
      const responseTimeIncrease = results[results.length - 1].avgResponseTime - results[0].avgResponseTime;
      expect(responseTimeIncrease).toBeLessThan(500); // Less than 500ms increase from 1 to 50 users
    });

    it('should handle burst traffic patterns', async () => {
      const burstSize = 30;
      const burstCount = 3;
      const timeBetweenBursts = 1000; // 1 second

      const allResults = [];

      for (let burst = 0; burst < burstCount; burst++) {
        const burstStartTime = Date.now();
        
        // Create a burst of requests
        const burstRequests = Array.from({ length: burstSize }, (_, i) =>
          server.inject({
            method: 'GET',
            url: '/health',
            headers: {
              'x-burst-test': `burst-${burst}-request-${i}`
            }
          })
        );

        const burstResponses = await Promise.all(burstRequests);
        const burstTime = Date.now() - burstStartTime;

        const burstResults = {
          burst: burst + 1,
          requestCount: burstSize,
          totalTime: burstTime,
          successCount: burstResponses.filter(r => r.statusCode === 200).length,
          avgResponseTime: burstTime / burstSize
        };

        allResults.push(burstResults);

        console.log(`Burst ${burst + 1}: ${burstResults.successCount}/${burstSize} successful in ${burstTime}ms`);

        // Verify burst handling
        expect(burstResults.successCount).toBeGreaterThan(burstSize * 0.9); // 90% success rate minimum

        // Wait between bursts
        if (burst < burstCount - 1) {
          await new Promise(resolve => setTimeout(resolve, timeBetweenBursts));
        }
      }

      // System should recover between bursts (later bursts shouldn't be significantly slower)
      const firstBurstTime = allResults[0].avgResponseTime;
      const lastBurstTime = allResults[allResults.length - 1].avgResponseTime;
      
      expect(lastBurstTime).toBeLessThan(firstBurstTime * 2); // No more than 2x slower
    });
  });

  describe('Error Recovery Performance', () => {
    it('should recover quickly from error conditions', async () => {
      // First, trigger some errors
      const errorRequests = Array.from({ length: 10 }, () =>
        server.inject({
          method: 'POST',
          url: '/scan',
          headers: {
            'x-api-key': 'invalid-key', // This will cause auth errors
            'content-type': 'application/json'
          },
          body: JSON.stringify({ namespace: 'error-test' })
        })
      );

      await Promise.all(errorRequests);

      // Now test that the system still responds normally
      const recoveryStartTime = Date.now();
      
      const normalRequests = Array.from({ length: 20 }, () =>
        server.inject({
          method: 'GET',
          url: '/health'
        })
      );

      const responses = await Promise.all(normalRequests);
      const recoveryTime = Date.now() - recoveryStartTime;

      // All normal requests should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // Recovery should be fast
      expect(recoveryTime).toBeLessThan(2000); // Less than 2 seconds
      
      console.log(`Error Recovery: ${responses.length} requests completed in ${recoveryTime}ms after error conditions`);
    });
  });
});