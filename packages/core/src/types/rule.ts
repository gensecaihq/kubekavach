
import { z } from 'zod';
import { FindingSchema } from './scan';

/**
 * Defines the structure of a security rule.
 */
export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  category: z.string(),
  validate: z.function().args(z.any()).returns(z.boolean()),
  getFinding: z.function().args(z.any()).returns(FindingSchema),
});

export type Rule = z.infer<typeof RuleSchema>;
