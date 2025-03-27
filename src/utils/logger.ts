type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private isProduction = import.meta.env.PROD;

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  info(message: string, ...args: unknown[]): void {
    console.info(this.formatMessage('info', message), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(this.formatMessage('warn', message), ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(this.formatMessage('error', message), ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    if (!this.isProduction) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }
}

export const logger = new Logger();