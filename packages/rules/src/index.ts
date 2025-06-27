
import { privilegedContainerRule, missingResourceLimitsRule, allowPrivilegeEscalationRule } from './rules/pod-security';
import { hostNetworkRule, hostPortRule, readOnlyRootFilesystemRule } from './rules/network-security';
import { serviceAccountTokenRule, runAsNonRootRule, capabilitiesRule } from './rules/rbac-security';
import { Rule } from '@kubekavach/core';

export const allRules: Rule[] = [
  // Pod Security Rules
  privilegedContainerRule,
  missingResourceLimitsRule,
  allowPrivilegeEscalationRule,
  
  // Network Security Rules
  hostNetworkRule,
  hostPortRule,
  readOnlyRootFilesystemRule,
  
  // RBAC & Container Security Rules
  serviceAccountTokenRule,
  runAsNonRootRule,
  capabilitiesRule,
];

export function getRule(id: string): Rule | undefined {
  return allRules.find(rule => rule.id === id);
}
