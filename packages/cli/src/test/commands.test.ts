import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Config } from '@oclif/core';
import Scan from '../commands/scan';
import Replay from '../commands/replay';
import ApiCommand from '../commands/api';
import Rules from '../commands/rules';
import ConfigCommand from '../commands/config';

// Mock dependencies
vi.mock('@kubekavach/core', () => ({
  loadConfig: vi.fn().mockReturnValue({
    kubeconfig: '~/.kube/config',
    rules: { enabled: ['KKR001', 'KKR002'] },
    api: { port: 3000, host: 'localhost' }
  }),
  saveConfig: vi.fn(),
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
  }))
}));

vi.mock('@kubekavach/rules', () => ({
  allRules: [
    {
      id: 'KKR001',
      name: 'Privileged Container',
      description: 'Detects privileged containers',
      severity: 'CRITICAL',
      category: 'Pod Security'
    },
    {
      id: 'KKR002',
      name: 'Missing Resource Limits',
      description: 'Detects containers without resource limits',
      severity: 'HIGH',
      category: 'Resource Management'
    }
  ]
}));

vi.mock('@kubekavach/replay', () => ({
  PodReplayer: vi.fn().mockImplementation(() => ({
    replay: vi.fn().mockResolvedValue({
      success: true,
      containerId: 'test-container-123',
      logs: ['Container started successfully']
    })
  }))
}));

vi.mock('@kubekavach/api', () => ({
  startServer: vi.fn().mockResolvedValue(undefined)
}));

