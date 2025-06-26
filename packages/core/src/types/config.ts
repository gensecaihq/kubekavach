
import { z } from 'zod';

/**
 * Configuration for AI providers.
 */
export const AIConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'ollama']).default('openai'),
  apiKey: z.string().optional(),
  model: z.string().default('gpt-3.5-turbo'),
});

/**
 * Configuration for the local replay engine.
 */
export const ReplayConfigSchema = z.object({
  // Defines how to handle sensitive information during replay
  secretHandling: z.enum(['prompt', 'placeholder', 'insecure-mount']).default('prompt'),
});

/**
 * Configuration for the API server.
 */
export const APIConfigSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('localhost'),
  apiKey: z.string().optional(), // API key for securing the server
  rateLimit: z.object({
    max: z.number().default(100),
    timeWindow: z.string().default('1 minute'),
  }),
});

/**
 * The main KubeKavach configuration schema.
 */
export const KubeKavachConfigSchema = z.object({
  ai: AIConfigSchema.optional(),
  replay: ReplayConfigSchema.optional(),
  api: APIConfigSchema.optional(),
  // Path to the kubeconfig file (if not using default)
  kubeconfig: z.string().optional(),
});

export type KubeKavachConfig = z.infer<typeof KubeKavachConfigSchema>;
export type AIConfig = z.infer<typeof AIConfigSchema>;
export type ReplayConfig = z.infer<typeof ReplayConfigSchema>;
export type APIConfig = z.infer<typeof APIConfigSchema>;
