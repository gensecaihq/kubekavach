import { promises as fs } from 'fs';
import { join } from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { logger } from './logger';
import { metrics } from './metrics';
import { database } from './database';

export interface BackupConfig {
  enabled: boolean;
  schedule: string; // Cron expression
  retention: number; // Days to keep backups
  location: string; // Local directory or cloud storage URL
  compression: boolean;
  encryption: boolean;
}

export interface BackupMetadata {
  id: string;
  timestamp: Date;
  size: number;
  type: 'full' | 'incremental';
  compressed: boolean;
  encrypted: boolean;
  checksum: string;
  location: string;
}

export interface DisasterRecoveryConfig {
  enabled: boolean;
  replicationTargets: string[];
  healthCheckInterval: number;
  failoverThreshold: number;
  autoFailover: boolean;
}

class BackupManager {
  private config: BackupConfig;
  private drConfig: DisasterRecoveryConfig;
  private isRunning = false;

  constructor(
    backupConfig: BackupConfig,
    drConfig: DisasterRecoveryConfig
  ) {
    this.config = backupConfig;
    this.drConfig = drConfig;
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Backup system disabled');
      return;
    }

    // Ensure backup directory exists
    try {
      await fs.mkdir(this.config.location, { recursive: true });
      logger.info('Backup system initialized', {
        location: this.config.location,
        retention: this.config.retention
      });
    } catch (error) {
      logger.error('Failed to initialize backup system', error as Error);
      throw error;
    }

