import { describe, it, expect } from 'vitest';
import { privilegedContainerRule, missingResourceLimitsRule, allowPrivilegeEscalationRule } from '../rules/pod-security';
import { hostNetworkRule, readOnlyRootFilesystemRule } from '../rules/network-security';
import { runAsNonRootRule, capabilitiesRule } from '../rules/rbac-security';

describe('Pod Security Rules', () => {
  describe('privilegedContainerRule', () => {
    it('should pass for non-privileged containers', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: { privileged: false }
          }]
        }
      };

      expect(privilegedContainerRule.validate(pod)).toBe(true);
    });

    it('should fail for privileged containers', () => {
      const pod = {
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

      expect(privilegedContainerRule.validate(pod)).toBe(false);
    });

    it('should generate correct finding for privileged container', () => {
      const pod = {
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

      const finding = privilegedContainerRule.getFinding(pod);
      
      expect(finding.ruleId).toBe('KKR001');
      expect(finding.severity).toBe('CRITICAL');
      expect(finding.resource.name).toBe('test-pod');
      expect(finding.message).toContain('privileged mode');
    });
  });

  describe('missingResourceLimitsRule', () => {
    it('should pass for containers with resource limits', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            resources: {
              limits: {
                cpu: '500m',
                memory: '512Mi'
              }
            }
          }]
        }
      };

      expect(missingResourceLimitsRule.validate(pod)).toBe(true);
    });

    it('should fail for containers missing CPU limits', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            resources: {
              limits: {
                memory: '512Mi'
              }
            }
          }]
        }
      };

      expect(missingResourceLimitsRule.validate(pod)).toBe(false);
    });

    it('should fail for containers missing memory limits', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            resources: {
              limits: {
                cpu: '500m'
              }
            }
          }]
        }
      };

      expect(missingResourceLimitsRule.validate(pod)).toBe(false);
    });

    it('should fail for containers with no resource limits', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest'
          }]
        }
      };

      expect(missingResourceLimitsRule.validate(pod)).toBe(false);
    });
  });

  describe('allowPrivilegeEscalationRule', () => {
    it('should pass when privilege escalation is disabled', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: { allowPrivilegeEscalation: false }
          }]
        }
      };

      expect(allowPrivilegeEscalationRule.validate(pod)).toBe(true);
    });

    it('should fail when privilege escalation is enabled', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: { allowPrivilegeEscalation: true }
          }]
        }
      };

      expect(allowPrivilegeEscalationRule.validate(pod)).toBe(false);
    });
  });

  describe('hostNetworkRule', () => {
    it('should pass when host network is not used', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{ name: 'app', image: 'nginx:latest' }]
        }
      };

      expect(hostNetworkRule.validate(pod)).toBe(true);
    });

    it('should fail when host network is used', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          hostNetwork: true,
          containers: [{ name: 'app', image: 'nginx:latest' }]
        }
      };

      expect(hostNetworkRule.validate(pod)).toBe(false);
    });
  });

  describe('readOnlyRootFilesystemRule', () => {
    it('should pass when root filesystem is read-only', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: { readOnlyRootFilesystem: true }
          }]
        }
      };

      expect(readOnlyRootFilesystemRule.validate(pod)).toBe(true);
    });

    it('should fail when root filesystem is writable', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: { readOnlyRootFilesystem: false }
          }]
        }
      };

      expect(readOnlyRootFilesystemRule.validate(pod)).toBe(false);
    });
  });

  describe('runAsNonRootRule', () => {
    it('should pass when running as non-root', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: { runAsNonRoot: true }
          }]
        }
      };

      expect(runAsNonRootRule.validate(pod)).toBe(true);
    });

    it('should pass when runAsUser is set to non-root', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: { runAsUser: 1000 }
          }]
        }
      };

      expect(runAsNonRootRule.validate(pod)).toBe(true);
    });

    it('should fail when neither runAsNonRoot nor runAsUser is set', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest'
          }]
        }
      };

      expect(runAsNonRootRule.validate(pod)).toBe(false);
    });
  });

  describe('capabilitiesRule', () => {
    it('should pass when no dangerous capabilities are added', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: {
              capabilities: {
                add: ['NET_BIND_SERVICE'],
                drop: ['ALL']
              }
            }
          }]
        }
      };

      expect(capabilitiesRule.validate(pod)).toBe(true);
    });

    it('should fail when dangerous capabilities are added', () => {
      const pod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: {
              capabilities: {
                add: ['SYS_ADMIN', 'NET_ADMIN']
              }
            }
          }]
        }
      };

      expect(capabilitiesRule.validate(pod)).toBe(false);
    });
  });

  describe('Non-Pod resources', () => {
    it('should pass for non-Pod resources', () => {
      const service = {
        kind: 'Service',
        apiVersion: 'v1',
        metadata: { name: 'test-service', namespace: 'default' },
        spec: {
          selector: { app: 'test' },
          ports: [{ port: 80, targetPort: 8080 }]
        }
      };

      // All pod-specific rules should pass for non-pod resources
      expect(privilegedContainerRule.validate(service)).toBe(true);
      expect(missingResourceLimitsRule.validate(service)).toBe(true);
      expect(allowPrivilegeEscalationRule.validate(service)).toBe(true);
      expect(hostNetworkRule.validate(service)).toBe(true);
      expect(readOnlyRootFilesystemRule.validate(service)).toBe(true);
      expect(runAsNonRootRule.validate(service)).toBe(true);
      expect(capabilitiesRule.validate(service)).toBe(true);
    });
  });
});