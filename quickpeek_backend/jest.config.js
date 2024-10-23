module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js'],
  transformIgnorePatterns: ['node_modules'],
  // Exclude the dist folder
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  // Use ts-jest to handle TypeScript files
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  // Use ESModules support
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['dotenv/config'],
  // setupFilesAfterEnv: ['<rootDir>/.env.test'],
};
