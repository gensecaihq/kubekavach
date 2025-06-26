
import { z } from 'zod';

/**
 * Defines the configuration for a pod replay.
 */
export const ReplayConfigCoreSchema = z.object({
  // Add any core replay configurations here
});

export type ReplayConfigCore = z.infer<typeof ReplayConfigCoreSchema>;
