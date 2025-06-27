
import { V1Pod } from '@kubernetes/client-node';
import { loadConfig } from '@kubekavach/core';
import Dockerode from 'dockerode';
import inquirer from 'inquirer';

// Custom error for replay-specific failures
export class ReplayError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'ReplayError';
  }
}

export class ReplayEngine {
  private readonly docker: Dockerode;
  private readonly config;

  constructor() {
    this.config = loadConfig().replay || {};
    try {
      this.docker = new Dockerode(); // Assumes Docker is available
    } catch (error: any) {
      throw new ReplayError('Failed to connect to Docker daemon. Is it running?', error);
    }
  }

  async replay(pod: V1Pod): Promise<void> {
    const podName = pod.metadata?.name;
    console.log(`Replaying pod ${podName}`);

    try {
      const sanitizedPod = await this.sanitizePodSpec(pod);
      const containerSpec = sanitizedPod.spec?.containers[0];
      if (!containerSpec || !containerSpec.image) {
        throw new ReplayError('Pod specification is missing a container or container image.');
      }

      // Perform image scanning (placeholder)
      await this.scanImage(containerSpec.image);

      console.log(`Pulling image: ${containerSpec.image}...`);
      await this.docker.pull(containerSpec.image);

      console.log('Creating container...');
      const container = await this.docker.createContainer({
        Image: containerSpec.image,
        name: `kubekavach-replay-${podName}`,
        Cmd: containerSpec.command,
        Env: containerSpec.env?.map(e => `${e.name}=${e.value}`),
        HostConfig: {
          CpuShares: 512,
          Memory: 512 * 1024 * 1024,
        },
      });

      await container.start();

      console.log(`Pod ${podName} replay started successfully as container ${container.id.substring(0, 12)}.`);
      console.log(`Run 'docker stop ${container.id.substring(0, 12)}' to stop.`);

    } catch (error: any) {
      throw new ReplayError(`Failed to replay pod ${podName}.`, error);
    }
  }

  private async sanitizePodSpec(pod: V1Pod): Promise<V1Pod> {
    console.log('Sanitizing pod spec...');
    const spec = JSON.parse(JSON.stringify(pod));

    if (spec.spec?.serviceAccountName) {
      spec.spec.serviceAccountName = undefined;
    }
    if (spec.spec?.automountServiceAccountToken) {
      spec.spec.automountServiceAccountToken = false;
    }

    // Handle secrets based on the configured strategy
    if (spec.spec?.containers) {
      for (const container of spec.spec.containers) {
        if (container.env) {
          for (const envVar of container.env) {
            if (envVar.valueFrom?.secretKeyRef) {
              envVar.value = await this.handleSecret(envVar.valueFrom.secretKeyRef);
              envVar.valueFrom = undefined;
            }
          }
        }
      }
    }

    return spec;
  }

  private async handleSecret(secretKeyRef: { name: string; key: string }): Promise<string> {
    switch (this.config.secretHandling) {
      case 'prompt':
        const { value } = await inquirer.prompt([{
          type: 'password',
          name: 'value',
          message: `Enter value for secret '${secretKeyRef.name}' key '${secretKeyRef.key}':`,
        }]);
        return value;
      case 'placeholder':
        return `KUBEKAVACH_PLACEHOLDER_${secretKeyRef.name}_${secretKeyRef.key}`;
      default:
        // Should not happen due to Zod validation, but as a fallback
        console.warn(`Unknown secret handling strategy: ${this.config.secretHandling}. Using placeholder.`);
        return `KUBEKAVACH_PLACEHOLDER_${secretKeyRef.name}_${secretKeyRef.key}`;
    }
  }

  private async scanImage(image: string): Promise<void> {
    console.log(`Scanning image ${image} for vulnerabilities... (placeholder)`);
    // In a real implementation, this would integrate with a tool like Trivy or Clair.
    // await runImageScanner(image);
    console.log(`Image ${image} scan completed.`);
  }
}