describe('CLI Commands', () => {
  let config: Config;

  beforeEach(() => {
    config = new Config({ root: __dirname });
    vi.clearAllMocks();
  });

  describe('Scan Command', () => {
    it('should run scan with default options', async () => {
      const scan = new Scan([], config);
      const logSpy = vi.spyOn(scan, 'log');

      await scan.run();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Scanning Kubernetes cluster'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Scan completed'));
    });

    it('should run scan with namespace filter', async () => {
      const scan = new Scan(['--namespace', 'test-ns'], config);
      const logSpy = vi.spyOn(scan, 'log');

      await scan.run();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Scanning namespace: test-ns'));
    });

    it('should run scan with rule filter', async () => {
      const scan = new Scan(['--rules', 'KKR001,KKR002'], config);
      const logSpy = vi.spyOn(scan, 'log');

      await scan.run();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Using rules: KKR001,KKR002'));
    });

    it('should output JSON when requested', async () => {
      const scan = new Scan(['--json'], config);
      const logSpy = vi.spyOn(scan, 'log');

      await scan.run();

      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/^\{.*\}$/s));
    });

    it('should handle scan errors gracefully', async () => {
      const { KubernetesScanner } = await import('@kubekavach/core');
      const mockScanner = vi.mocked(KubernetesScanner);
      mockScanner.mockImplementation(() => ({
        scan: vi.fn().mockRejectedValue(new Error('Scan failed'))
      }) as any);

      const scan = new Scan([], config);
      const errorSpy = vi.spyOn(scan, 'error');

      await expect(scan.run()).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Scan failed'));
    });
  });

  describe('Replay Command', () => {
    it('should replay pod successfully', async () => {
      const replay = new Replay(['test-pod'], config);
      const logSpy = vi.spyOn(replay, 'log');

      await replay.run();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Replaying pod: test-pod'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Container ID: test-container-123'));
    });

    it('should replay pod with namespace', async () => {
      const replay = new Replay(['test-pod', '--namespace', 'test-ns'], config);
      const logSpy = vi.spyOn(replay, 'log');

      await replay.run();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('namespace: test-ns'));
    });

    it('should follow logs when requested', async () => {
      const replay = new Replay(['test-pod', '--follow'], config);
      const logSpy = vi.spyOn(replay, 'log');

      await replay.run();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Following logs'));
    });

    it('should handle replay errors gracefully', async () => {
      const { PodReplayer } = await import('@kubekavach/replay');
      const mockReplayer = vi.mocked(PodReplayer);
      mockReplayer.mockImplementation(() => ({
        replay: vi.fn().mockRejectedValue(new Error('Replay failed'))
      }) as any);

      const replay = new Replay(['test-pod'], config);
      const errorSpy = vi.spyOn(replay, 'error');

      await expect(replay.run()).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Replay failed'));
    });
  });

  describe('API Command', () => {
    it('should start API server with default config', async () => {
      const api = new ApiCommand([], config);
      const logSpy = vi.spyOn(api, 'log');

      await api.run();

      expect(logSpy).toHaveBeenCalledWith('Starting KubeKavach API server...');
    });

    it('should start API server with custom port', async () => {
      const api = new ApiCommand(['--port', '4000'], config);
      const logSpy = vi.spyOn(api, 'log');

      await api.run();

      expect(logSpy).toHaveBeenCalledWith('Starting KubeKavach API server...');
    });

    it('should start API server with custom host', async () => {
      const api = new ApiCommand(['--host', '0.0.0.0'], config);
      const logSpy = vi.spyOn(api, 'log');

      await api.run();

      expect(logSpy).toHaveBeenCalledWith('Starting KubeKavach API server...');
    });

    it('should handle API server errors gracefully', async () => {
      const { startServer } = await import('@kubekavach/api');
      const mockStartServer = vi.mocked(startServer);
      mockStartServer.mockRejectedValue(new Error('Server failed to start'));

      const api = new ApiCommand([], config);
      const errorSpy = vi.spyOn(api, 'error');

      await expect(api.run()).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Server failed to start'));
    });
  });

  describe('Rules Command', () => {
    it('should list all rules', async () => {
      const rules = new Rules([], config);
      const logSpy = vi.spyOn(rules, 'log');

      await rules.run();

      expect(logSpy).toHaveBeenCalledWith('Found 2 security rules:\n');
    });

    it('should filter rules by category', async () => {
      const rules = new Rules(['--category', 'Pod'], config);
      const logSpy = vi.spyOn(rules, 'log');

      await rules.run();

      expect(logSpy).toHaveBeenCalledWith('Found 1 security rules:\n');
    });

    it('should filter rules by severity', async () => {
      const rules = new Rules(['--severity', 'CRITICAL'], config);
      const logSpy = vi.spyOn(rules, 'log');

      await rules.run();

      expect(logSpy).toHaveBeenCalledWith('Found 1 security rules:\n');
    });

    it('should output JSON when requested', async () => {
      const rules = new Rules(['--json'], config);
      const logSpy = vi.spyOn(rules, 'log');

      await rules.run();

      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[.*\]$/s));
    });

    it('should handle rules listing errors gracefully', async () => {
      const { allRules } = await import('@kubekavach/rules');
      // Mock allRules to throw an error
      Object.defineProperty(allRules, 'length', {
        get: () => { throw new Error('Rules loading failed'); }
      });

      const rules = new Rules([], config);
      const errorSpy = vi.spyOn(rules, 'error');

      await expect(rules.run()).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Rules loading failed'));
    });
  });

  describe('Config Command', () => {
    it('should show current config', async () => {
      const configCmd = new ConfigCommand(['show'], config);
      const logSpy = vi.spyOn(configCmd, 'log');

      await configCmd.run();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Current configuration:'));
    });

    it('should set config value', async () => {
      const configCmd = new ConfigCommand(['set', 'api.port', '4000'], config);
      const logSpy = vi.spyOn(configCmd, 'log');

      await configCmd.run();

      expect(logSpy).toHaveBeenCalledWith('Configuration updated: api.port = 4000');
    });

    it('should get config value', async () => {
      const configCmd = new ConfigCommand(['get', 'api.port'], config);
      const logSpy = vi.spyOn(configCmd, 'log');

      await configCmd.run();

      expect(logSpy).toHaveBeenCalledWith('api.port = 3000');
    });

    it('should handle config errors gracefully', async () => {
      const { loadConfig } = await import('@kubekavach/core');
      const mockLoadConfig = vi.mocked(loadConfig);
      mockLoadConfig.mockImplementation(() => {
        throw new Error('Config loading failed');
      });

      const configCmd = new ConfigCommand(['show'], config);
      const errorSpy = vi.spyOn(configCmd, 'error');

      await expect(configCmd.run()).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Config loading failed'));
    });
  });
});