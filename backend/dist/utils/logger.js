"use strict";
/**
 * Centralized logging service with prefixes for debugging
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
class Logger {
    static formatEntry(entry) {
        const { level, timestamp, message, metadata } = entry;
        const levelUpper = level.toUpperCase().padEnd(5);
        const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
        return `[${timestamp}] ${levelUpper} ${message}${metaStr}`;
    }
    static getTimestamp() {
        return new Date().toISOString();
    }
    debug(message, metadata) {
        const entry = {
            level: 'debug',
            timestamp: Logger.getTimestamp(),
            message,
            metadata,
        };
        console.debug(Logger.formatEntry(entry));
    }
    info(message, metadata) {
        const entry = {
            level: 'info',
            timestamp: Logger.getTimestamp(),
            message,
            metadata,
        };
        console.log(Logger.formatEntry(entry));
    }
    warn(message, metadata) {
        const entry = {
            level: 'warn',
            timestamp: Logger.getTimestamp(),
            message,
            metadata,
        };
        console.warn(Logger.formatEntry(entry));
    }
    error(message, metadata) {
        const entry = {
            level: 'error',
            timestamp: Logger.getTimestamp(),
            message,
            metadata,
        };
        console.error(Logger.formatEntry(entry));
    }
}
exports.logger = new Logger();
