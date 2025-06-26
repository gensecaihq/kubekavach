import { z } from 'zod';

/**
 * Defines the severity levels for security findings.
 */
export const SeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Represents a single security finding identified by a rule.
 */
export const FindingSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  severity: SeveritySchema,
  resource: z.object({
    kind: z.string(),
    name: z.string(),
    namespace: z.string().optional(),
    apiVersion: z.string(),
  }),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  remediation: z.string().optional(),
});

/**
 * Represents the result of a security scan.
 */
export const ScanResultSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  cluster: z.string(),
  namespace: z.string().optional(),
  duration: z.number(),
  summary: z.object({
    total: z.number(),
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
  findings: z.array(FindingSchema),
});

export type ScanResult = z.infer<typeof ScanResultSchema>;
export type Finding = z.infer<typeof FindingSchema>;
