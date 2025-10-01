import { ILogger } from './logger.interface';

export class ConsoleLogger implements ILogger {
  info(message: string, meta?: any): void {
    console.log('info', message, meta);
  }

  warn(message: string, meta?: any): void {
    console.warn('warn', message, meta);
  }

  error(message: string, meta?: any): void {
    console.error('error', message, meta);
  }

  debug(message: string, meta?: any): void {
    console.debug('debug', message, meta);
  }
}
