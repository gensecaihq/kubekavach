
import { describe, it, expect, vi } from 'vitest';
import { execa } from 'execa';
import path from 'path';
import fs from 'fs-extra';

// Mock the entire @kubernetes/client-node module for E2E tests
// This is a simplified mock. In a real E2E setup, you might use a local K8s cluster (kind/minikube)
// or a more sophisticated mocking library that intercepts HTTP requests.
vi.mock('@kubernetes/client-node', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    KubeConfig: vi.fn(() => ({
      loadFromDefault: vi.fn(),
      makeApiClient: vi.fn((apiClient) => {
        if (apiClient.name === 'CoreV1Api') {
          return {
            readNamespacedPod: vi.fn((podName, namespace) => {
              if (podName === 'test-pod' && namespace === 'test-ns') {
                return Promise.resolve({
                  body: {
                    kind: 'Pod',
                    apiVersion: 'v1',
                    metadata: { name: 'test-pod', namespace: 'test-ns' },
                    spec: {
                      containers: [
                        { name: 'nginx', image: 'nginx:latest' },
                      ],
                    },
                  },
                });
              }
              return Promise.reject(new Error('Pod not found'));
            }),
          };
        }
        return {};
      }),
    })),
  };
});

describe('KubeKavach CLI E2E Tests', () => {
  const cliPath = path.resolve(__dirname, '../../bin/run.js');
  const mockTestDir = path.resolve(__dirname, '../../../../mocktest');

  beforeAll(() => {
    fs.ensureDirSync(mockTestDir);
  });

  afterAll(() => {
    // Clean up mock test results
    fs.emptyDirSync(mockTestDir);
  });

  it('should run the scan command and report no issues for a clean cluster', async () => {
    // Mock Kubernetes API responses for a clean cluster
    vi.mock('@kubernetes/client-node', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        KubeConfig: vi.fn(() => ({
          loadFromDefault: vi.fn(),
          makeApiClient: vi.fn((apiClient) => {
            if (apiClient.name === 'CoreV1Api') {
              return {
                listPodForAllNamespaces: vi.fn(() => Promise.resolve({ body: { items: [] } })),
              };
            }
            if (apiClient.name === 'AppsV1Api') {
              return {
                listDeploymentForAllNamespaces: vi.fn(() => Promise.resolve({ body: { items: [] } })),
                listDaemonSetForAllNamespaces: vi.fn(() => Promise.resolve({ body: { items: [] } })),
                listStatefulSetForAllNamespaces: vi.fn(() => Promise.resolve({ body: { items: [] } })),
              };
            }
            if (apiClient.name === 'BatchV1Api') {
              return {
                listJobForAllNamespaces: vi.fn(() => Promise.resolve({ body: { items: [] } })),
              };
            }
            return {};
          }),
        })),
      };
    });

    const { stdout } = await execa(cliPath, ['scan']);
    expect(stdout).toContain('No security issues found.');

    // Save test result
    fs.writeFileSync(path.join(mockTestDir, 'e2e-scan-clean-cluster.txt'), stdout);
  }, 10000); // Increase timeout for E2E tests

  it('should run the replay command for a specified pod', async () => {
    // Mock Kubernetes API responses for a specific pod
    vi.mock('@kubernetes/client-node', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        KubeConfig: vi.fn(() => ({
          loadFromDefault: vi.fn(),
          makeApiClient: vi.fn((apiClient) => {
            if (apiClient.name === 'CoreV1Api') {
              return {
                readNamespacedPod: vi.fn((podName, namespace) => {
                  if (podName === 'my-app-pod' && namespace === 'default') {
                    return Promise.resolve({
                      body: {
                        kind: 'Pod',
                        apiVersion: 'v1',
                        metadata: { name: 'my-app-pod', namespace: 'default' },
                        spec: {
                          containers: [
                            { name: 'my-app', image: 'my-app-image:1.0' },
                          ],
                        },
                      },
                    });
                  }
                  return Promise.reject(new Error('Pod not found'));
                }),
              };
            }
            return {};
          }),
        })),
      };
    });

    // Mock dockerode interactions
    vi.mock('dockerode', () => ({
      default: vi.fn(() => ({
        pull: vi.fn(() => Promise.resolve()),
        createContainer: vi.fn(() => ({
          start: vi.fn(() => Promise.resolve()),
          id: 'mock-container-id',
        })),
      })),
    }));

    const { stdout } = await execa(cliPath, ['replay', '-n', 'default', '-p', 'my-app-pod']);
    expect(stdout).toContain('Replaying pod my-app-pod');
    expect(stdout).toContain('Pod my-app-pod replay started successfully');

    // Save test result
    fs.writeFileSync(path.join(mockTestDir, 'e2e-replay-pod.txt'), stdout);
  }, 10000);
});
