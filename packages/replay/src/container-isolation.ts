import Dockerode from 'dockerode';
import { logger } from '@kubekavach/core/utils/logger';

export interface IsolationConfig {
  enableNetworkIsolation: boolean;
  cpuLimit?: number; // CPU units (1 = 1 CPU core)
  memoryLimit?: string; // e.g., '512m', '1g'
  readOnlyRootFilesystem?: boolean;
  dropCapabilities?: string[];
  noNewPrivileges?: boolean;
  seccompProfile?: string;
  apparmorProfile?: string;
}

export class ContainerIsolation {
  private readonly defaultConfig: IsolationConfig = {
    enableNetworkIsolation: true,
    cpuLimit: 0.5, // Default to half a CPU
    memoryLimit: '512m',
    readOnlyRootFilesystem: false, // May break some apps
    dropCapabilities: ['ALL'],
    noNewPrivileges: true,
    seccompProfile: 'runtime/default',
    apparmorProfile: 'runtime/default'
  };

  constructor(private readonly docker: Dockerode) {}

  async createIsolatedNetwork(name: string): Promise<Dockerode.Network> {
    try {
      // Create an isolated bridge network with no external connectivity
      const network = await this.docker.createNetwork({
        Name: `kubekavach-isolated-${name}`,
        Driver: 'bridge',
        Internal: true, // No external connectivity
        CheckDuplicate: true,
        Options: {
          'com.docker.network.bridge.enable_ip_masquerade': 'false',
          'com.docker.network.bridge.enable_icc': 'false' // Disable inter-container communication
        },
        Labels: {
          'kubekavach.isolated': 'true',
          'kubekavach.pod': name
        }
      });

      logger.info(`Created isolated network for pod ${name}`);
      return network;
    } catch (error) {
      logger.error(`Failed to create isolated network for ${name}`, error);
      throw error;
    }
  }

  getSecureContainerConfig(
    baseConfig: Dockerode.ContainerCreateOptions,
    isolation?: Partial<IsolationConfig>
  ): Dockerode.ContainerCreateOptions {
    const config = { ...this.defaultConfig, ...isolation };
    
    // Merge with secure defaults
    const secureConfig: Dockerode.ContainerCreateOptions = {
      ...baseConfig,
      HostConfig: {
        ...baseConfig.HostConfig,
        
        // Resource limits
        CpuShares: config.cpuLimit ? Math.floor(config.cpuLimit * 1024) : undefined,
        Memory: this.parseMemoryLimit(config.memoryLimit),
        MemorySwap: this.parseMemoryLimit(config.memoryLimit), // Same as memory to prevent swap
        
        // Security options
        ReadonlyRootfs: config.readOnlyRootFilesystem,
        SecurityOpt: this.buildSecurityOptions(config),
        CapDrop: config.dropCapabilities,
        
        // Prevent privilege escalation
        Privileged: false,
        
        // Filesystem isolation
        IpcMode: 'private',
        PidMode: 'container',
        
        // Network isolation (if not already set)
        NetworkMode: config.enableNetworkIsolation ? undefined : baseConfig.HostConfig?.NetworkMode,
        
        // Prevent device access
        Devices: [],
        
        // Limit PIDs to prevent fork bombs
        PidsLimit: 100,
        
        // Disable dangerous sysctls
        Sysctls: {
          'kernel.msgmax': '8192',
          'kernel.msgmnb': '16384'
        }
      },
      
      // Add security labels
      Labels: {
        ...baseConfig.Labels,
        'kubekavach.isolated': 'true',
        'kubekavach.security.level': 'high'
      }
    };

    return secureConfig;
  }

  private parseMemoryLimit(limit?: string): number | undefined {
    if (!limit) return undefined;
    
    const units: { [key: string]: number } = {
      'b': 1,
      'k': 1024,
      'm': 1024 * 1024,
      'g': 1024 * 1024 * 1024
    };
    
    const match = limit.toLowerCase().match(/^(\d+)([bkmg])?$/);
    if (!match) return undefined;
    
    const value = parseInt(match[1]);
    const unit = match[2] || 'b';
    
    return value * units[unit];
  }

  private buildSecurityOptions(config: IsolationConfig): string[] {
    const options: string[] = [];
    
    if (config.noNewPrivileges) {
      options.push('no-new-privileges:true');
    }
    
    if (config.seccompProfile) {
      options.push(`seccomp=${config.seccompProfile}`);
    }
    
    if (config.apparmorProfile && process.platform === 'linux') {
      options.push(`apparmor=${config.apparmorProfile}`);
    }
    
    return options;
  }

  async cleanupIsolatedResources(podName: string): Promise<void> {
    try {
      // Clean up isolated network
      const networks = await this.docker.listNetworks({
        filters: {
          label: [`kubekavach.pod=${podName}`]
        }
      });
      
      for (const network of networks) {
        try {
          const net = this.docker.getNetwork(network.Id);
          await net.remove();
          logger.info(`Removed isolated network ${network.Name}`);
        } catch (error) {
          logger.warn(`Failed to remove network ${network.Name}`, error);
        }
      }
      
      // Clean up containers
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          label: [`kubekavach.pod=${podName}`]
        }
      });
      
      for (const container of containers) {
        try {
          const cont = this.docker.getContainer(container.Id);
          await cont.stop();
          await cont.remove();
          logger.info(`Removed container ${container.Names?.[0]}`);
        } catch (error) {
          logger.warn(`Failed to remove container ${container.Id}`, error);
        }
      }
    } catch (error) {
      logger.error(`Failed to cleanup resources for pod ${podName}`, error);
    }
  }

  validateIsolationSupport(): { supported: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let supported = true;
    
    // Check platform-specific features
    if (process.platform === 'darwin') {
      warnings.push('AppArmor profiles not supported on macOS');
      warnings.push('Seccomp filtering may be limited on macOS');
    }
    
    if (process.platform === 'win32') {
      warnings.push('Limited isolation features on Windows');
      supported = false;
    }
    
    return { supported, warnings };
  }

  async cleanupNetworks(): Promise<void> {
    try {
      // List all kubekavach isolated networks
      const networks = await this.docker.listNetworks({
        filters: {
          label: ['kubekavach.isolated=true']
        }
      });
      
      for (const networkInfo of networks) {
        try {
          const network = this.docker.getNetwork(networkInfo.Id);
          await network.remove();
          logger.info(`Cleaned up isolated network: ${networkInfo.Name}`);
        } catch (error) {
          logger.warn(`Failed to cleanup network ${networkInfo.Name}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup isolated networks', error);
    }
  }
}