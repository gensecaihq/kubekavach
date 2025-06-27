
import { describe, it, expect, vi } from 'vitest';
import Scan from '../src/commands/scan';
import { V1Pod } from '@kubernetes/client-node';
import fs from 'fs';
import path from 'path';

// Mock Kubernetes API clients
const mockK8sCoreApi = {
  listNamespacedPod: vi.fn(),
  listPodForAllNamespaces: vi.fn(),
};

const mockK8sAppsApi = {
  listNamespacedDeployment: vi.fn(),
  listDeploymentForAllNamespaces: vi.fn(),
  listNamespacedDaemonSet: vi.fn(),
  listDaemonSetForAllNamespaces: vi.fn(),
  listNamespacedStatefulSet: vi.fn(),
  listStatefulSetForAllNamespaces: vi.fn(),
};

const mockK8sBatchApi = {
  listNamespacedJob: vi.fn(),
  listJobForAllNamespaces: vi.fn(),
};

const mockClients = {
  core: mockK8sCoreApi,
  apps: mockK8sAppsApi,
  batch: mockK8sBatchApi,
};

// Helper to create a mock pod
const createMockPod = (name: string, namespace: string, privileged: boolean = false, hasLimits: boolean = true, allowPrivilegeEscalation: boolean = false): V1Pod => ({
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: { name, namespace },
  spec: {
    containers: [
      {
        name: 'test-container',
        image: 'test-image',
        securityContext: {
          privileged,
          allowPrivilegeEscalation,
        },
        resources: hasLimits ? { limits: { cpu: '100m', memory: '128Mi' } } : {},
      },
    ],
  },
});

describe('Scan Command', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Mock cli-ux actions to prevent actual console output during tests
    vi.mock('cli-ux', () => ({
      default: {
        action: {
          start: vi.fn(),
          stop: vi.fn(),
        },
        table: vi.fn(),
      },
    }));
  });

  it('should report no findings for a clean cluster', async () => {
    mockK8sCoreApi.listPodForAllNamespaces.mockResolvedValue({ body: { items: [createMockPod('clean-pod', 'default')] } });
    mockK8sAppsApi.listDeploymentForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sAppsApi.listDaemonSetForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sAppsApi.listStatefulSetForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sBatchApi.listJobForAllNamespaces.mockResolvedValue({ body: { items: [] } });

    const scanCommand = new Scan([], undefined);
    scanCommand.log = vi.fn(); // Mock log to capture output
    scanCommand.error = vi.fn(); // Mock error

    await scanCommand.performScan(mockClients);

    expect(scanCommand.log).toHaveBeenCalledWith('No security issues found.');
    expect(cli.default.table).not.toHaveBeenCalled();

    // Save test result
    fs.writeFileSync(path.join(__dirname, '../../../../mocktest/clean-cluster-scan.json'), JSON.stringify({ findings: [] }, null, 2));
  });

  it('should report findings for a privileged pod', async () => {
    mockK8sCoreApi.listPodForAllNamespaces.mockResolvedValue({ body: { items: [createMockPod('privileged-pod', 'default', true)] } });
    mockK8sAppsApi.listDeploymentForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sAppsApi.listDaemonSetForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sAppsApi.listStatefulSetForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sBatchApi.listJobForAllNamespaces.mockResolvedValue({ body: { items: [] } });

    const scanCommand = new Scan([], undefined);
    scanCommand.log = vi.fn();
    scanCommand.error = vi.fn();

    await scanCommand.performScan(mockClients);

    expect(scanCommand.log).toHaveBeenCalledWith('Security Scan Results:');
    expect(cli.default.table).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        ruleName: 'Privileged Container',
        severity: 'CRITICAL',
        resource: expect.objectContaining({ name: 'privileged-pod' }),
      }),
    ]), expect.any(Object));

    // Save test result
    const findings = (cli.default.table as vi.Mock).mock.calls[0][0];
    fs.writeFileSync(path.join(__dirname, '../../../../mocktest/privileged-pod-scan.json'), JSON.stringify({ findings }, null, 2));
  });

  it('should report findings for a pod with missing resource limits', async () => {
    mockK8sCoreApi.listPodForAllNamespaces.mockResolvedValue({ body: { items: [createMockPod('no-limits-pod', 'default', false, false)] } });
    mockK8sAppsApi.listDeploymentForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sAppsApi.listDaemonSetForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sAppsApi.listStatefulSetForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sBatchApi.listJobForAllNamespaces.mockResolvedValue({ body: { items: [] } });

    const scanCommand = new Scan([], undefined);
    scanCommand.log = vi.fn();
    scanCommand.error = vi.fn();

    await scanCommand.performScan(mockClients);

    expect(scanCommand.log).toHaveBeenCalledWith('Security Scan Results:');
    expect(cli.default.table).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        ruleName: 'Missing Resource Limits',
        severity: 'MEDIUM',
        resource: expect.objectContaining({ name: 'no-limits-pod' }),
      }),
    ]), expect.any(Object));

    // Save test result
    const findings = (cli.default.table as vi.Mock).mock.calls[0][0];
    fs.writeFileSync(path.join(__dirname, '../../../../mocktest/no-limits-pod-scan.json'), JSON.stringify({ findings }, null, 2));
  });

  it('should report findings for a pod allowing privilege escalation', async () => {
    mockK8sCoreApi.listPodForAllNamespaces.mockResolvedValue({ body: { items: [createMockPod('escalation-pod', 'default', false, true, true)] } });
    mockK8sAppsApi.listDeploymentForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sAppsApi.listDaemonSetForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sAppsApi.listStatefulSetForAllNamespaces.mockResolvedValue({ body: { items: [] } });
    mockK8sBatchApi.listJobForAllNamespaces.mockResolvedValue({ body: { items: [] } });

    const scanCommand = new Scan([], undefined);
    scanCommand.log = vi.fn();
    scanCommand.error = vi.fn();

    await scanCommand.performScan(mockClients);

    expect(scanCommand.log).toHaveBeenCalledWith('Security Scan Results:');
    expect(cli.default.table).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        ruleName: 'Allow Privilege Escalation',
        severity: 'HIGH',
        resource: expect.objectContaining({ name: 'escalation-pod' }),
      }),
    ]), expect.any(Object));

    // Save test result
    const findings = (cli.default.table as vi.Mock).mock.calls[0][0];
    fs.writeFileSync(path.join(__dirname, '../../../../mocktest/escalation-pod-scan.json'), JSON.stringify({ findings }, null, 2));
  });

  it('should handle Kubernetes API errors gracefully', async () => {
    mockK8sCoreApi.listPodForAllNamespaces.mockRejectedValue(new Error('Forbidden'));

    const scanCommand = new Scan([], undefined);
    scanCommand.log = vi.fn();
    scanCommand.error = vi.fn();

    await scanCommand.performScan(mockClients);

    expect(scanCommand.error).toHaveBeenCalledWith(expect.stringContaining('Failed to scan cluster: Forbidden'));

    // Save test result
    fs.writeFileSync(path.join(__dirname, '../../../../mocktest/api-error-scan.json'), JSON.stringify({ error: 'Forbidden' }, null, 2));
  });
});
