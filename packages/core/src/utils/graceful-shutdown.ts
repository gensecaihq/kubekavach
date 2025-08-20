import { logger } from './logger';
import { metrics } from './metrics';
import { database } from './database';

export interface ShutdownHandler {
  name: string;
  priority: number; // Lower numbers run first
  handler: () => Promise<void>;
  timeout?: number; // Timeout in milliseconds
}

class GracefulShutdownManager {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownTimeout = 30000; // 30 seconds default
  private forceExitTimeout = 10000; // 10 seconds force exit

  constructor() {
    this.setupSignalHandlers();
    this.registerDefaultHandlers();
  }

  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, (sig) => {
        if (this.isShuttingDown) {
          logger.warn('Shutdown already in progress, ignoring signal', { signal: sig });
          return;
        }
        
        logger.info('Received shutdown signal', { signal: sig });
        this.shutdown(0);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception, shutting down', error);
      metrics.incrementCounter('uncaught_exceptions_total', 1);
      this.shutdown(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection, shutting down', new Error(String(reason)), {
        promise: promise.toString()
      });
      metrics.incrementCounter('unhandled_rejections_total', 1);
      this.shutdown(1);
    });

    // Handle memory warnings
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning' || 
          warning.message.includes('memory')) {
        logger.warn('Process warning detected', {
          name: warning.name,
          message: warning.message,
          stack: warning.stack
        });
        metrics.incrementCounter('process_warnings_total', 1, { type: warning.name });
      }
    });
  }

  private registerDefaultHandlers(): void {
    // Database cleanup
    this.registerHandler({
      name: 'database-cleanup',
      priority: 10,
      handler: async () => {
        logger.info('Closing database connections');
        await database.close();
      },
      timeout: 5000
    });

    // Metrics export
    this.registerHandler({
      name: 'metrics-export',
      priority: 5,
      handler: async () => {
        logger.info('Exporting final metrics');
        const finalMetrics = metrics.getMetrics();
        logger.info('Final metrics exported', { 
          metricCount: finalMetrics.length 
        });
      },
      timeout: 3000
    });

    // Final logging
    this.registerHandler({
      name: 'final-logging',
      priority: 100,
      handler: async () => {
        logger.info('Graceful shutdown completed');
      },
      timeout: 1000
    });
  }

  registerHandler(handler: ShutdownHandler): void {
    this.handlers.push(handler);
    this.handlers.sort((a, b) => a.priority - b.priority);
    
    logger.debug('Shutdown handler registered', {
      name: handler.name,
      priority: handler.priority
    });
  }

  unregisterHandler(name: string): void {
    const index = this.handlers.findIndex(h => h.name === name);
    if (index >= 0) {
      this.handlers.splice(index, 1);
      logger.debug('Shutdown handler unregistered', { name });
    }
  }

  async shutdown(exitCode: number = 0): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    const shutdownStart = Date.now();

    logger.info('Starting graceful shutdown', {
      exitCode,
      handlerCount: this.handlers.length
    });

    // Set overall shutdown timeout
    const shutdownTimer = setTimeout(() => {
      logger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, this.shutdownTimeout);

    // Set force exit timeout
    const forceExitTimer = setTimeout(() => {
      logger.error('Force exit timeout exceeded');
      process.exit(1);
    }, this.shutdownTimeout + this.forceExitTimeout);

    try {
      // Execute shutdown handlers in priority order
      for (const handler of this.handlers) {
        const handlerStart = Date.now();
        
        try {
          logger.debug('Executing shutdown handler', { name: handler.name });
          
          if (handler.timeout) {
            await Promise.race([
              handler.handler(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Handler timeout')), handler.timeout)
              )
            ]);
          } else {
            await handler.handler();
          }
          
          const handlerDuration = Date.now() - handlerStart;
          logger.debug('Shutdown handler completed', {
            name: handler.name,
            duration: handlerDuration
          });
          
        } catch (error) {
          const handlerDuration = Date.now() - handlerStart;
          logger.error('Shutdown handler failed', error as Error, {
            name: handler.name,
            duration: handlerDuration
          });
          
          // Continue with other handlers even if one fails
        }
      }

      const shutdownDuration = Date.now() - shutdownStart;
      logger.info('Graceful shutdown completed successfully', {
        duration: shutdownDuration,
        exitCode
      });

    } catch (error) {
      logger.error('Error during graceful shutdown', error as Error);
      exitCode = 1;
    } finally {
      clearTimeout(shutdownTimer);
      clearTimeout(forceExitTimer);
      
      // Give a moment for final logs to flush
      setTimeout(() => {
        process.exit(exitCode);
      }, 100);
    }
  }

  // For testing - allows manual triggering
  async triggerShutdown(exitCode: number = 0): Promise<void> {
    await this.shutdown(exitCode);
  }

  // Configuration setters
  setShutdownTimeout(timeout: number): void {
    this.shutdownTimeout = timeout;
    logger.debug('Shutdown timeout updated', { timeout });
  }

  setForceExitTimeout(timeout: number): void {
    this.forceExitTimeout = timeout;
    logger.debug('Force exit timeout updated', { timeout });
  }

  // Health check
  isHealthy(): boolean {
    return !this.isShuttingDown;
  }

  getStatus(): {
    isShuttingDown: boolean;
    handlerCount: number;
    shutdownTimeout: number;
    forceExitTimeout: number;
  } {
    return {
      isShuttingDown: this.isShuttingDown,
      handlerCount: this.handlers.length,
      shutdownTimeout: this.shutdownTimeout,
      forceExitTimeout: this.forceExitTimeout
    };
  }
}

// Singleton instance
export const gracefulShutdown = new GracefulShutdownManager();

// Express/Fastify middleware factory
export function createShutdownMiddleware() {
  return (_req: any, res: any, next: any) => {
    if (gracefulShutdown.isHealthy()) {
      next();
    } else {
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'Server is shutting down'
      });
    }
  };
}

export default gracefulShutdown;