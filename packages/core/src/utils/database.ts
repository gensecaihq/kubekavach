import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from './logger';
import { metrics } from './metrics';
import { ScanResult, Finding } from '../types';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  connectionTimeout?: number;
}

export interface ScanResultRow {
  id: string;
  cluster: string;
  namespace?: string;
  timestamp: Date;
  duration: number;
  total_findings: number;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  findings: Finding[];
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface FindingRow {
  id: string;
  scan_id: string;
  rule_id: string;
  rule_name: string;
  severity: string;
  resource_kind: string;
  resource_name: string;
  resource_namespace?: string;
  message: string;
  remediation?: string;
  created_at: Date;
}

class DatabaseManager {
  private pool: Pool | null = null;
  private config: DatabaseConfig | null = null;

  async initialize(config: DatabaseConfig): Promise<void> {
    this.config = config;
    
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.maxConnections || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: config.connectionTimeout || 5000,
    });

    // Test connection
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      logger.info('Database connection established successfully');
      await this.createTables();
      
    } catch (error) {
      logger.error('Failed to connect to database', error as Error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.pool) throw new Error('Database not initialized');

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create scan_results table
      await client.query(`
        CREATE TABLE IF NOT EXISTS scan_results (
          id VARCHAR(255) PRIMARY KEY,
          cluster VARCHAR(255) NOT NULL,
          namespace VARCHAR(255),
          timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
          duration INTEGER NOT NULL,
          total_findings INTEGER NOT NULL DEFAULT 0,
          critical_findings INTEGER NOT NULL DEFAULT 0,
          high_findings INTEGER NOT NULL DEFAULT 0,
          medium_findings INTEGER NOT NULL DEFAULT 0,
          low_findings INTEGER NOT NULL DEFAULT 0,
          findings JSONB,
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Create findings table for detailed analysis
      await client.query(`
        CREATE TABLE IF NOT EXISTS findings (
          id VARCHAR(255) PRIMARY KEY,
          scan_id VARCHAR(255) NOT NULL REFERENCES scan_results(id) ON DELETE CASCADE,
          rule_id VARCHAR(50) NOT NULL,
          rule_name VARCHAR(255) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          resource_kind VARCHAR(100) NOT NULL,
          resource_name VARCHAR(255) NOT NULL,
          resource_namespace VARCHAR(255),
          message TEXT NOT NULL,
          remediation TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Create users table for API key management
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          api_key_hash VARCHAR(255) UNIQUE NOT NULL,
          roles JSONB NOT NULL DEFAULT '[]',
          is_active BOOLEAN DEFAULT true,
          last_login TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Create metrics table for historical data
      await client.query(`
        CREATE TABLE IF NOT EXISTS metrics (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          value NUMERIC NOT NULL,
          labels JSONB,
          type VARCHAR(50) NOT NULL,
          timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Create indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scan_results_cluster_timestamp 
        ON scan_results(cluster, timestamp DESC);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scan_results_namespace_timestamp 
        ON scan_results(namespace, timestamp DESC);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_findings_scan_id 
        ON findings(scan_id);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_findings_severity 
        ON findings(severity);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_findings_rule_id 
        ON findings(rule_id);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp 
        ON metrics(name, timestamp DESC);
      `);

      await client.query('COMMIT');
      logger.info('Database tables created/verified successfully');
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create database tables', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveScanResult(scanResult: ScanResult): Promise<void> {
    if (!this.pool) throw new Error('Database not initialized');

    const client = await this.pool.connect();
    const startTime = Date.now();
    
    try {
      await client.query('BEGIN');

      // Insert scan result
      await client.query(`
        INSERT INTO scan_results (
          id, cluster, namespace, timestamp, duration,
          total_findings, critical_findings, high_findings, medium_findings, low_findings,
          findings, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          duration = EXCLUDED.duration,
          total_findings = EXCLUDED.total_findings,
          critical_findings = EXCLUDED.critical_findings,
          high_findings = EXCLUDED.high_findings,
          medium_findings = EXCLUDED.medium_findings,
          low_findings = EXCLUDED.low_findings,
          findings = EXCLUDED.findings,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `, [
        scanResult.id,
        scanResult.cluster,
        scanResult.namespace || null,
        new Date(scanResult.timestamp),
        scanResult.duration,
        scanResult.summary.total,
        scanResult.summary.critical,
        scanResult.summary.high,
        scanResult.summary.medium,
        scanResult.summary.low,
        JSON.stringify(scanResult.findings),
        JSON.stringify({ version: '0.1.0' })
      ]);

      // Insert individual findings for analysis
      for (const finding of scanResult.findings) {
        await client.query(`
          INSERT INTO findings (
            id, scan_id, rule_id, rule_name, severity,
            resource_kind, resource_name, resource_namespace,
            message, remediation
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO NOTHING
        `, [
          `${scanResult.id}_${finding.ruleId}_${finding.resource.kind}_${finding.resource.name}`,
          scanResult.id,
          finding.ruleId,
          finding.ruleName,
          finding.severity,
          finding.resource.kind,
          finding.resource.name,
          finding.resource.namespace || null,
          finding.message,
          finding.remediation || null
        ]);
      }

      await client.query('COMMIT');
      
      const duration = Date.now() - startTime;
      logger.info('Scan result saved to database', { 
        scanId: scanResult.id, 
        findingsCount: scanResult.findings.length,
        duration 
      });
      
      metrics.recordHistogram('database_operation_duration_ms', duration, { operation: 'save_scan_result' });
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to save scan result to database', error as Error, { scanId: scanResult.id });
      metrics.incrementCounter('database_errors_total', 1, { operation: 'save_scan_result' });
      throw error;
    } finally {
      client.release();
    }
  }

  async getScanResult(scanId: string): Promise<ScanResult | null> {
    if (!this.pool) throw new Error('Database not initialized');

    const startTime = Date.now();
    
    try {
      const result = await this.pool.query(`
        SELECT * FROM scan_results WHERE id = $1
      `, [scanId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0] as ScanResultRow;
      const scanResult: ScanResult = {
        id: row.id,
        cluster: row.cluster,
        namespace: row.namespace || undefined,
        timestamp: row.timestamp.toISOString(),
        duration: row.duration,
        summary: {
          total: row.total_findings,
          critical: row.critical_findings,
          high: row.high_findings,
          medium: row.medium_findings,
          low: row.low_findings
        },
        findings: row.findings || []
      };

      const duration = Date.now() - startTime;
      metrics.recordHistogram('database_operation_duration_ms', duration, { operation: 'get_scan_result' });
      
      return scanResult;
      
    } catch (error) {
      logger.error('Failed to get scan result from database', error as Error, { scanId });
      metrics.incrementCounter('database_errors_total', 1, { operation: 'get_scan_result' });
      throw error;
    }
  }

  async getScanHistory(options: {
    cluster?: string;
    namespace?: string;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<ScanResult[]> {
    if (!this.pool) throw new Error('Database not initialized');

    const startTime = Date.now();
    const { cluster, namespace, limit = 50, offset = 0, startDate, endDate } = options;
    
    try {
      let query = `
        SELECT * FROM scan_results 
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (cluster) {
        query += ` AND cluster = $${paramIndex}`;
        params.push(cluster);
        paramIndex++;
      }

      if (namespace) {
        query += ` AND namespace = $${paramIndex}`;
        params.push(namespace);
        paramIndex++;
      }

      if (startDate) {
        query += ` AND timestamp >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND timestamp <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      query += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await this.pool.query(query, params);
      
      const scanResults: ScanResult[] = result.rows.map((row: ScanResultRow) => ({
        id: row.id,
        cluster: row.cluster,
        namespace: row.namespace || undefined,
        timestamp: row.timestamp.toISOString(),
        duration: row.duration,
        summary: {
          total: row.total_findings,
          critical: row.critical_findings,
          high: row.high_findings,
          medium: row.medium_findings,
          low: row.low_findings
        },
        findings: row.findings || []
      }));

      const duration = Date.now() - startTime;
      metrics.recordHistogram('database_operation_duration_ms', duration, { operation: 'get_scan_history' });
      
      return scanResults;
      
    } catch (error) {
      logger.error('Failed to get scan history from database', error as Error, options);
      metrics.incrementCounter('database_errors_total', 1, { operation: 'get_scan_history' });
      throw error;
    }
  }

  async getSecurityTrends(days: number = 30): Promise<{
    date: string;
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  }[]> {
    if (!this.pool) throw new Error('Database not initialized');

    try {
      const result = await this.pool.query(`
        SELECT 
          DATE(timestamp) as date,
          COUNT(*) as scan_count,
          AVG(total_findings) as avg_total,
          AVG(critical_findings) as avg_critical,
          AVG(high_findings) as avg_high,
          AVG(medium_findings) as avg_medium,
          AVG(low_findings) as avg_low
        FROM scan_results 
        WHERE timestamp >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `);

      return result.rows.map(row => ({
        date: row.date,
        total: Math.round(row.avg_total),
        critical: Math.round(row.avg_critical),
        high: Math.round(row.avg_high),
        medium: Math.round(row.avg_medium),
        low: Math.round(row.avg_low)
      }));
      
    } catch (error) {
      logger.error('Failed to get security trends', error as Error);
      throw error;
    }
  }

  async cleanup(retentionDays: number = 90): Promise<void> {
    if (!this.pool) throw new Error('Database not initialized');

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Delete old scan results and their findings (cascade will handle findings)
      const result = await client.query(`
        DELETE FROM scan_results 
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
      `);

      // Delete old metrics
      await client.query(`
        DELETE FROM metrics 
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
      `);

      await client.query('COMMIT');
      
      logger.info('Database cleanup completed', { 
        deletedScans: result.rowCount,
        retentionDays 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Database cleanup failed', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getConnectionHealth(): Promise<{
    healthy: boolean;
    activeConnections: number;
    totalConnections: number;
    idleConnections: number;
  }> {
    if (!this.pool) {
      return {
        healthy: false,
        activeConnections: 0,
        totalConnections: 0,
        idleConnections: 0
      };
    }

    return {
      healthy: true,
      activeConnections: this.pool.totalCount,
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount
    };
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Database connection pool closed');
    }
  }
}

// Singleton instance
export const database = new DatabaseManager();

export default database;