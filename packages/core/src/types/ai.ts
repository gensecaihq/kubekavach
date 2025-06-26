
import { z } from 'zod';
import { FindingSchema } from './scan';

/**
 * Defines the interface for an AI provider.
 */
export const AIProviderSchema = z.object({
  getRemediation: z.function()
    .args(FindingSchema)
    .returns(z.promise(z.string())),
});

export type AIProvider = z.infer<typeof AIProviderSchema>;
