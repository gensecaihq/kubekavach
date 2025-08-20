import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import { metrics, HealthCheck, KubeKavachMetrics } from './metrics';
import { logger } from './logger';
import { loadConfig } from './config-loader';
// import { createConnection } from 'net';
// import { promisify } from 'util';

export interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'warning';
  checks: HealthCheck[];
  timestamp: number;
  version: string;
  uptime: number;
}

class HealthManager {
  private startTime: number = Date.now();
  private version: string;

  constructor() {
    this.version = process.env.KUBEKAVACH_VERSION || '0.1.0';
    this.setupHealthChecks();
    this.setupSystemMetrics();
  }

  private setupHealthChecks(): void {
    // Kubernetes connectivity check (gracefully handles missing cluster)
    metrics.registerHealthCheck('kubernetes', async (): Promise<HealthCheck> => {
      try {
        const config = loadConfig();
        
        // Skip Kubernetes check if no kubeconfig is available (development mode)
        if (!config.kubeconfig) {
          return {
            name: 'kubernetes',
            status: 'warning',
            message: 'No Kubernetes cluster configured (development mode)',
            timestamp: Date.now()
          };
        }

        const kubeConfig = new KubeConfig();
        kubeConfig.loadFromFile(config.kubeconfig);

        const cluster = kubeConfig.getCurrentCluster();
        if (!cluster) {
          return {
            name: 'kubernetes',
            status: 'unhealthy',
            message: 'No Kubernetes cluster configured in kubeconfig',
            timestamp: Date.now()
          };
        }

        // Test connectivity by making a simple API call with timeout
        const coreV1Api = kubeConfig.makeApiClient(CoreV1Api);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Kubernetes API timeout')), 5000)
        );
        
        await Promise.race([
          coreV1Api.listPodForAllNamespaces(),
          timeoutPromise
        ]);

        return {
          name: 'kubernetes',
          status: 'healthy',
          message: 'Successfully connected to Kubernetes API',
          details: { cluster: cluster.name },
          timestamp: Date.now()
        };
      } catch (error) {
        logger.error('Kubernetes health check failed', error as Error);
        return {
          name: 'kubernetes',
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now()
        };
      }
    });

    // Docker connectivity check (for replay functionality)
    metrics.registerHealthCheck('docker', async (): Promise<HealthCheck> => {
      try {
        // Use dynamic import to avoid bundling dockerode in core
        const { default: Dockerode } = await import('dockerode');
        const docker = new Dockerode();
        
        await docker.ping();
        
        return {
          name: 'docker',
          status: 'healthy',
          message: 'Docker daemon is accessible',
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          name: 'docker',
          status: 'warning',
          message: 'Docker daemon not accessible - replay functionality will be limited',
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
          timestamp: Date.now()
        };
      }
    });

    // Memory usage check
    metrics.registerHealthCheck('memory', async (): Promise<HealthCheck> => {
      const usage = process.memoryUsage();
      const usagePercentage = (usage.heapUsed / usage.heapTotal) * 100;

      let status: 'healthy' | 'unhealthy' | 'warning' = 'healthy';
      let message = `Memory usage: ${Math.round(usagePercentage)}%`;

      if (usagePercentage > 90) {
        status = 'unhealthy';
        message = `Critical memory usage: ${Math.round(usagePercentage)}%`;
      } else if (usagePercentage > 75) {
        status = 'warning';
        message = `High memory usage: ${Math.round(usagePercentage)}%`;
      }

      return {
        name: 'memory',
        status,
        message,
        details: {
          heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + ' MB',
          heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + ' MB',
          external: Math.round(usage.external / 1024 / 1024) + ' MB',
          usagePercentage: Math.round(usagePercentage)
        },
        timestamp: Date.now()
      };
    });

    // Disk space check
    metrics.registerHealthCheck('disk', async (): Promise<HealthCheck> => {
      try {
        const fs = require('fs');
        const { promisify } = require('util');
        const stat = promisify(fs.stat);
        
        await stat(process.cwd());
        
        return {
          name: 'disk',
          status: 'healthy',
          message: 'Disk space accessible',
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          name: 'disk',
          status: 'unhealthy',
          message: 'Disk space check failed',
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
          timestamp: Date.now()
        };
      }
    });

