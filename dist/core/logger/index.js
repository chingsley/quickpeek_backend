"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("config"));
const console_logger_1 = require("./console.logger");
const winston_logger_1 = require("./winston.logger");
const loggerType = config_1.default.get('logger.type');
let logger;
if (loggerType === 'winston') {
    logger = new winston_logger_1.WinstonLogger();
}
else {
    logger = new console_logger_1.ConsoleLogger();
}
exports.default = logger;
