
import { Rule, Severity, RULE_CATEGORIES } from '@kubekavach/core';
import { V1Pod } from '@kubernetes/client-node';

export const privilegedContainerRule: Rule = {
  id: 'KKR001',
  name: 'Privileged Container',
  description: 'Checks for containers running in privileged mode.',
  severity: Severity.CRITICAL,
  category: RULE_CATEGORIES.POD_SECURITY,
  validate(manifest: any): boolean {
    if (manifest.kind !== 'Pod') {
      return true; // Not applicable
    }
    const pod = manifest as V1Pod;
    const isPrivileged = pod.spec?.containers.some(c => c.securityContext?.privileged === true);
    return !isPrivileged;
  },
  getFinding(manifest: any) {
    const pod = manifest as V1Pod;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      message: `Container in Pod '${pod.metadata?.name}' is running in privileged mode.`,
      resource: {
        kind: pod.kind || 'Pod',
        name: pod.metadata?.name || 'unknown',
        namespace: pod.metadata?.namespace,
        apiVersion: pod.apiVersion || 'v1',
      },
    };
  },
};

export const missingResourceLimitsRule: Rule = {
  id: 'KKR002',
  name: 'Missing Resource Limits',
  description: 'Checks for containers that do not have CPU or memory limits set.',
  severity: Severity.MEDIUM,
  category: RULE_CATEGORIES.RESOURCE_MANAGEMENT,
  validate(manifest: any): boolean {
    if (manifest.kind !== 'Pod') {
      return true; // Not applicable
    }
    const pod = manifest as V1Pod;
    const hasMissingLimits = pod.spec?.containers.some(c => !c.resources?.limits?.cpu || !c.resources?.limits?.memory);
    return !hasMissingLimits;
  },
  getFinding(manifest: any) {
    const pod = manifest as V1Pod;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      message: `Container in Pod '${pod.metadata?.name}' is missing CPU or memory limits.`,
      resource: {
        kind: pod.kind || 'Pod',
        name: pod.metadata?.name || 'unknown',
        namespace: pod.metadata?.namespace,
        apiVersion: pod.apiVersion || 'v1',
      },
    };
  },
};

export const allowPrivilegeEscalationRule: Rule = {
  id: 'KKR003',
  name: 'Allow Privilege Escalation',
  description: 'Checks for containers that allow privilege escalation.',
  severity: Severity.HIGH,
  category: RULE_CATEGORIES.POD_SECURITY,
  validate(manifest: any): boolean {
    if (manifest.kind !== 'Pod') {
      return true; // Not applicable
    }
    const pod = manifest as V1Pod;
    const allowsEscalation = pod.spec?.containers.some(c => c.securityContext?.allowPrivilegeEscalation === true);
    return !allowsEscalation;
  },
  getFinding(manifest: any) {
    const pod = manifest as V1Pod;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      message: `Container in Pod '${pod.metadata?.name}' allows privilege escalation.`,
      resource: {
        kind: pod.kind || 'Pod',
        name: pod.metadata?.name || 'unknown',
        namespace: pod.metadata?.namespace,
        apiVersion: pod.apiVersion || 'v1',
      },
    };
  },
};
