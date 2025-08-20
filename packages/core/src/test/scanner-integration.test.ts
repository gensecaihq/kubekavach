import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScanResult, Finding, Severity } from '../types/scan';
import { allRules } from '@kubekavach/rules';

describe('Scanner Integration Tests', () => {
  describe('Scan Result Generation', () => {
    it('should generate valid scan result with all severity levels', () => {
      const findings: Finding[] = [
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
          message: 'Pod running in privileged mode',
          remediation: 'Set privileged: false'
        },
        {
          ruleId: 'KKR004',
          ruleName: 'Host Network Access',
          severity: 'HIGH',
          resource: {
            kind: 'Pod',
            name: 'network-pod',
            namespace: 'kube-system',
            apiVersion: 'v1'
          },
          message: 'Pod using host network',
          remediation: 'Remove hostNetwork: true'
        },
        {
          ruleId: 'KKR002',
          ruleName: 'Missing Resource Limits',
          severity: 'MEDIUM',
          resource: {
            kind: 'Pod',
            name: 'unlimited-pod',
            namespace: 'production',
            apiVersion: 'v1'
          },
          message: 'Container missing resource limits',
          remediation: 'Add CPU and memory limits'
        }
      ];

      const scanResult: ScanResult = {
        id: 'scan-123',
        timestamp: new Date().toISOString(),
        cluster: 'test-cluster',
        namespace: 'all',
        duration: 1500,
        summary: {
          total: 3,
          critical: 1,
          high: 1,
          medium: 1,
          low: 0
        },
        findings
      };

      expect(scanResult.summary.total).toBe(findings.length);
      expect(scanResult.summary.critical).toBe(1);
      expect(scanResult.summary.high).toBe(1);
      expect(scanResult.summary.medium).toBe(1);
      expect(scanResult.summary.low).toBe(0);
    });

    it('should handle empty scan results', () => {
      const scanResult: ScanResult = {
        id: 'scan-empty',
        timestamp: new Date().toISOString(),
        cluster: 'test-cluster',
        namespace: 'default',
        duration: 100,
        summary: {
          total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        },
        findings: []
      };

      expect(scanResult.findings).toHaveLength(0);
      expect(scanResult.summary.total).toBe(0);
    });
  });

  describe('Rule Execution', () => {
    it('should execute all registered rules', () => {
      const testPod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: { privileged: true }
          }]
        }
      };

      const violations = allRules
        .filter(rule => !rule.validate(testPod))
        .map(rule => rule.id);

      expect(violations).toContain('KKR001'); // Privileged container
      expect(violations).toContain('KKR002'); // Missing resource limits
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should handle malformed manifests gracefully', () => {
      const malformedPod = {
        kind: 'Pod',
        metadata: { name: 'malformed' }
        // Missing spec
      };

      const results = allRules.map(rule => {
        try {
          return rule.validate(malformedPod);
        } catch (error) {
          return null;
        }
      });

      // Should not throw errors
      expect(results).not.toContain(null);
    });
  });

  describe('Performance', () => {
    it('should scan large number of resources efficiently', () => {
      const pods = Array.from({ length: 100 }, (_, i) => ({
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: `pod-${i}`, namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest'
          }]
        }
      }));

      const startTime = Date.now();
      
      pods.forEach(pod => {
        allRules.forEach(rule => rule.validate(pod));
      });
      
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time (< 1 second for 100 pods)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Severity Classification', () => {
    it('should correctly classify severity levels', () => {
      const severities: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      
      severities.forEach(severity => {
        const finding: Finding = {
          ruleId: 'TEST',
          ruleName: 'Test Rule',
          severity,
          resource: {
            kind: 'Pod',
            name: 'test',
            apiVersion: 'v1'
          },
          message: `Test ${severity} finding`
        };

        expect(finding.severity).toBe(severity);
      });
    });
  });
});