jest.mock('config', () => ({
  get: jest.fn(),
}));

describe('Logger Module', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should export a ConsoleLogger instance when logger.type is console', () => {
    const config = require('config');
    (config.get as jest.Mock).mockReturnValue('console');
    const { ConsoleLogger } = require('../../../src/core/logger/console.logger');
    const loggerInstance = require('../../../src/core/logger').default;
    expect(loggerInstance).toBeInstanceOf(ConsoleLogger);
  });

  it('should export a WinstonLogger instance when logger.type is winston', () => {
    const config = require('config');
    (config.get as jest.Mock).mockReturnValue('winston');
    const { WinstonLogger } = require('../../../src/core/logger/winston.logger');
    const loggerInstance = require('../../../src/core/logger').default;
    expect(loggerInstance).toBeInstanceOf(WinstonLogger);
  });
});
