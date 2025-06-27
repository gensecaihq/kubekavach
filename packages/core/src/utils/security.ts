import { createHash, randomBytes, pbkdf2Sync } from 'crypto';
import { logger } from './logger';
import { metrics } from './metrics';

export interface SecurityConfig {
  apiKeyLength: number;
  saltLength: number;
  hashIterations: number;
  sessionTimeout: number;
  maxFailedAttempts: number;
  lockoutDuration: number;
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  apiKeyLength: 32,
  saltLength: 16,
  hashIterations: 100000,
  sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
  maxFailedAttempts: 5,
  lockoutDuration: 15 * 60 * 1000 // 15 minutes
};

export class SecurityManager {
  private config: SecurityConfig;
  private failedAttempts: Map<string, { count: number; lockUntil?: number }> = new Map();

  constructor(config: SecurityConfig = DEFAULT_SECURITY_CONFIG) {
    this.config = config;
    this.startCleanup();
  }

  // Generate secure API key
  generateApiKey(): string {
    const key = randomBytes(this.config.apiKeyLength).toString('hex');
    logger.audit('API key generated', { keyLength: key.length });
    return key;
  }

  // Hash API key for storage
  hashApiKey(apiKey: string, salt?: Buffer): { hash: string; salt: string } {
    const keyBuffer = Buffer.from(apiKey, 'utf8');
    const saltBuffer = salt || randomBytes(this.config.saltLength);
    
    const hash = pbkdf2Sync(
      keyBuffer,
      saltBuffer,
      this.config.hashIterations,
      64,
      'sha512'
    ).toString('hex');

    return {
      hash,
      salt: saltBuffer.toString('hex')
    };
  }

  // Verify API key against hash
  verifyApiKey(apiKey: string, storedHash: string, storedSalt: string): boolean {
    try {
      const { hash } = this.hashApiKey(apiKey, Buffer.from(storedSalt, 'hex'));
      return hash === storedHash;
    } catch (error) {
      logger.error('API key verification failed', error as Error);
      return false;
    }
  }

  // Check if IP is locked out
  isLockedOut(identifier: string): boolean {
    const attempts = this.failedAttempts.get(identifier);
    if (!attempts) return false;

    if (attempts.lockUntil && Date.now() < attempts.lockUntil) {
      return true;
    }

    // Clear expired lockout
    if (attempts.lockUntil && Date.now() >= attempts.lockUntil) {
      this.failedAttempts.delete(identifier);
    }

    return false;
  }

  // Record failed authentication attempt
  recordFailedAttempt(identifier: string): boolean {
    if (this.isLockedOut(identifier)) {
      return true;
    }

    const attempts = this.failedAttempts.get(identifier) || { count: 0 };
    attempts.count++;

    if (attempts.count >= this.config.maxFailedAttempts) {
      attempts.lockUntil = Date.now() + this.config.lockoutDuration;
      
      logger.security('Account locked due to failed attempts', {
        identifier: this.sanitizeIdentifier(identifier),
        attempts: attempts.count,
        lockDuration: this.config.lockoutDuration
      });

      metrics.incrementCounter('security_lockouts_total', 1);
    }

    this.failedAttempts.set(identifier, attempts);
    return attempts.lockUntil !== undefined;
  }

  // Clear failed attempts on successful auth
  clearFailedAttempts(identifier: string): void {
    this.failedAttempts.delete(identifier);
  }

  // Sanitize sensitive data for logging
  sanitizeApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 8) return '[REDACTED]';
    return apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4);
  }

  sanitizeIdentifier(identifier: string): string {
    // Hash the identifier for privacy while maintaining uniqueness
    return createHash('sha256').update(identifier).digest('hex').substring(0, 8);
  }

  // Input validation and sanitization
  sanitizeInput(input: string, maxLength: number = 1000): string {
    if (typeof input !== 'string') return '';
    
    return input
      .trim()
      .substring(0, maxLength)
      .replace(/[<>'"&]/g, '') // Remove potentially dangerous characters
      .replace(/\0/g, ''); // Remove null bytes
  }

  // Validate namespace name according to Kubernetes rules
  validateNamespace(namespace: string): boolean {
    if (!namespace || typeof namespace !== 'string') return false;
    
    // Kubernetes namespace naming rules
    const namespaceRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
    return namespace.length <= 63 && namespaceRegex.test(namespace);
  }

  // Validate rule IDs
  validateRuleId(ruleId: string): boolean {
    if (!ruleId || typeof ruleId !== 'string') return false;
    
    // Allow alphanumeric, hyphens, underscores, dots
    const ruleIdRegex = /^[a-zA-Z0-9._-]+$/;
    return ruleId.length <= 100 && ruleIdRegex.test(ruleId);
  }

  // Generate secure session token
  generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  // Validate session token format
  validateSessionToken(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    return /^[a-f0-9]{64}$/.test(token);
  }

  // Generate CSRF token
  generateCSRFToken(): string {
    return randomBytes(16).toString('hex');
  }

  // Content Security Policy header
  getCSPHeader(): string {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ');
  }

  // Security headers for HTTP responses
  getSecurityHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': this.getCSPHeader(),
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Permitted-Cross-Domain-Policies': 'none',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
  }

  // Check for suspicious patterns in requests
  detectSuspiciousActivity(request: {
    userAgent?: string;
    headers?: Record<string, string>;
    body?: any;
    path?: string;
  }): { suspicious: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check user agent
    if (!request.userAgent || request.userAgent.length < 10) {
      reasons.push('Missing or suspicious user agent');
    }

    // Check for common attack patterns in headers
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i,
      /alert\(/i,
      /document\.cookie/i,
      /\.\./,
      /\/etc\/passwd/i,
      /union.*select/i,
      /drop.*table/i
    ];

    const checkForPatterns = (text: string) => {
      return suspiciousPatterns.some(pattern => pattern.test(text));
    };

    // Check headers
    if (request.headers) {
      for (const [key, value] of Object.entries(request.headers)) {
        if (typeof value === 'string' && checkForPatterns(value)) {
          reasons.push(`Suspicious pattern in header: ${key}`);
        }
      }
    }

    // Check request body
    if (request.body && typeof request.body === 'string') {
      if (checkForPatterns(request.body)) {
        reasons.push('Suspicious pattern in request body');
      }
    }

    // Check path
    if (request.path && checkForPatterns(request.path)) {
      reasons.push('Suspicious pattern in request path');
    }

    return {
      suspicious: reasons.length > 0,
      reasons
    };
  }

  // Cleanup expired lockouts
  private startCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [identifier, attempts] of this.failedAttempts.entries()) {
        if (attempts.lockUntil && now >= attempts.lockUntil) {
          this.failedAttempts.delete(identifier);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug('Security cleanup completed', { clearedLockouts: cleaned });
      }
    }, 60000); // Cleanup every minute
  }
}

// Singleton instance
export const security = new SecurityManager();

export default security;