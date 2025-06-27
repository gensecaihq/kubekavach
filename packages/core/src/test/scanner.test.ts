import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KubernetesScanner } from '../utils/scanner';
import { loadConfig } from '../utils/config-loader';

// Mock dependencies
vi.mock('../utils/config-loader', () => ({
  loadConfig: vi.fn().mockReturnValue({
    kubeconfig: '~/.kube/config',
    rules: {
      enabled: ['KKR001', 'KKR002', 'KKR003']
    }
  })
}));

vi.mock('@kubernetes/client-node', () => ({
  KubeConfig: vi.fn().mockImplementation(() => ({
    loadFromDefault: vi.fn(),
    makeApiClient: vi.fn().mockReturnValue({
      listPodForAllNamespaces: vi.fn().mockResolvedValue({
        body: {
          items: [
            {
              metadata: { name: 'test-pod-1', namespace: 'default' },
              spec: {
                containers: [{
                  name: 'app',
                  image: 'nginx:latest',
                  securityContext: { privileged: true }
                }]
              }
            },
            {
              metadata: { name: 'test-pod-2', namespace: 'default' },
              spec: {
                containers: [{
                  name: 'app',
                  image: 'redis:latest',
                  resources: {}
                }]
              }
            }
          ]
        }
      }),
      listNamespacedPod: vi.fn().mockResolvedValue({
        body: {
          items: [
            {
              metadata: { name: 'test-pod-1', namespace: 'test-ns' },
              spec: {
                containers: [{
                  name: 'app',
                  image: 'nginx:latest',
                  securityContext: { privileged: true }
                }]
              }
            }
          ]
        }
      })
    }),
    getCurrentCluster: vi.fn().mockReturnValue({
      name: 'test-cluster'
    })
  })),
  CoreV1Api: vi.fn(),
  AppsV1Api: vi.fn(),
  BatchV1Api: vi.fn()
}));

vi.mock('@kubekavach/rules', () => ({
  allRules: [
    {
      id: 'KKR001',
      name: 'Privileged Container',
      description: 'Detects privileged containers',
      severity: 'CRITICAL',
      category: 'Pod Security',
      validate: vi.fn().mockImplementation((resource) => {
        if (resource.kind !== 'Pod') return true;
        return !resource.spec?.containers?.some((c: any) => c.securityContext?.privileged);
      }),
      getFinding: vi.fn().mockReturnValue({
        ruleId: 'KKR001',
        ruleName: 'Privileged Container',
        severity: 'CRITICAL',
        resource: { kind: 'Pod', name: 'test-pod-1', namespace: 'default' },
        message: 'Container is running in privileged mode'
      })
    },
    {
      id: 'KKR002',
      name: 'Missing Resource Limits',
      description: 'Detects containers without resource limits',
      severity: 'HIGH',
      category: 'Resource Management',
      validate: vi.fn().mockImplementation((resource) => {
        if (resource.kind !== 'Pod') return true;
        return resource.spec?.containers?.every((c: any) => 
          c.resources?.limits?.cpu && c.resources?.limits?.memory
        );
      }),
      getFinding: vi.fn().mockReturnValue({
        ruleId: 'KKR002',
        ruleName: 'Missing Resource Limits',
        severity: 'HIGH',
        resource: { kind: 'Pod', name: 'test-pod-2', namespace: 'default' },
        message: 'Container is missing resource limits'
      })
    },
    {
      id: 'KKR003',
      name: 'Disabled Rule',
      description: 'This rule is disabled',
      severity: 'LOW',
      category: 'Test',
      validate: vi.fn().mockReturnValue(false),
      getFinding: vi.fn().mockReturnValue({
        ruleId: 'KKR003',
        ruleName: 'Disabled Rule',
        severity: 'LOW',
        resource: { kind: 'Pod', name: 'test-pod', namespace: 'default' },
        message: 'This should not appear'
      })
    }
  ]
}));

