"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleLogger = void 0;
class ConsoleLogger {
    info(message, meta) {
        console.log('info', message, meta);
    }
    warn(message, meta) {
        console.warn('warn', message, meta);
    }
    error(message, meta) {
        console.error('error', message, meta);
    }
    debug(message, meta) {
        console.debug('debug', message, meta);
    }
}
exports.ConsoleLogger = ConsoleLogger;
