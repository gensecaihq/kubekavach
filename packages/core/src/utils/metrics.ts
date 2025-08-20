import { EventEmitter } from 'events';
import { logger } from './logger';

export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
}

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'warning';
  message?: string;
  details?: Record<string, any>;
  timestamp: number;
}

class MetricsCollector extends EventEmitter {
  private metrics: Map<string, Metric> = new Map();
  private healthChecks: Map<string, HealthCheck> = new Map();
  private timers: Map<string, number> = new Map();

  // Counter metrics
  incrementCounter(name: string, value = 1, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    const existing = this.metrics.get(key);
    
    const metric: Metric = {
      name,
      value: (existing?.value || 0) + value,
      timestamp: Date.now(),
      labels,
      type: 'counter'
    };
    
    this.metrics.set(key, metric);
    this.emit('metric', metric);
    
    logger.metric(name, metric.value, { labels });
  }

  // Gauge metrics (current value)
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    
    const metric: Metric = {
      name,
      value,
      timestamp: Date.now(),
      labels,
      type: 'gauge'
    };
    
    this.metrics.set(key, metric);
    this.emit('metric', metric);
    
    logger.metric(name, value, { labels });
  }

  // Timer metrics
  startTimer(name: string): string {
    const timerId = `${name}_${Date.now()}_${Math.random()}`;
    this.timers.set(timerId, Date.now());
    return timerId;
  }

  endTimer(timerId: string, labels?: Record<string, string>): number {
    const startTime = this.timers.get(timerId);
    if (!startTime) {
      logger.warn('Timer not found', { timerId });
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(timerId);

    const name = timerId.split('_')[0] || 'unknown_timer';
    const key = this.getMetricKey(name, labels);
    
    const metric: Metric = {
      name,
      value: duration,
      timestamp: Date.now(),
      labels,
      type: 'timer'
    };
    
    this.metrics.set(key, metric);
    this.emit('metric', metric);
    
    logger.performance(name, duration, { labels });
    return duration;
  }

  // Histogram for latency distribution
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    
    const metric: Metric = {
      name,
      value,
      timestamp: Date.now(),
      labels,
      type: 'histogram'
    };
    
    this.metrics.set(key, metric);
    this.emit('metric', metric);
  }

  // Health checks
  registerHealthCheck(name: string, checkFn: () => Promise<HealthCheck>): void {
    setInterval(async () => {
      try {
        const result = await checkFn();
        this.healthChecks.set(name, result);
        this.emit('healthCheck', result);
      } catch (error) {
        const healthCheck: HealthCheck = {
          name,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now()
        };
        this.healthChecks.set(name, healthCheck);
        this.emit('healthCheck', healthCheck);
        logger.error('Health check failed', error as Error, { healthCheck: name });
      }
    }, 30000); // Check every 30 seconds
  }

  // Get all metrics
  getMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  // Get all health checks
  getHealthChecks(): HealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  // Get overall health status
  getOverallHealth(): 'healthy' | 'unhealthy' | 'warning' {
    const checks = this.getHealthChecks();
    if (checks.length === 0) return 'warning';
    
    if (checks.some(check => check.status === 'unhealthy')) {
      return 'unhealthy';
    }
    
    if (checks.some(check => check.status === 'warning')) {
      return 'warning';
    }
    
    return 'healthy';
  }

  // Clear old metrics (keep last hour)
  cleanup(): void {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [key, metric] of this.metrics.entries()) {
      if (metric.timestamp < oneHourAgo && metric.type !== 'gauge') {
        this.metrics.delete(key);
      }
    }
  }

  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    
    return `${name}{${labelStr}}`;
  }
}

// Singleton instance
export const metrics = new MetricsCollector();

// Start cleanup interval
setInterval(() => {
  metrics.cleanup();
}, 60000); // Cleanup every minute

// Application-specific metrics helpers
export const KubeKavachMetrics = {
  // Scan metrics
  scanStarted: (namespace?: string) => 
    metrics.incrementCounter('scans_started_total', 1, { namespace: namespace || 'all' }),
  
  scanCompleted: (namespace?: string, duration?: number) => {
    metrics.incrementCounter('scans_completed_total', 1, { namespace: namespace || 'all' });
    if (duration) {
      metrics.recordHistogram('scan_duration_ms', duration, { namespace: namespace || 'all' });
    }
  },
  
  scanFailed: (namespace?: string, error?: string) => 
    metrics.incrementCounter('scans_failed_total', 1, { 
      namespace: namespace || 'all', 
      error: error || 'unknown' 
    }),
  
  findingsDetected: (severity: string, count: number) => 
    metrics.incrementCounter('findings_detected_total', count, { severity }),
  
  // API metrics
  apiRequest: (method: string, path: string, status: number, duration: number) => {
    metrics.incrementCounter('api_requests_total', 1, { method, path, status: status.toString() });
    metrics.recordHistogram('api_request_duration_ms', duration, { method, path });
  },
  
  apiErrors: (method: string, path: string, error: string) => 
    metrics.incrementCounter('api_errors_total', 1, { method, path, error }),
  
  // Authentication metrics
  authAttempt: (success: boolean, reason?: string) => 
    metrics.incrementCounter('auth_attempts_total', 1, { 
      success: success.toString(), 
      reason: reason || 'unknown' 
    }),
  
  // Resource metrics
  setActiveConnections: (count: number) => 
    metrics.setGauge('active_connections', count),
  
  setMemoryUsage: (bytes: number) => 
    metrics.setGauge('memory_usage_bytes', bytes),
  
  setCpuUsage: (percentage: number) => 
    metrics.setGauge('cpu_usage_percentage', percentage),
  
  // Kubernetes cluster metrics
  setClusterResources: (type: string, count: number, namespace?: string) => 
    metrics.setGauge('cluster_resources_total', count, { 
      type, 
      namespace: namespace || 'all' 
    }),
  
  // Rule execution metrics
  ruleExecuted: (ruleId: string, duration: number, result: 'pass' | 'fail') => {
    metrics.incrementCounter('rules_executed_total', 1, { ruleId, result });
    metrics.recordHistogram('rule_execution_duration_ms', duration, { ruleId });
  }
};

export default metrics;