export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private namespace: string;
  private level: LogLevel;

  constructor(namespace: string, level: LogLevel = 'info') {
    this.namespace = namespace;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    return levels[level] >= levels[this.level];
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (error) {
          // Handle circular references or other stringify errors
          if (arg instanceof Error) {
            return `Error: ${arg.message}\n${arg.stack}`;
          }
          return `[Object ${arg.constructor?.name || 'Unknown'}]`;
        }
      }
      return String(arg);
    }).join(' ') : '';
    
    return `[${timestamp}] [${level.toUpperCase()}] [${this.namespace}] ${message}${formattedArgs}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, ...args));
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, ...args));
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, ...args));
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, ...args));
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  createChild(childNamespace: string): Logger {
    return new Logger(`${this.namespace}:${childNamespace}`, this.level);
  }
}

// Global logger instance
export const logger = new Logger('core');
