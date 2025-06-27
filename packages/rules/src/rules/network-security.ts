import { Rule, Severity, RULE_CATEGORIES } from '@kubekavach/core';
import { V1Pod, V1Service, V1NetworkPolicy } from '@kubernetes/client-node';

export const hostNetworkRule: Rule = {
  id: 'KKR004',
  name: 'Host Network Access',
  description: 'Checks for pods that use host network namespace.',
  severity: Severity.HIGH,
  category: RULE_CATEGORIES.NETWORK_SECURITY,
  validate(manifest: any): boolean {
    if (manifest.kind !== 'Pod') {
      return true;
    }
    const pod = manifest as V1Pod;
    return !pod.spec?.hostNetwork;
  },
  getFinding(manifest: any) {
    const pod = manifest as V1Pod;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      message: `Pod '${pod.metadata?.name}' is using host network namespace, which can expose host network interfaces.`,
      resource: {
        kind: pod.kind || 'Pod',
        name: pod.metadata?.name || 'unknown',
        namespace: pod.metadata?.namespace,
        apiVersion: pod.apiVersion || 'v1',
      },
      remediation: 'Remove hostNetwork: true from pod specification or use proper network policies.',
    };
  },
};

export const hostPortRule: Rule = {
  id: 'KKR005',
  name: 'Host Port Binding',
  description: 'Checks for containers that bind to host ports.',
  severity: Severity.MEDIUM,
  category: RULE_CATEGORIES.NETWORK_SECURITY,
  validate(manifest: any): boolean {
    if (manifest.kind !== 'Pod') {
      return true;
    }
    const pod = manifest as V1Pod;
    const hasHostPort = pod.spec?.containers.some(c => 
      c.ports?.some(p => p.hostPort !== undefined)
    );
    return !hasHostPort;
  },
  getFinding(manifest: any) {
    const pod = manifest as V1Pod;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      message: `Pod '${pod.metadata?.name}' has containers binding to host ports.`,
      resource: {
        kind: pod.kind || 'Pod',
        name: pod.metadata?.name || 'unknown',
        namespace: pod.metadata?.namespace,
        apiVersion: pod.apiVersion || 'v1',
      },
      remediation: 'Use Service objects instead of hostPort for external connectivity.',
    };
  },
};

export const readOnlyRootFilesystemRule: Rule = {
  id: 'KKR006',
  name: 'Read-Only Root Filesystem',
  description: 'Checks for containers without read-only root filesystem.',
  severity: Severity.MEDIUM,
  category: RULE_CATEGORIES.CONTAINER_SECURITY,
  validate(manifest: any): boolean {
    if (manifest.kind !== 'Pod') {
      return true;
    }
    const pod = manifest as V1Pod;
    const hasWritableRoot = pod.spec?.containers.some(c => 
      !c.securityContext?.readOnlyRootFilesystem
    );
    return !hasWritableRoot;
  },
  getFinding(manifest: any) {
    const pod = manifest as V1Pod;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      message: `Pod '${pod.metadata?.name}' has containers with writable root filesystem.`,
      resource: {
        kind: pod.kind || 'Pod',
        name: pod.metadata?.name || 'unknown',
        namespace: pod.metadata?.namespace,
        apiVersion: pod.apiVersion || 'v1',
      },
      remediation: 'Set readOnlyRootFilesystem: true in container securityContext.',
    };
  },
};