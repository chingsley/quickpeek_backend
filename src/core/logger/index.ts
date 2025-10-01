import config from 'config';
import { ILogger } from './logger.interface';
import { ConsoleLogger } from './console.logger';
import { WinstonLogger } from './winston.logger';

const loggerType = config.get<string>('logger.type');

let logger: ILogger;

if (loggerType === 'winston') {
  logger = new WinstonLogger();
} else {
  logger = new ConsoleLogger();
}

export default logger;
