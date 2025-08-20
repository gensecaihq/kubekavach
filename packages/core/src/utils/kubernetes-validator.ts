
import { z } from 'zod';

// Placeholder for a more comprehensive Kubernetes schema validator
// In a real-world scenario, this would involve loading and validating
// against the OpenAPI schema for the specific Kubernetes version.
export function validateKubernetesManifest(manifest: any): boolean {
  try {
    // Basic validation: check for kind and apiVersion
    if (!manifest || typeof manifest !== 'object') {
      console.warn('Invalid manifest: not an object', { manifest });
      return false;
    }

    if (!manifest.kind || !manifest.apiVersion) {
      console.warn('Manifest is missing required fields', { 
        hasKind: !!manifest.kind, 
        hasApiVersion: !!manifest.apiVersion,
        manifestKeys: Object.keys(manifest) 
      });
      return false;
    }

    // Validate metadata
    if (!manifest.metadata || typeof manifest.metadata !== 'object') {
      console.warn('Manifest is missing metadata', { kind: manifest.kind });
      return false;
    }

    if (!manifest.metadata.name || typeof manifest.metadata.name !== 'string') {
      console.warn('Manifest metadata is missing name', { kind: manifest.kind });
      return false;
    }

    // Example: Basic validation for a Pod manifest
    if (manifest.kind === 'Pod' && manifest.apiVersion === 'v1') {
      try {
        // A more complete validation would use a Zod schema derived from OpenAPI
        z.object({
          kind: z.literal('Pod'),
          apiVersion: z.literal('v1'),
          metadata: z.object({
            name: z.string().min(1),
            namespace: z.string().optional(),
            labels: z.record(z.string()).optional(),
            annotations: z.record(z.string()).optional(),
          }).passthrough(),
          spec: z.object({
            containers: z.array(z.object({
              name: z.string().min(1),
              image: z.string().min(1),
              securityContext: z.object({}).passthrough().optional(),
              resources: z.object({}).passthrough().optional(),
            }).passthrough()).min(1),
          }).passthrough(),
        }).parse(manifest);
        return true;
      } catch (error) {
        console.warn('Pod manifest failed schema validation:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          podName: manifest.metadata?.name,
          namespace: manifest.metadata?.namespace
        });
        return false;
      }
    }

    // For other resource types, perform basic validation
    const supportedKinds = ['Pod', 'Deployment', 'DaemonSet', 'StatefulSet', 'Job', 'Service', 'NetworkPolicy'];
    if (!supportedKinds.includes(manifest.kind)) {
      console.warn('Unsupported resource kind', { kind: manifest.kind });
      return false;
    }

    return true;
  } catch (error) {
    console.error('Unexpected error during manifest validation:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      manifest: manifest
    });
    return false;
  }
}
