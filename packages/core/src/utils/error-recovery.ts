import { logger } from './logger';
import { metrics } from './metrics';

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  jitter: true
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 60000,
  monitoringPeriod: 30000
};

export class RetryManager {
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context: string = 'unknown'
  ): Promise<T> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error;
    
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        const result = await fn();
        
        if (attempt > 1) {
          logger.info('Operation succeeded after retry', {
            context,
            attempt,
            totalAttempts: retryConfig.maxAttempts
          });
          
          metrics.incrementCounter('retry_success_total', 1, {
            context,
            attempt: attempt.toString()
          });
        }
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        
        logger.warn('Operation failed, will retry', {
          context,
          attempt,
          totalAttempts: retryConfig.maxAttempts,
          error: lastError.message
        });
        
        metrics.incrementCounter('retry_attempt_total', 1, {
          context,
          attempt: attempt.toString()
        });
        
        if (attempt === retryConfig.maxAttempts) {
          logger.error('Operation failed after all retries', lastError, {
            context,
            totalAttempts: retryConfig.maxAttempts
          });
          
          metrics.incrementCounter('retry_exhausted_total', 1, { context });
          throw lastError;
        }
        
        // Calculate delay with exponential backoff
        const baseDelay = Math.min(
          retryConfig.initialDelay * Math.pow(retryConfig.backoffFactor, attempt - 1),
          retryConfig.maxDelay
        );
        
        // Add jitter to prevent thundering herd
        const delay = retryConfig.jitter 
          ? baseDelay * (0.5 + Math.random() * 0.5)
          : baseDelay;
        
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;
  private successCount = 0;
  
  constructor(
    private name: string,
    private config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG
  ) {
    this.startMonitoring();
  }
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        const error = new Error(`Circuit breaker is OPEN for ${this.name}`);
        
        logger.warn('Circuit breaker blocked request', {
          circuitBreakerName: this.name,
          state: this.state,
          nextAttemptTime: this.nextAttemptTime
        });
        
        metrics.incrementCounter('circuit_breaker_blocked_total', 1, {
          name: this.name
        });
        
        throw error;
      } else {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
        
        logger.info('Circuit breaker transitioning to HALF_OPEN', {
          circuitBreakerName: this.name
        });
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
      
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      
      // Require a few successes before fully closing
      if (this.successCount >= 3) {
        this.state = CircuitBreakerState.CLOSED;
        
        logger.info('Circuit breaker closed after recovery', {
          circuitBreakerName: this.name,
          successCount: this.successCount
        });
        
        metrics.incrementCounter('circuit_breaker_closed_total', 1, {
          name: this.name
        });
      }
    }
    
    metrics.incrementCounter('circuit_breaker_success_total', 1, {
      name: this.name,
      state: this.state
    });
  }
  
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
      
      logger.warn('Circuit breaker opened from HALF_OPEN state', {
        circuitBreakerName: this.name,
        failureCount: this.failureCount
      });
      
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
      
      logger.error('Circuit breaker opened due to failure threshold', {
        circuitBreakerName: this.name,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold
      } as any);
      
      metrics.incrementCounter('circuit_breaker_opened_total', 1, {
        name: this.name
      });
    }
    
    metrics.incrementCounter('circuit_breaker_failure_total', 1, {
      name: this.name,
      state: this.state
    });
  }
  
  private startMonitoring(): void {
    setInterval(() => {
      metrics.setGauge('circuit_breaker_state', this.getStateValue(), {
        name: this.name,
        state: this.state
      });
      
      metrics.setGauge('circuit_breaker_failure_count', this.failureCount, {
        name: this.name
      });
      
    }, this.config.monitoringPeriod);
  }
  
  private getStateValue(): number {
    switch (this.state) {
      case CircuitBreakerState.CLOSED: return 0;
      case CircuitBreakerState.HALF_OPEN: return 1;
      case CircuitBreakerState.OPEN: return 2;
      default: return -1;
    }
  }
  
  getState(): CircuitBreakerState {
    return this.state;
  }
  
  getStats(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }
  
  // Manual controls for testing/admin
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    
    logger.info('Circuit breaker manually reset', {
      circuitBreakerName: this.name
    });
  }
  
  forceOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
    
    logger.warn('Circuit breaker manually opened', {
      circuitBreakerName: this.name
    });
  }
}

// Global instances
export const retryManager = new RetryManager();

// Circuit breaker registry
const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string, 
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    const fullConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    circuitBreakers.set(name, new CircuitBreaker(name, fullConfig));
  }
  
  return circuitBreakers.get(name)!;
}

export function getAllCircuitBreakers(): Map<string, CircuitBreaker> {
  return new Map(circuitBreakers);
}

// Helper functions for common patterns
export async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  config?: Partial<RetryConfig>
): Promise<T> {
  return retryManager.executeWithRetry(fn, config, context);
}

export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  circuitBreakerName: string,
  config?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const circuitBreaker = getCircuitBreaker(circuitBreakerName, config);
  return circuitBreaker.execute(fn);
}

export async function withRetryAndCircuitBreaker<T>(
  fn: () => Promise<T>,
  context: string,
  retryConfig?: Partial<RetryConfig>,
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const circuitBreaker = getCircuitBreaker(context, circuitBreakerConfig);
  
  return circuitBreaker.execute(async () => {
    return retryManager.executeWithRetry(fn, retryConfig, context);
  });
}