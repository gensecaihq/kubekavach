
import { V1Pod } from '@kubernetes/client-node';
import { loadConfig } from '@kubekavach/core';
import Dockerode from 'dockerode';
import inquirer from 'inquirer';
import { ImageScanner } from './image-scanner';
import { ContainerIsolation } from './container-isolation';

// Custom error for replay-specific failures
export class ReplayError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'ReplayError';
  }
}

export class PodReplayer {
  private readonly docker: Dockerode;
  private readonly config;
  private readonly scanner: ImageScanner;
  private readonly isolation: ContainerIsolation;

  constructor() {
    this.config = loadConfig().replay || {};
    this.scanner = new ImageScanner();
    try {
      this.docker = new Dockerode(); // Assumes Docker is available
      this.isolation = new ContainerIsolation(this.docker);
    } catch (error: any) {
      throw new ReplayError('Failed to connect to Docker daemon. Is it running?', error);
    }
  }

  async replayPod(pod: V1Pod): Promise<void> {
    return this.replay(pod);
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

      // Perform real image security scanning
      console.log(`Scanning image ${containerSpec.image} for vulnerabilities...`);
      const scanResult = await this.scanner.scanImage(containerSpec.image, false);
      const securityReport = await this.scanner.generateSecurityReport(scanResult);
      console.log('\n' + securityReport + '\n');

      // Check if image is safe to run
      if (scanResult.vulnerabilities.critical > 0 && !this.config.allowCriticalVulnerabilities) {
        const { proceed } = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceed',
          message: `Image contains ${scanResult.vulnerabilities.critical} CRITICAL vulnerabilities. Proceed anyway?`,
          default: false
        }]);
        
        if (!proceed) {
          throw new ReplayError('Replay aborted due to critical vulnerabilities in image');
        }
      }

      console.log(`Pulling image: ${containerSpec.image}...`);
      await this.docker.pull(containerSpec.image);

      // Check isolation support
      const isolationCheck = this.isolation.validateIsolationSupport();
      if (!isolationCheck.supported) {
        console.warn('Full isolation not supported on this platform');
      }
      isolationCheck.warnings.forEach(w => console.warn(`Warning: ${w}`));

      // Create isolated network if enabled
      let network;
      if (this.config.enableNetworkIsolation !== false) {
        console.log('Creating isolated network...');
        network = await this.isolation.createIsolatedNetwork(podName || 'unknown');
      }

      console.log('Creating isolated container...');
      const baseConfig: Dockerode.ContainerCreateOptions = {
        Image: containerSpec.image,
        name: `kubekavach-replay-${podName}`,
        Cmd: containerSpec.command,
        Env: containerSpec.env?.map(e => `${e.name}=${e.value}`),
        Labels: {
          'kubekavach.pod': podName || 'unknown',
          'kubekavach.replay': 'true'
        }
      };

      // Apply security isolation
      const secureConfig = this.isolation.getSecureContainerConfig(baseConfig, {
        enableNetworkIsolation: this.config.enableNetworkIsolation !== false,
        cpuLimit: this.config.cpuLimit || 0.5,
        memoryLimit: this.config.memoryLimit || '512m',
        readOnlyRootFilesystem: this.config.readOnlyRootFilesystem || false
      });

      const container = await this.docker.createContainer(secureConfig);

      // Connect to isolated network if created
      if (network) {
        await network.connect({ Container: container.id });
      }

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

  async cleanup(): Promise<void> {
    try {
      // List all containers with kubekavach labels
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          label: ['kubekavach.replay=true']
        }
      });

      // Stop and remove all replay containers
      for (const containerInfo of containers) {
        const container = this.docker.getContainer(containerInfo.Id);
        
        try {
          if (containerInfo.State === 'running') {
            await container.stop();
          }
          await container.remove();
          console.log(`Cleaned up container: ${containerInfo.Id.substring(0, 12)}`);
        } catch (error) {
          console.warn(`Failed to cleanup container ${containerInfo.Id.substring(0, 12)}:`, error);
        }
      }

      // Cleanup isolated networks
      await this.isolation.cleanupNetworks();
      
    } catch (error: any) {
      throw new ReplayError('Failed to cleanup replay resources', error);
    }
  }

}
