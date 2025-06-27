import { logger } from './logger';
import { metrics } from './metrics';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: any) => string;
  onLimitReached?: (req: any) => void;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalHits: number;
}

class RateLimiter {
  private stores: Map<string, Map<string, { count: number; resetTime: number }>> = new Map();
  
  createLimiter(name: string, config: RateLimitConfig) {
    if (!this.stores.has(name)) {
      this.stores.set(name, new Map());
    }

    return {
      check: (key: string): RateLimitResult => {
        const store = this.stores.get(name)!;
        const now = Date.now();
        const windowStart = now - config.windowMs;

        // Clean up expired entries
        for (const [k, data] of store.entries()) {
          if (data.resetTime <= now) {
            store.delete(k);
          }
        }

        let entry = store.get(key);
        if (!entry || entry.resetTime <= now) {
          entry = {
            count: 0,
            resetTime: now + config.windowMs
          };
          store.set(key, entry);
        }

        entry.count++;
        const allowed = entry.count <= config.maxRequests;
        const remaining = Math.max(0, config.maxRequests - entry.count);

        if (!allowed) {
          metrics.incrementCounter('rate_limit_exceeded_total', 1, { 
            limiter: name,
            key: key.substring(0, 10) + '...' // Partial key for privacy
          });
          
          logger.security('Rate limit exceeded', {
            limiter: name,
            key: key.substring(0, 10) + '...',
            count: entry.count,
            maxRequests: config.maxRequests
          });

          config.onLimitReached?.({ key, count: entry.count });
        }

        return {
          allowed,
          remaining,
          resetTime: entry.resetTime,
          totalHits: entry.count
        };
      },

      reset: (key: string): void => {
        const store = this.stores.get(name);
        if (store) {
          store.delete(key);
        }
      }
    };
  }

  // Cleanup expired entries periodically
  startCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [limiterName, store] of this.stores.entries()) {
        for (const [key, data] of store.entries()) {
          if (data.resetTime <= now) {
            store.delete(key);
            cleaned++;
          }
        }
      }

      if (cleaned > 0) {
        logger.debug('Rate limiter cleanup completed', { cleanedEntries: cleaned });
      }
    }, 60000); // Cleanup every minute
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
rateLimiter.startCleanup();

// Common rate limiting configurations
export const RateLimitConfigs = {
  // General API requests
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests per 15 minutes
    keyGenerator: (req: any) => req.ip || 'unknown'
  },

  // Authentication attempts
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 failed attempts per 15 minutes
    keyGenerator: (req: any) => `auth:${req.ip || 'unknown'}`,
    onLimitReached: (data: any) => {
      logger.security('Authentication rate limit exceeded', {
        key: data.key,
        attempts: data.count
      });
    }
  },

  // Scan requests (more expensive operations)
  scan: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 scans per minute per user
    keyGenerator: (req: any) => `scan:${req.user?.id || req.ip || 'unknown'}`
  },

  // File uploads
  upload: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 uploads per minute
    keyGenerator: (req: any) => `upload:${req.user?.id || req.ip || 'unknown'}`
  }
};

export default rateLimiter;