

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
  secretHandling: z.enum(['prompt', 'placeholder']).default('prompt'), // Removed 'insecure-mount'
});

/**
 * Configuration for the API server.
 */
export const APIConfigSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('0.0.0.0'), // Listen on all interfaces in production
  apiKey: z.string().optional(), // API key for securing the server (deprecated, use users array)
  corsOrigin: z.string().default('http://localhost:8080'), // Default to UI development origin
  rateLimit: z.object({
    max: z.number().default(1000), // Increased for production, adjust as needed
    timeWindow: z.string().default('1 minute'),
  }),
});

/**
 * Defines a user for API authentication and authorization.
 */
export const UserSchema = z.object({
  username: z.string(),
  apiKey: z.string(),
  roles: z.array(z.string()).default(['viewer']),
});

/**
 * The main KubeKavach configuration schema.
 */
export const KubeKavachConfigSchema = z.object({
  ai: AIConfigSchema.optional(),
  replay: ReplayConfigSchema.optional(),
  api: APIConfigSchema.optional(),
  users: z.array(UserSchema).optional(), // Optional API users with roles
  // Path to the kubeconfig file (if not using default)
  kubeconfig: z.string().optional(),
  database: z.object({
    type: z.enum(['postgres', 'sqlite']).optional(),
    url: z.string().optional(),
    host: z.string().optional(),
    port: z.number().optional(),
    database: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional()
  }).optional()
});

export type KubeKavachConfig = z.infer<typeof KubeKavachConfigSchema>;
export type AIConfig = z.infer<typeof AIConfigSchema>;
export type ReplayConfig = z.infer<typeof ReplayConfigSchema>;
export type APIConfig = z.infer<typeof APIConfigSchema>;
export type User = z.infer<typeof UserSchema>;

