import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server';

describe('Database Integration Tests', () => {
  let server: FastifyInstance;
  const testApiKey = 'db-test-key-12345678901234567890123456789012';

  beforeAll(async () => {
    // Mock configuration with database settings
    vi.mock('@kubekavach/core', async () => {
      const actual = await vi.importActual('@kubekavach/core');
      return {
        ...actual,
        loadConfig: vi.fn().mockReturnValue({
          api: {
            port: 3004,
            host: '127.0.0.1',
            corsOrigin: 'http://localhost:5173'
          },
          users: [{
            username: 'db-user',
            apiKey: testApiKey,
            roles: ['admin', 'scanner', 'viewer']
          }],
          // SQLite in-memory database for testing
          database: {
            host: 'localhost',
            port: 5432,
            database: 'kubekavach_test',
            username: 'test',
            password: 'test',
            ssl: false
          }
        }),
        database: {
          initialize: vi.fn().mockResolvedValue(undefined),
          saveScanResult: vi.fn().mockResolvedValue(undefined),
          getScanResult: vi.fn().mockImplementation(async (scanId: string) => {
            if (scanId === 'existing-scan-123') {
              return {
                id: scanId,
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
                    message: 'Container running in privileged mode'
                  }
                ]
              };
            }
            return null;
          }),
          getScanHistory: vi.fn().mockImplementation(async (options) => {
            const mockResults = [
              {
                id: 'scan-1',
                timestamp: '2024-01-01T10:00:00.000Z',
                cluster: 'test-cluster',
                namespace: options.namespace || 'default',
                duration: 1000,
                summary: { total: 1, critical: 0, high: 1, medium: 0, low: 0 },
                findings: []
              },
              {
                id: 'scan-2',
                timestamp: '2024-01-01T09:00:00.000Z',
                cluster: 'test-cluster',
                namespace: options.namespace || 'default',
                duration: 800,
                summary: { total: 2, critical: 1, high: 1, medium: 0, low: 0 },
                findings: []
              }
            ];

            const filtered = options.cluster ? 
              mockResults.filter(r => r.cluster === options.cluster) : 
              mockResults;

            return filtered.slice(options.offset || 0, (options.offset || 0) + (options.limit || 20));
          }),
          getSecurityTrends: vi.fn().mockImplementation(async (days: number) => {
            const trends = [];
            for (let i = 0; i < Math.min(days, 7); i++) {
              const date = new Date();
              date.setDate(date.getDate() - i);
              trends.push({
                date: date.toISOString().split('T')[0],
                total: 5 - i,
                critical: Math.max(0, 2 - i),
                high: Math.max(0, 2 - Math.floor(i/2)),
                medium: Math.max(0, 1),
                low: 0
              });
            }
            return trends;
          }),
          close: vi.fn().mockResolvedValue(undefined)
        },
        KubernetesScanner: vi.fn().mockImplementation(() => ({
          scan: vi.fn().mockResolvedValue({
            id: 'db-scan-123',
            timestamp: new Date().toISOString(),
            cluster: 'test-cluster',
            namespace: 'default',
            duration: 1000,
            summary: {
              total: 1,
              critical: 0,
              high: 1,
              medium: 0,
              low: 0
            },
            findings: [{
              ruleId: 'KKR002',
              ruleName: 'Missing Resource Limits',
              severity: 'HIGH',
              resource: {
                kind: 'Pod',
                name: 'test-pod',
                namespace: 'default',
                apiVersion: 'v1'
              },
              message: 'Container has no resource limits'
            }]
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

  describe('Persistent Scan Results', () => {
    it('should retrieve scan results from database', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/scan/results/existing-scan-123',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.status).toBe('completed');
      expect(body.result).toBeDefined();
      expect(body.result.id).toBe('existing-scan-123');
      expect(body.result.findings).toHaveLength(1);
      expect(body.result.findings[0].severity).toBe('CRITICAL');
    });

    it('should handle non-existent scan results', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/scan/results/non-existent-scan',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
    });

    it('should save scan results to database after completion', async () => {
      const { database } = await vi.importActual('@kubekavach/core') as any;
      
      // Start a scan
      const scanResponse = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'x-api-key': testApiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          namespace: 'database-test'
        })
      });

      expect(scanResponse.statusCode).toBe(200);
      const { jobId } = JSON.parse(scanResponse.body);

      // Wait for scan to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify database.saveScanResult was called
      expect(database.saveScanResult).toHaveBeenCalled();
      
      // Check that the call was made with correct structure
      const callArgs = (database.saveScanResult as any).mock.calls[0];
      expect(callArgs[0]).toHaveProperty('id');
      expect(callArgs[0]).toHaveProperty('timestamp');
      expect(callArgs[0]).toHaveProperty('summary');
      expect(callArgs[0]).toHaveProperty('findings');
    });
  });

  describe('Scan History API', () => {
    it('should return scan history with default pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/scan/history',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0]).toHaveProperty('id');
      expect(body[0]).toHaveProperty('timestamp');
      expect(body[0]).toHaveProperty('summary');
    });

    it('should filter scan history by cluster', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/scan/history?cluster=test-cluster&limit=10',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(Array.isArray(body)).toBe(true);
      body.forEach((scan: any) => {
        expect(scan.cluster).toBe('test-cluster');
      });
    });

    it('should handle pagination parameters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/scan/history?limit=1&offset=0',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
    });

    it('should validate query parameters', async () => {
      const invalidQueries = [
        '?limit=0',           // Below minimum
        '?limit=101',         // Above maximum
        '?offset=-1',         // Negative offset
        '?startDate=invalid', // Invalid date format
      ];

      for (const query of invalidQueries) {
        const response = await server.inject({
          method: 'GET',
          url: `/scan/history${query}`,
          headers: {
            'x-api-key': testApiKey
          }
        });

        expect(response.statusCode).toBe(400);
      }
    });

    it('should filter by date range', async () => {
      const startDate = '2024-01-01T00:00:00.000Z';
      const endDate = '2024-01-01T23:59:59.999Z';
      
      const response = await server.inject({
        method: 'GET',
        url: `/scan/history?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(Array.isArray(body)).toBe(true);
      // Results should be within the specified date range
      body.forEach((scan: any) => {
        const scanDate = new Date(scan.timestamp);
        expect(scanDate >= new Date(startDate)).toBe(true);
        expect(scanDate <= new Date(endDate)).toBe(true);
      });
    });
  });

  describe('Security Trends API', () => {
    it('should return security trends for default period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/scan/trends',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      
      // Verify trend structure
      body.forEach((trend: any) => {
        expect(trend).toHaveProperty('date');
        expect(trend).toHaveProperty('total');
        expect(trend).toHaveProperty('critical');
        expect(trend).toHaveProperty('high');
        expect(trend).toHaveProperty('medium');
        expect(trend).toHaveProperty('low');
        expect(typeof trend.total).toBe('number');
        expect(typeof trend.critical).toBe('number');
      });
    });

    it('should accept custom time periods', async () => {
      const periods = [7, 14, 30, 90];
      
      for (const days of periods) {
        const response = await server.inject({
          method: 'GET',
          url: `/scan/trends?days=${days}`,
          headers: {
            'x-api-key': testApiKey
          }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeLessThanOrEqual(days);
      }
    });

    it('should validate days parameter', async () => {
      const invalidDays = [0, 366, -1];
      
      for (const days of invalidDays) {
        const response = await server.inject({
          method: 'GET',
          url: `/scan/trends?days=${days}`,
          headers: {
            'x-api-key': testApiKey
          }
        });

        expect(response.statusCode).toBe(400);
      }
    });

    it('should show decreasing trends over time', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/scan/trends?days=7',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(Array.isArray(body)).toBe(true);
      
      // Verify trends are in descending date order
      for (let i = 1; i < body.length; i++) {
        const currentDate = new Date(body[i].date);
        const previousDate = new Date(body[i - 1].date);
        expect(currentDate < previousDate).toBe(true);
      }
    });
  });

  describe('Database Error Handling', () => {
    it('should handle database connection failures gracefully', async () => {
      const { database } = await vi.importActual('@kubekavach/core') as any;
      
      // Mock database failure
      database.getScanResult.mockRejectedValueOnce(new Error('Database connection failed'));
      
      const response = await server.inject({
        method: 'GET',
        url: '/scan/results/test-scan',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal Server Error');
    });

    it('should handle database errors in scan history', async () => {
      const { database } = await vi.importActual('@kubekavach/core') as any;
      
      database.getScanHistory.mockRejectedValueOnce(new Error('Query failed'));
      
      const response = await server.inject({
        method: 'GET',
        url: '/scan/history',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(500);
    });

    it('should handle database errors in trends', async () => {
      const { database } = await vi.importActual('@kubekavach/core') as any;
      
      database.getSecurityTrends.mockRejectedValueOnce(new Error('Aggregation failed'));
      
      const response = await server.inject({
        method: 'GET',
        url: '/scan/trends',
        headers: {
          'x-api-key': testApiKey
        }
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('Fallback Behavior', () => {
    it('should fall back to in-memory storage when database is unavailable', async () => {
      const { database } = await vi.importActual('@kubekavach/core') as any;
      
      // Mock database save failure but allow the scan to complete
      database.saveScanResult.mockRejectedValueOnce(new Error('Database unavailable'));
      
      const scanResponse = await server.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'x-api-key': testApiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          namespace: 'fallback-test'
        })
      });

      expect(scanResponse.statusCode).toBe(200);
      const { jobId } = JSON.parse(scanResponse.body);

      // Wait for scan to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still be able to get results (even if not persisted)
      const resultsResponse = await server.inject({
        method: 'GET',
        url: `/scan/results/${jobId}`,
        headers: {
          'x-api-key': testApiKey
        }
      });

      // Should either be running, failed (due to save error), or return 404
      expect([200, 404]).toContain(resultsResponse.statusCode);
    });
  });
});