    // Schedule regular backups
    if (this.config.schedule) {
      this.scheduleBackups();
    }
  }

  private scheduleBackups(): void {
    // Simple interval-based scheduling (in production, use cron)
    const intervalMs = this.parseSchedule(this.config.schedule);
    
    if (intervalMs > 0) {
      setInterval(async () => {
        if (!this.isRunning) {
          await this.createBackup('full');
        }
      }, intervalMs);

      logger.info('Backup schedule configured', {
        schedule: this.config.schedule,
        intervalMs
      });
    }
  }

  private parseSchedule(schedule: string): number {
    // Simple schedule parser - in production, use proper cron parser
    if (schedule === 'daily') return 24 * 60 * 60 * 1000; // 24 hours
    if (schedule === 'hourly') return 60 * 60 * 1000; // 1 hour
    if (schedule.includes('minutes')) {
      const minutes = parseInt(schedule.split(' ')[0]);
      return minutes * 60 * 1000;
    }
    return 0;
  }

  async createBackup(type: 'full' | 'incremental' = 'full'): Promise<BackupMetadata> {
    if (this.isRunning) {
      throw new Error('Backup already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();
    const backupId = `backup-${Date.now()}-${type}`;

    try {
      logger.info('Starting backup', { backupId, type });

      // Create backup data
      const backupData = await this.collectBackupData(type);
      
      // Generate backup file path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${backupId}-${timestamp}.json`;
      const filepath = join(this.config.location, filename);

      // Write backup data
      let finalPath = filepath;
      if (this.config.compression) {
        finalPath = `${filepath}.gz`;
        await this.writeCompressedBackup(backupData, finalPath);
      } else {
        await fs.writeFile(filepath, JSON.stringify(backupData, null, 2));
      }

      // Calculate file size and checksum
      const stats = await fs.stat(finalPath);
      const checksum = await this.calculateChecksum(finalPath);

      const metadata: BackupMetadata = {
        id: backupId,
        timestamp: new Date(),
        size: stats.size,
        type,
        compressed: this.config.compression,
        encrypted: this.config.encryption,
        checksum,
        location: finalPath
      };

      // Save backup metadata
      await this.saveBackupMetadata(metadata);

      const duration = Date.now() - startTime;
      logger.info('Backup completed successfully', {
        backupId,
        type,
        size: stats.size,
        duration,
        location: finalPath
      });

      metrics.incrementCounter('backups_created_total', 1, { type });
      metrics.recordHistogram('backup_duration_ms', duration, { type });
      metrics.setGauge('backup_size_bytes', stats.size, { backup_id: backupId });

      // Clean up old backups
      await this.cleanupOldBackups();

      return metadata;

    } catch (error) {
      logger.error('Backup failed', error as Error, { backupId, type });
      metrics.incrementCounter('backup_failures_total', 1, { type });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private async collectBackupData(type: 'full' | 'incremental'): Promise<any> {
    const data: any = {
      metadata: {
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        type
      }
    };

    try {
      // Backup scan results from database
      if (database) {
        const scanResults = await database.getScanHistory({ limit: 1000 });
        data.scanResults = scanResults;
        
        logger.info('Collected scan results for backup', {
          count: scanResults.length
        });
      }

      // Backup configuration
      data.configuration = {
        // Include non-sensitive configuration
        timestamp: new Date().toISOString()
      };

      // Backup metrics (last hour)
      const currentMetrics = metrics.getMetrics();
      data.metrics = currentMetrics.filter(m => 
        Date.now() - m.timestamp < 60 * 60 * 1000 // Last hour
      );

      logger.info('Backup data collection completed', {
        scanResultsCount: data.scanResults?.length || 0,
        metricsCount: data.metrics?.length || 0
      });

      return data;

    } catch (error) {
      logger.error('Failed to collect backup data', error as Error);
      throw error;
    }
  }

  private async writeCompressedBackup(data: any, filepath: string): Promise<void> {
    const readableStream = require('stream').Readable.from([JSON.stringify(data, null, 2)]);
    const writeStream = createWriteStream(filepath);
    const gzipStream = createGzip();

    await pipeline(readableStream, gzipStream, writeStream);
  }

  private async calculateChecksum(filepath: string): Promise<string> {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    const data = await fs.readFile(filepath);
    hash.update(data);
    return hash.digest('hex');
  }

  private async saveBackupMetadata(metadata: BackupMetadata): Promise<void> {
    const metadataPath = join(this.config.location, 'backup-metadata.json');
    
    let existingMetadata: BackupMetadata[] = [];
    try {
      const existing = await fs.readFile(metadataPath, 'utf-8');
      existingMetadata = JSON.parse(existing);
    } catch (error) {
      // File doesn't exist yet, that's ok
    }

    existingMetadata.push(metadata);
    await fs.writeFile(metadataPath, JSON.stringify(existingMetadata, null, 2));
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const metadataPath = join(this.config.location, 'backup-metadata.json');
      const metadata: BackupMetadata[] = JSON.parse(
        await fs.readFile(metadataPath, 'utf-8')
      );

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retention);

      const toDelete = metadata.filter(m => new Date(m.timestamp) < cutoffDate);
      const toKeep = metadata.filter(m => new Date(m.timestamp) >= cutoffDate);

      for (const backup of toDelete) {
        try {
          await fs.unlink(backup.location);
          logger.info('Deleted old backup', {
            backupId: backup.id,
            location: backup.location
          });
        } catch (error) {
          logger.warn('Failed to delete old backup file', {
            backupId: backup.id,
            location: backup.location,
            error: (error as Error).message
          });
        }
      }

      // Update metadata file
      await fs.writeFile(metadataPath, JSON.stringify(toKeep, null, 2));

      if (toDelete.length > 0) {
        logger.info('Cleanup completed', {
          deletedCount: toDelete.length,
          remainingCount: toKeep.length
        });

        metrics.incrementCounter('backups_cleaned_total', toDelete.length);
      }

    } catch (error) {
      logger.error('Failed to cleanup old backups', error as Error);
    }
  }

  async restoreBackup(backupId: string): Promise<void> {
    logger.info('Starting backup restoration', { backupId });

    try {
      const metadata = await this.getBackupMetadata(backupId);
      if (!metadata) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      // Verify backup integrity
      const currentChecksum = await this.calculateChecksum(metadata.location);
      if (currentChecksum !== metadata.checksum) {
        throw new Error(`Backup integrity check failed for ${backupId}`);
      }

      // Read backup data
      let backupData: any;
      if (metadata.compressed) {
        backupData = await this.readCompressedBackup(metadata.location);
      } else {
        const rawData = await fs.readFile(metadata.location, 'utf-8');
        backupData = JSON.parse(rawData);
      }

      // Restore data
      await this.restoreData(backupData);

      logger.info('Backup restoration completed', { backupId });
      metrics.incrementCounter('backups_restored_total', 1);

    } catch (error) {
      logger.error('Backup restoration failed', error as Error, { backupId });
      metrics.incrementCounter('backup_restoration_failures_total', 1);
      throw error;
    }
  }

  private async getBackupMetadata(backupId: string): Promise<BackupMetadata | null> {
    try {
      const metadataPath = join(this.config.location, 'backup-metadata.json');
      const metadata: BackupMetadata[] = JSON.parse(
        await fs.readFile(metadataPath, 'utf-8')
      );
      return metadata.find(m => m.id === backupId) || null;
    } catch (error) {
      return null;
    }
  }

  private async readCompressedBackup(filepath: string): Promise<any> {
    const { createGunzip } = require('zlib');
    const { createReadStream } = require('fs');
    
    const readStream = createReadStream(filepath);
    const gunzipStream = createGunzip();
    
    let data = '';
    gunzipStream.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });

    await pipeline(readStream, gunzipStream);
    return JSON.parse(data);
  }

  private async restoreData(backupData: any): Promise<void> {
    logger.info('Restoring backup data', {
      version: backupData.metadata?.version,
      timestamp: backupData.metadata?.timestamp
    });

    // Restore scan results to database
    if (backupData.scanResults && database) {
      for (const scanResult of backupData.scanResults) {
        try {
          await database.saveScanResult(scanResult);
        } catch (error) {
          logger.warn('Failed to restore scan result', {
            scanId: scanResult.id,
            error: (error as Error).message
          });
        }
      }
      
      logger.info('Restored scan results', {
        count: backupData.scanResults.length
      });
    }

    // Note: Configuration and metrics are typically not restored
    // as they may conflict with current system state
  }

  async listBackups(): Promise<BackupMetadata[]> {
    try {
      const metadataPath = join(this.config.location, 'backup-metadata.json');
      const metadata: BackupMetadata[] = JSON.parse(
        await fs.readFile(metadataPath, 'utf-8')
      );
      return metadata.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      return [];
    }
  }

  getStats(): {
    enabled: boolean;
    isRunning: boolean;
    location: string;
    retention: number;
  } {
    return {
      enabled: this.config.enabled,
      isRunning: this.isRunning,
      location: this.config.location,
      retention: this.config.retention
    };
  }
}

