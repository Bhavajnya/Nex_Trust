/**
 * Centralized logging service with prefixes for debugging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  metadata?: Record<string, unknown>;
}

class Logger {
  private static formatEntry(entry: LogEntry): string {
    const { level, timestamp, message, metadata } = entry;
    const levelUpper = level.toUpperCase().padEnd(5);
    const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
    return `[${timestamp}] ${levelUpper} ${message}${metaStr}`;
  }

  private static getTimestamp(): string {
    return new Date().toISOString();
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: 'debug',
      timestamp: Logger.getTimestamp(),
      message,
      metadata,
    };
    console.debug(Logger.formatEntry(entry));
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: 'info',
      timestamp: Logger.getTimestamp(),
      message,
      metadata,
    };
    console.log(Logger.formatEntry(entry));
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: 'warn',
      timestamp: Logger.getTimestamp(),
      message,
      metadata,
    };
    console.warn(Logger.formatEntry(entry));
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: 'error',
      timestamp: Logger.getTimestamp(),
      message,
      metadata,
    };
    console.error(Logger.formatEntry(entry));
  }
}

export const logger = new Logger();
