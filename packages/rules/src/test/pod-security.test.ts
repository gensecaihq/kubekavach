
import { describe, it, expect } from 'vitest';
import { privilegedContainerRule, missingResourceLimitsRule, allowPrivilegeEscalationRule } from '../src/rules/pod-security';
import { V1Pod } from '@kubernetes/client-node';

// Mock Pod for testing privileged container rule
const privilegedPod: V1Pod = {
  kind: 'Pod',
  metadata: { name: 'privileged-pod' },
  spec: {
    containers: [
      { name: 'nginx', image: 'nginx', securityContext: { privileged: true } },
    ],
  },
};

const nonPrivilegedPod: V1Pod = {
  kind: 'Pod',
  metadata: { name: 'non-privileged-pod' },
  spec: {
    containers: [
      { name: 'nginx', image: 'nginx', securityContext: { privileged: false } },
    ],
  },
};

// Mock Pod for testing resource limits rule
const podWithLimits: V1Pod = {
  kind: 'Pod',
  metadata: { name: 'pod-with-limits' },
  spec: {
    containers: [
      {
        name: 'nginx',
        image: 'nginx',
        resources: { limits: { cpu: '100m', memory: '128Mi' } },
      },
    ],
  },
};

const podWithoutLimits: V1Pod = {
  kind: 'Pod',
  metadata: { name: 'pod-without-limits' },
  spec: {
    containers: [{ name: 'nginx', image: 'nginx', resources: {} }],
  },
};

// Mock Pod for testing privilege escalation rule
const podWithPrivilegeEscalation: V1Pod = {
  kind: 'Pod',
  metadata: { name: 'pod-with-privilege-escalation' },
  spec: {
    containers: [
      { name: 'nginx', image: 'nginx', securityContext: { allowPrivilegeEscalation: true } },
    ],
  },
};

const podWithoutPrivilegeEscalation: V1Pod = {
  kind: 'Pod',
  metadata: { name: 'pod-without-privilege-escalation' },
  spec: {
    containers: [
      { name: 'nginx', image: 'nginx', securityContext: { allowPrivilegeEscalation: false } },
    ],
  },
};

describe('Security Rules', () => {
  describe('privilegedContainerRule', () => {
    it('should fail validation for a privileged container', () => {
      expect(privilegedContainerRule.validate(privilegedPod)).toBe(false);
    });

    it('should pass validation for a non-privileged container', () => {
      expect(privilegedContainerRule.validate(nonPrivilegedPod)).toBe(true);
    });
  });

  describe('missingResourceLimitsRule', () => {
    it('should pass validation when resource limits are set', () => {
      expect(missingResourceLimitsRule.validate(podWithLimits)).toBe(true);
    });

    it('should fail validation when resource limits are missing', () => {
      expect(missingResourceLimitsRule.validate(podWithoutLimits)).toBe(false);
    });
  });

  describe('allowPrivilegeEscalationRule', () => {
    it('should fail validation when privilege escalation is allowed', () => {
      expect(allowPrivilegeEscalationRule.validate(podWithPrivilegeEscalation)).toBe(false);
    });

    it('should pass validation when privilege escalation is not allowed', () => {
      expect(allowPrivilegeEscalationRule.validate(podWithoutPrivilegeEscalation)).toBe(true);
    });
  });
});
