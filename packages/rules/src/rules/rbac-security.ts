import { Rule, Severity, RULE_CATEGORIES } from '@kubekavach/core';
import { V1Pod, V1ClusterRole, V1Role } from '@kubernetes/client-node';

export const serviceAccountTokenRule: Rule = {
  id: 'KKR007',
  name: 'Service Account Token Auto-Mount',
  description: 'Checks for pods that automatically mount service account tokens.',
  severity: Severity.MEDIUM,
  category: RULE_CATEGORIES.RBAC,
  validate(manifest: any): boolean {
    if (manifest.kind !== 'Pod') {
      return true;
    }
    const pod = manifest as V1Pod;
    // If automountServiceAccountToken is not explicitly set to false, it defaults to true
    return pod.spec?.automountServiceAccountToken === false;
  },
  getFinding(manifest: any) {
    const pod = manifest as V1Pod;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      message: `Pod '${pod.metadata?.name}' automatically mounts service account tokens.`,
      resource: {
        kind: pod.kind || 'Pod',
        name: pod.metadata?.name || 'unknown',
        namespace: pod.metadata?.namespace,
        apiVersion: pod.apiVersion || 'v1',
      },
      remediation: 'Set automountServiceAccountToken: false unless the pod specifically needs API access.',
    };
  },
};

export const runAsNonRootRule: Rule = {
  id: 'KKR008',
  name: 'Run as Non-Root User',
  description: 'Checks for containers that may run as root user.',
  severity: Severity.HIGH,
  category: RULE_CATEGORIES.CONTAINER_SECURITY,
  validate(manifest: any): boolean {
    if (manifest.kind !== 'Pod') {
      return true;
    }
    const pod = manifest as V1Pod;
    const hasRootUser = pod.spec?.containers.some(c => {
      const sc = c.securityContext;
      return !sc?.runAsNonRoot && !sc?.runAsUser;
    });
    return !hasRootUser;
  },
  getFinding(manifest: any) {
    const pod = manifest as V1Pod;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      message: `Pod '${pod.metadata?.name}' may run containers as root user.`,
      resource: {
        kind: pod.kind || 'Pod',
        name: pod.metadata?.name || 'unknown',
        namespace: pod.metadata?.namespace,
        apiVersion: pod.apiVersion || 'v1',
      },
      remediation: 'Set runAsNonRoot: true or specify a non-root runAsUser in securityContext.',
    };
  },
};

export const capabilitiesRule: Rule = {
  id: 'KKR009',
  name: 'Excessive Capabilities',
  description: 'Checks for containers with dangerous Linux capabilities.',
  severity: Severity.HIGH,
  category: RULE_CATEGORIES.CONTAINER_SECURITY,
  validate(manifest: any): boolean {
    if (manifest.kind !== 'Pod') {
      return true;
    }
    const pod = manifest as V1Pod;
    const dangerousCaps = ['SYS_ADMIN', 'NET_ADMIN', 'SYS_TIME', 'SYS_MODULE'];
    
    const hasDangerousCaps = pod.spec?.containers.some(c => {
      const caps = c.securityContext?.capabilities?.add || [];
      return caps.some(cap => dangerousCaps.includes(cap));
    });
    
    return !hasDangerousCaps;
  },
  getFinding(manifest: any) {
    const pod = manifest as V1Pod;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      message: `Pod '${pod.metadata?.name}' has containers with dangerous capabilities.`,
      resource: {
        kind: pod.kind || 'Pod',
        name: pod.metadata?.name || 'unknown',
        namespace: pod.metadata?.namespace,
        apiVersion: pod.apiVersion || 'v1',
      },
      remediation: 'Remove dangerous capabilities and use drop: [ALL] with minimal required capabilities.',
    };
  },
};