    // Configuration validation check
    metrics.registerHealthCheck('configuration', async (): Promise<HealthCheck> => {
      try {
        const config = loadConfig();
        
        const issues: string[] = [];
        
        // Check API configuration
        if (!config.api?.port || config.api.port < 1 || config.api.port > 65535) {
          issues.push('Invalid API port configuration');
        }
        
        // Check users configuration
        if (!config.users || config.users.length === 0) {
          issues.push('No users configured');
        }
        
        // Check for API keys
        const hasValidApiKeys = config.users?.some(user => 
          user.apiKey && user.apiKey.length >= 16
        );
        if (!hasValidApiKeys) {
          issues.push('No valid API keys configured');
        }

        if (issues.length > 0) {
          return {
            name: 'configuration',
            status: 'warning',
            message: 'Configuration issues detected',
            details: { issues },
            timestamp: Date.now()
          };
        }

        return {
          name: 'configuration',
          status: 'healthy',
          message: 'Configuration is valid',
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          name: 'configuration',
          status: 'unhealthy',
          message: 'Configuration validation failed',
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
          timestamp: Date.now()
        };
      }
    });
  }

  private setupSystemMetrics(): void {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      try {
        // Memory metrics
        const usage = process.memoryUsage();
        KubeKavachMetrics.setMemoryUsage(usage.heapUsed);
        
        // CPU usage (approximate)
        const cpuUsage = process.cpuUsage();
        const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000 / 30; // Rough estimate
        KubeKavachMetrics.setCpuUsage(cpuPercent);

        // Uptime
        const uptime = Date.now() - this.startTime;
        metrics.setGauge('uptime_seconds', Math.floor(uptime / 1000));

        // Event loop lag (simple approximation)
        const start = process.hrtime();
        setImmediate(() => {
          const lag = process.hrtime(start);
          const lagMs = lag[0] * 1000 + lag[1] * 1e-6;
          metrics.setGauge('event_loop_lag_ms', lagMs);
        });

      } catch (error) {
        logger.error('Failed to collect system metrics', error as Error);
      }
    }, 30000);
  }

  async getHealth(): Promise<SystemHealth> {
    const checks = metrics.getHealthChecks();
    const status = metrics.getOverallHealth();
    const uptime = Date.now() - this.startTime;

    return {
      status,
      checks,
      timestamp: Date.now(),
      version: this.version,
      uptime: Math.floor(uptime / 1000)
    };
  }

  async getReadiness(): Promise<{ ready: boolean; message: string }> {
    const health = await this.getHealth();
    
    // Service is ready if critical components are healthy
    const criticalChecks = ['kubernetes', 'configuration'];
    const criticalIssues = health.checks.filter(check => 
      criticalChecks.includes(check.name) && check.status === 'unhealthy'
    );

    if (criticalIssues.length > 0) {
      return {
        ready: false,
        message: `Critical components unhealthy: ${criticalIssues.map(c => c.name).join(', ')}`
      };
    }

    return {
      ready: true,
      message: 'Service is ready to accept requests'
    };
  }

  async getLiveness(): Promise<{ alive: boolean; message: string }> {
    try {
      // Basic liveness check - can we respond to requests?
      const startTime = Date.now();
      
      // Test basic functionality
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const responseTime = Date.now() - startTime;
      
      if (responseTime > 5000) { // If it takes more than 5 seconds for a simple operation
        return {
          alive: false,
          message: 'Service is responding too slowly'
        };
      }

      return {
        alive: true,
        message: 'Service is alive and responsive'
      };
    } catch (error) {
      return {
        alive: false,
        message: `Service liveness check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Graceful shutdown handling
  setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);
      
      try {
        // Set health to unhealthy
        metrics.setGauge('shutting_down', 1);
        
        // Give time for load balancers to detect unhealthy state
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', error as Error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      metrics.incrementCounter('uncaught_exceptions_total', 1);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', new Error(String(reason)), { promise });
      metrics.incrementCounter('unhandled_rejections_total', 1);
    });
  }
}

// Singleton instance
export const healthManager = new HealthManager();

export default healthManager;