describe('KubernetesScanner', () => {
  let scanner: KubernetesScanner;

  beforeEach(() => {
    scanner = new KubernetesScanner();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(scanner).toBeInstanceOf(KubernetesScanner);
      expect(loadConfig).toHaveBeenCalled();
    });

    it('should initialize with custom configuration', () => {
      const customConfig = {
        kubeconfig: '/custom/path/config',
        rules: { enabled: ['KKR001'] }
      };

      const customScanner = new KubernetesScanner(customConfig);
      expect(customScanner).toBeInstanceOf(KubernetesScanner);
    });
  });

  describe('Cluster Scanning', () => {
    it('should scan all namespaces when no namespace specified', async () => {
      const result = await scanner.scan();

      expect(result.summary.total).toBe(2);
      expect(result.summary.critical).toBe(1);
      expect(result.summary.high).toBe(1);
      expect(result.summary.medium).toBe(0);
      expect(result.summary.low).toBe(0);
      expect(result.findings).toHaveLength(2);
    });

    it('should scan specific namespace when specified', async () => {
      const result = await scanner.scan('test-ns');

      expect(result.summary.total).toBe(1);
      expect(result.summary.critical).toBe(1);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].resource.namespace).toBe('test-ns');
    });

    it('should filter by specific rules when provided', async () => {
      const result = await scanner.scan(undefined, ['KKR001']);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].ruleId).toBe('KKR001');
    });

    it('should return cluster information', async () => {
      const result = await scanner.scan();

      expect(result.cluster).toBe('test-cluster');
      expect(result.timestamp).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should handle empty clusters', async () => {
      const { KubeConfig } = await import('@kubernetes/client-node');
      const mockKubeConfig = vi.mocked(KubeConfig);
      mockKubeConfig.mockImplementation(() => ({
        loadFromDefault: vi.fn(),
        makeApiClient: vi.fn().mockReturnValue({
          listPodForAllNamespaces: vi.fn().mockResolvedValue({
            body: { items: [] }
          })
        }),
        getCurrentCluster: vi.fn().mockReturnValue({
          name: 'empty-cluster'
        })
      }) as any);

      const emptyScanner = new KubernetesScanner();
      const result = await emptyScanner.scan();

      expect(result.summary.total).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Rule Processing', () => {
    it('should only run enabled rules', async () => {
      const { allRules } = await import('@kubekavach/rules');
      const result = await scanner.scan();

      // Should only run rules KKR001 and KKR002 (enabled), not KKR003
      expect(allRules[0].validate).toHaveBeenCalled();
      expect(allRules[1].validate).toHaveBeenCalled();
      expect(allRules[2].validate).not.toHaveBeenCalled();
    });

    it('should handle rule validation errors gracefully', async () => {
      const { allRules } = await import('@kubekavach/rules');
      const mockRule = allRules[0];
      mockRule.validate.mockImplementation(() => {
        throw new Error('Rule validation failed');
      });

      const result = await scanner.scan();

      // Should continue processing other rules despite error
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('should generate findings for failed validations', async () => {
      const result = await scanner.scan();

      expect(result.findings[0]).toMatchObject({
        ruleId: 'KKR001',
        ruleName: 'Privileged Container',
        severity: 'CRITICAL',
        resource: {
          kind: 'Pod',
          name: 'test-pod-1',
          namespace: expect.any(String)
        },
        message: expect.any(String)
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle Kubernetes API errors', async () => {
      const { KubeConfig } = await import('@kubernetes/client-node');
      const mockKubeConfig = vi.mocked(KubeConfig);
      mockKubeConfig.mockImplementation(() => ({
        loadFromDefault: vi.fn(),
        makeApiClient: vi.fn().mockReturnValue({
          listPodForAllNamespaces: vi.fn().mockRejectedValue(new Error('API Server unavailable'))
        }),
        getCurrentCluster: vi.fn().mockReturnValue({
          name: 'test-cluster'
        })
      }) as any);

      const errorScanner = new KubernetesScanner();

      await expect(errorScanner.scan())
        .rejects.toThrow('Failed to scan cluster: API Server unavailable');
    });

    it('should handle kubeconfig loading errors', async () => {
      const { KubeConfig } = await import('@kubernetes/client-node');
      const mockKubeConfig = vi.mocked(KubeConfig);
      mockKubeConfig.mockImplementation(() => ({
        loadFromDefault: vi.fn().mockImplementation(() => {
          throw new Error('Kubeconfig not found');
        }),
        makeApiClient: vi.fn(),
        getCurrentCluster: vi.fn()
      }) as any);

      expect(() => new KubernetesScanner())
        .toThrow('Failed to load kubeconfig: Kubeconfig not found');
    });

    it('should handle namespace not found errors', async () => {
      const { KubeConfig } = await import('@kubernetes/client-node');
      const mockKubeConfig = vi.mocked(KubeConfig);
      mockKubeConfig.mockImplementation(() => ({
        loadFromDefault: vi.fn(),
        makeApiClient: vi.fn().mockReturnValue({
          listNamespacedPod: vi.fn().mockRejectedValue({
            statusCode: 404,
            body: { message: 'Namespace not found' }
          })
        }),
        getCurrentCluster: vi.fn().mockReturnValue({
          name: 'test-cluster'
        })
      }) as any);

      const nsScanner = new KubernetesScanner();

      await expect(nsScanner.scan('non-existent-ns'))
        .rejects.toThrow('Namespace not found: non-existent-ns');
    });
  });

  describe('Performance', () => {
    it('should complete scan within reasonable time', async () => {
      const startTime = Date.now();
      const result = await scanner.scan();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
      expect(result.duration).toBeLessThan(5000);
    });

    it('should handle large number of resources', async () => {
      const { KubeConfig } = await import('@kubernetes/client-node');
      const mockKubeConfig = vi.mocked(KubeConfig);
      
      // Create 100 mock pods
      const largePodList = Array.from({ length: 100 }, (_, i) => ({
        metadata: { name: `pod-${i}`, namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: { privileged: i % 2 === 0 }
          }]
        }
      }));

      mockKubeConfig.mockImplementation(() => ({
        loadFromDefault: vi.fn(),
        makeApiClient: vi.fn().mockReturnValue({
          listPodForAllNamespaces: vi.fn().mockResolvedValue({
            body: { items: largePodList }
          })
        }),
        getCurrentCluster: vi.fn().mockReturnValue({
          name: 'large-cluster'
        })
      }) as any);

      const largeScanner = new KubernetesScanner();
      const result = await largeScanner.scan();

      expect(result.summary.total).toBeGreaterThan(0);
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });

  describe('Summary Generation', () => {
    it('should generate accurate summary counts', async () => {
      const result = await scanner.scan();

      const criticalCount = result.findings.filter(f => f.severity === 'CRITICAL').length;
      const highCount = result.findings.filter(f => f.severity === 'HIGH').length;
      const mediumCount = result.findings.filter(f => f.severity === 'MEDIUM').length;
      const lowCount = result.findings.filter(f => f.severity === 'LOW').length;

      expect(result.summary.critical).toBe(criticalCount);
      expect(result.summary.high).toBe(highCount);
      expect(result.summary.medium).toBe(mediumCount);
      expect(result.summary.low).toBe(lowCount);
      expect(result.summary.total).toBe(criticalCount + highCount + mediumCount + lowCount);
    });

    it('should handle zero findings', async () => {
      const { allRules } = await import('@kubekavach/rules');
      
      // Mock all rules to pass validation
      allRules.forEach(rule => {
        rule.validate.mockReturnValue(true);
      });

      const result = await scanner.scan();

      expect(result.summary.total).toBe(0);
      expect(result.summary.critical).toBe(0);
      expect(result.summary.high).toBe(0);
      expect(result.summary.medium).toBe(0);
      expect(result.summary.low).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });
});