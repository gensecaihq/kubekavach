import { z } from 'zod';

export const SeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export type Severity = z.infer<typeof SeveritySchema>;

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
  findings: z.array(z.object({
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
  })),
});

export type ScanResult = z.infer<typeof ScanResultSchema>;
export type Finding = ScanResult['findings'][0];
