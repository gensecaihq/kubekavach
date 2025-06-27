import { pino, Logger } from 'pino';
import { randomUUID } from 'crypto';

export interface LogContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  resource?: string;
  duration?: number;
  [key: string]: any;
}

class ProductionLogger {
  private logger: Logger;
  
  constructor() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
    
    this.logger = pino({
      level: logLevel,
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          'apiKey',
          'password',
          'token',
          'authorization',
          'cookie',
          'x-api-key',
          '*.apiKey',
          '*.password',
          '*.token'
        ],
        censor: '[REDACTED]'
      },
      transport: isDevelopment ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname'
        }
      } : undefined
    });
  }

  private enrichContext(context: LogContext = {}): LogContext {
    return {
      ...context,
      requestId: context.requestId || randomUUID(),
      timestamp: new Date().toISOString(),
      service: 'kubekavach'
    };
  }

  info(message: string, context: LogContext = {}): void {
    this.logger.info(this.enrichContext(context), message);
  }

  error(message: string, error?: Error, context: LogContext = {}): void {
    this.logger.error({
      ...this.enrichContext(context),
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    }, message);
  }

  warn(message: string, context: LogContext = {}): void {
    this.logger.warn(this.enrichContext(context), message);
  }

  debug(message: string, context: LogContext = {}): void {
    this.logger.debug(this.enrichContext(context), message);
  }

  // Audit logging for security events
  audit(event: string, context: LogContext = {}): void {
    this.logger.info({
      ...this.enrichContext(context),
      audit: true,
      event
    }, `AUDIT: ${event}`);
  }

  // Performance logging
  performance(operation: string, duration: number, context: LogContext = {}): void {
    this.logger.info({
      ...this.enrichContext(context),
      performance: true,
      operation,
      duration
    }, `PERFORMANCE: ${operation} completed in ${duration}ms`);
  }

  // Security event logging
  security(event: string, context: LogContext = {}): void {
    this.logger.warn({
      ...this.enrichContext(context),
      security: true,
      event
    }, `SECURITY: ${event}`);
  }

  // Business metric logging
  metric(name: string, value: number, context: LogContext = {}): void {
    this.logger.info({
      ...this.enrichContext(context),
      metric: true,
      metricName: name,
      metricValue: value
    }, `METRIC: ${name}=${value}`);
  }
}

// Singleton instance
export const logger = new ProductionLogger();

// Request correlation middleware
export function createRequestLogger(baseContext: LogContext = {}) {
  const requestId = randomUUID();
  return {
    requestId,
    info: (message: string, context: LogContext = {}) => 
      logger.info(message, { ...baseContext, ...context, requestId }),
    error: (message: string, error?: Error, context: LogContext = {}) => 
      logger.error(message, error, { ...baseContext, ...context, requestId }),
    warn: (message: string, context: LogContext = {}) => 
      logger.warn(message, { ...baseContext, ...context, requestId }),
    debug: (message: string, context: LogContext = {}) => 
      logger.debug(message, { ...baseContext, ...context, requestId }),
    audit: (event: string, context: LogContext = {}) => 
      logger.audit(event, { ...baseContext, ...context, requestId }),
    performance: (operation: string, duration: number, context: LogContext = {}) => 
      logger.performance(operation, duration, { ...baseContext, ...context, requestId }),
    security: (event: string, context: LogContext = {}) => 
      logger.security(event, { ...baseContext, ...context, requestId })
  };
}

export default logger;