// Disaster recovery manager
class DisasterRecoveryManager {
  private config: DisasterRecoveryConfig;
  private healthStatus = new Map<string, boolean>();

  constructor(config: DisasterRecoveryConfig) {
    this.config = config;
    
    if (config.enabled) {
      this.startHealthMonitoring();
    }
  }

  private startHealthMonitoring(): void {
    setInterval(async () => {
      await this.checkTargetHealth();
    }, this.config.healthCheckInterval);

    logger.info('Disaster recovery monitoring started', {
      targets: this.config.replicationTargets.length,
      interval: this.config.healthCheckInterval
    });
  }

  private async checkTargetHealth(): Promise<void> {
    for (const target of this.config.replicationTargets) {
      try {
        // Simple health check - in production, use proper health endpoints
        const isHealthy = await this.pingTarget(target);
        const wasHealthy = this.healthStatus.get(target);
        
        this.healthStatus.set(target, isHealthy);

        if (wasHealthy !== undefined && wasHealthy !== isHealthy) {
          logger.info('Target health status changed', {
            target,
            healthy: isHealthy,
            previouslyHealthy: wasHealthy
          });

          metrics.setGauge('dr_target_health', isHealthy ? 1 : 0, {
            target: target.substring(0, 20) // Truncate for metrics
          });
        }

      } catch (error) {
        logger.error('Health check failed for target', error as Error, {
          target
        });
        this.healthStatus.set(target, false);
      }
    }
  }

  private async pingTarget(target: string): Promise<boolean> {
    // Simple implementation - in production, use proper health checks
    try {
      const http = require('http');
      const url = new URL(target);
      
      return new Promise((resolve) => {
        const req = http.get({
          hostname: url.hostname,
          port: url.port || 80,
          path: '/health',
          timeout: 5000
        }, (res: any) => {
          resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  getHealthStatus(): Map<string, boolean> {
    return new Map(this.healthStatus);
  }

  async triggerFailover(targetIndex: number): Promise<void> {
    if (targetIndex >= this.config.replicationTargets.length) {
      throw new Error('Invalid target index');
    }

    const target = this.config.replicationTargets[targetIndex];
    logger.info('Triggering failover', { target });

    // Implementation depends on infrastructure
    // Could involve DNS updates, load balancer reconfiguration, etc.
    
    metrics.incrementCounter('failovers_triggered_total', 1, {
      target: target.substring(0, 20)
    });
  }
}

// Factory functions
export function createBackupManager(
  backupConfig: BackupConfig,
  drConfig: DisasterRecoveryConfig
): BackupManager {
  return new BackupManager(backupConfig, drConfig);
}

export function createDisasterRecoveryManager(
  config: DisasterRecoveryConfig
): DisasterRecoveryManager {
  return new DisasterRecoveryManager(config);
}

// Default configurations
export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: false,
  schedule: 'daily',
  retention: 30, // 30 days
  location: './backups',
  compression: true,
  encryption: false
};

export const DEFAULT_DR_CONFIG: DisasterRecoveryConfig = {
  enabled: false,
  replicationTargets: [],
  healthCheckInterval: 30000, // 30 seconds
  failoverThreshold: 3,
  autoFailover: false
};