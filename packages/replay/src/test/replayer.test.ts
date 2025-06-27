import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PodReplayer } from '../index';

// Mock Docker
vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      createContainer: vi.fn().mockResolvedValue({
        id: 'test-container-123',
        start: vi.fn().mockResolvedValue(undefined),
        logs: vi.fn().mockResolvedValue(Buffer.from('Container started successfully\nApplication running\n')),
        remove: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: false, ExitCode: 0 }
        })
      })),
      pull: vi.fn().mockImplementation((imageName, callback) => {
        callback(null, {
          on: vi.fn((event, handler) => {
            if (event === 'end') setTimeout(handler, 10);
          })
        });
      })
    }))
  };
});

// Mock Kubernetes client
vi.mock('@kubernetes/client-node', () => ({
  KubeConfig: vi.fn().mockImplementation(() => ({
    loadFromDefault: vi.fn(),
    makeApiClient: vi.fn().mockReturnValue({
      readNamespacedPod: vi.fn().mockResolvedValue({
        body: {
          metadata: {
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {
            containers: [{
              name: 'app',
              image: 'nginx:latest',
              env: [
                { name: 'ENV_VAR', value: 'test-value' }
              ],
              ports: [
                { containerPort: 80 }
              ],
              resources: {
                limits: { cpu: '500m', memory: '256Mi' },
                requests: { cpu: '100m', memory: '128Mi' }
              },
              securityContext: {
                runAsUser: 1000,
                runAsGroup: 1000
              }
            }]
          }
        }
      })
    })
  })),
  CoreV1Api: vi.fn()
}));

describe('PodReplayer', () => {
  let replayer: PodReplayer;

  beforeEach(() => {
    replayer = new PodReplayer();
    vi.clearAllMocks();
  });

  describe('Pod Replay', () => {
    it('should replay a pod successfully', async () => {
      const result = await replayer.replay('test-pod', 'default');

      expect(result.success).toBe(true);
      expect(result.containerId).toBe('test-container-123');
      expect(result.logs).toContain('Container started successfully');
      expect(result.logs).toContain('Application running');
    });

    it('should replay pod from default namespace when none specified', async () => {
      const result = await replayer.replay('test-pod');

      expect(result.success).toBe(true);
      expect(result.containerId).toBe('test-container-123');
    });

    it('should handle pod not found error', async () => {
      const { KubeConfig } = await import('@kubernetes/client-node');
      const mockKubeConfig = vi.mocked(KubeConfig);
      mockKubeConfig.mockImplementation(() => ({
        loadFromDefault: vi.fn(),
        makeApiClient: vi.fn().mockReturnValue({
          readNamespacedPod: vi.fn().mockRejectedValue({
            statusCode: 404,
            body: { message: 'Pod not found' }
          })
        })
      }) as any);

      const errorReplayer = new PodReplayer();

      await expect(errorReplayer.replay('non-existent-pod', 'default'))
        .rejects.toThrow('Pod not found: non-existent-pod in namespace default');
    });

    it('should handle kubernetes API errors', async () => {
      const { KubeConfig } = await import('@kubernetes/client-node');
      const mockKubeConfig = vi.mocked(KubeConfig);
      mockKubeConfig.mockImplementation(() => ({
        loadFromDefault: vi.fn(),
        makeApiClient: vi.fn().mockReturnValue({
          readNamespacedPod: vi.fn().mockRejectedValue(new Error('API Server unavailable'))
        })
      }) as any);

      const errorReplayer = new PodReplayer();

      await expect(errorReplayer.replay('test-pod', 'default'))
        .rejects.toThrow('Failed to get pod: API Server unavailable');
    });

    it('should handle Docker image pull failures', async () => {
      const Docker = await import('dockerode');
      const mockDocker = vi.mocked(Docker.default);
      mockDocker.mockImplementation(() => ({
        pull: vi.fn().mockImplementation((imageName, callback) => {
          callback(new Error('Image not found'), null);
        })
      }) as any);

      const errorReplayer = new PodReplayer();

      await expect(errorReplayer.replay('test-pod', 'default'))
        .rejects.toThrow('Failed to pull image nginx:latest: Image not found');
    });

    it('should handle Docker container creation failures', async () => {
      const Docker = await import('dockerode');
      const mockDocker = vi.mocked(Docker.default);
      mockDocker.mockImplementation(() => ({
        pull: vi.fn().mockImplementation((imageName, callback) => {
          callback(null, {
            on: vi.fn((event, handler) => {
              if (event === 'end') setTimeout(handler, 10);
            })
          });
        }),
        createContainer: vi.fn().mockRejectedValue(new Error('Container creation failed'))
      }) as any);

      const errorReplayer = new PodReplayer();

      await expect(errorReplayer.replay('test-pod', 'default'))
        .rejects.toThrow('Failed to create container: Container creation failed');
    });

    it('should handle container start failures', async () => {
      const Docker = await import('dockerode');
      const mockDocker = vi.mocked(Docker.default);
      mockDocker.mockImplementation(() => ({
        pull: vi.fn().mockImplementation((imageName, callback) => {
          callback(null, {
            on: vi.fn((event, handler) => {
              if (event === 'end') setTimeout(handler, 10);
            })
          });
        }),
        createContainer: vi.fn().mockResolvedValue({
          id: 'test-container-123',
          start: vi.fn().mockRejectedValue(new Error('Container failed to start')),
          remove: vi.fn().mockResolvedValue(undefined)
        })
      }) as any);

      const errorReplayer = new PodReplayer();

      await expect(errorReplayer.replay('test-pod', 'default'))
        .rejects.toThrow('Failed to start container: Container failed to start');
    });
  });

  describe('Container Configuration', () => {
    it('should properly map pod spec to container config', async () => {
      const Docker = await import('dockerode');
      const mockDocker = vi.mocked(Docker.default);
      let containerConfig: any;

      mockDocker.mockImplementation(() => ({
        pull: vi.fn().mockImplementation((imageName, callback) => {
          callback(null, {
            on: vi.fn((event, handler) => {
              if (event === 'end') setTimeout(handler, 10);
            })
          });
        }),
        createContainer: vi.fn().mockImplementation((config) => {
          containerConfig = config;
          return Promise.resolve({
            id: 'test-container-123',
            start: vi.fn().mockResolvedValue(undefined),
            logs: vi.fn().mockResolvedValue(Buffer.from('Container started\n')),
            remove: vi.fn().mockResolvedValue(undefined),
            inspect: vi.fn().mockResolvedValue({
              State: { Running: false, ExitCode: 0 }
            })
          });
        })
      }) as any);

      const testReplayer = new PodReplayer();
      await testReplayer.replay('test-pod', 'default');

      expect(containerConfig.Image).toBe('nginx:latest');
      expect(containerConfig.Env).toContain('ENV_VAR=test-value');
      expect(containerConfig.User).toBe('1000:1000');
    });

    it('should handle pods with multiple containers', async () => {
      const { KubeConfig } = await import('@kubernetes/client-node');
      const mockKubeConfig = vi.mocked(KubeConfig);
      mockKubeConfig.mockImplementation(() => ({
        loadFromDefault: vi.fn(),
        makeApiClient: vi.fn().mockReturnValue({
          readNamespacedPod: vi.fn().mockResolvedValue({
            body: {
              metadata: { name: 'multi-container-pod', namespace: 'default' },
              spec: {
                containers: [
                  { name: 'app', image: 'nginx:latest' },
                  { name: 'sidecar', image: 'redis:latest' }
                ]
              }
            }
          })
        })
      }) as any);

      const multiReplayer = new PodReplayer();
      
      // Should replay the first container by default
      const result = await multiReplayer.replay('multi-container-pod', 'default');
      expect(result.success).toBe(true);
    });

    it('should handle pods with no containers', async () => {
      const { KubeConfig } = await import('@kubernetes/client-node');
      const mockKubeConfig = vi.mocked(KubeConfig);
      mockKubeConfig.mockImplementation(() => ({
        loadFromDefault: vi.fn(),
        makeApiClient: vi.fn().mockReturnValue({
          readNamespacedPod: vi.fn().mockResolvedValue({
            body: {
              metadata: { name: 'empty-pod', namespace: 'default' },
              spec: { containers: [] }
            }
          })
        })
      }) as any);

      const emptyReplayer = new PodReplayer();
      
      await expect(emptyReplayer.replay('empty-pod', 'default'))
        .rejects.toThrow('Pod has no containers to replay');
    });
  });

  describe('Log Collection', () => {
    it('should collect and return container logs', async () => {
      const result = await replayer.replay('test-pod', 'default');

      expect(result.logs).toEqual([
        'Container started successfully',
        'Application running'
      ]);
    });

    it('should handle containers with no logs', async () => {
      const Docker = await import('dockerode');
      const mockDocker = vi.mocked(Docker.default);
      mockDocker.mockImplementation(() => ({
        pull: vi.fn().mockImplementation((imageName, callback) => {
          callback(null, {
            on: vi.fn((event, handler) => {
              if (event === 'end') setTimeout(handler, 10);
            })
          });
        }),
        createContainer: vi.fn().mockResolvedValue({
          id: 'test-container-123',
          start: vi.fn().mockResolvedValue(undefined),
          logs: vi.fn().mockResolvedValue(Buffer.from('')),
          remove: vi.fn().mockResolvedValue(undefined),
          inspect: vi.fn().mockResolvedValue({
            State: { Running: false, ExitCode: 0 }
          })
        })
      }) as any);

      const noLogsReplayer = new PodReplayer();
      const result = await noLogsReplayer.replay('test-pod', 'default');

      expect(result.logs).toEqual([]);
    });
  });

  describe('Cleanup', () => {
    it('should clean up containers after replay', async () => {
      const Docker = await import('dockerode');
      const mockDocker = vi.mocked(Docker.default);
      const mockRemove = vi.fn().mockResolvedValue(undefined);

      mockDocker.mockImplementation(() => ({
        pull: vi.fn().mockImplementation((imageName, callback) => {
          callback(null, {
            on: vi.fn((event, handler) => {
              if (event === 'end') setTimeout(handler, 10);
            })
          });
        }),
        createContainer: vi.fn().mockResolvedValue({
          id: 'test-container-123',
          start: vi.fn().mockResolvedValue(undefined),
          logs: vi.fn().mockResolvedValue(Buffer.from('test logs\n')),
          remove: mockRemove,
          inspect: vi.fn().mockResolvedValue({
            State: { Running: false, ExitCode: 0 }
          })
        })
      }) as any);

      const cleanupReplayer = new PodReplayer();
      await cleanupReplayer.replay('test-pod', 'default');

      expect(mockRemove).toHaveBeenCalled();
    });

    it('should clean up even if container fails', async () => {
      const Docker = await import('dockerode');
      const mockDocker = vi.mocked(Docker.default);
      const mockRemove = vi.fn().mockResolvedValue(undefined);

      mockDocker.mockImplementation(() => ({
        pull: vi.fn().mockImplementation((imageName, callback) => {
          callback(null, {
            on: vi.fn((event, handler) => {
              if (event === 'end') setTimeout(handler, 10);
            })
          });
        }),
        createContainer: vi.fn().mockResolvedValue({
          id: 'test-container-123',
          start: vi.fn().mockRejectedValue(new Error('Start failed')),
          remove: mockRemove
        })
      }) as any);

      const failReplayer = new PodReplayer();
      
      await expect(failReplayer.replay('test-pod', 'default'))
        .rejects.toThrow('Failed to start container: Start failed');

      expect(mockRemove).toHaveBeenCalled();
    });
  });
});