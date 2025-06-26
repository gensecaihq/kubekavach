
import { privilegedContainerRule, missingResourceLimitsRule, allowPrivilegeEscalationRule } from './rules/pod-security';
import { Rule } from '@kubekavach/core';

export const allRules: Rule[] = [
  privilegedContainerRule,
  missingResourceLimitsRule,
  allowPrivilegeEscalationRule,
];

export function getRule(id: string): Rule | undefined {
  return allRules.find(rule => rule.id === id);
}
