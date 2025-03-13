// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/*.test.ts',
    '**/test_*.ts'
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  verbose: true,
  // Atlas connections may be slower, so we increase timeouts
  testTimeout: 60000,
  // Prevent unhandled promise rejections from failing tests
  detectOpenHandles: true,
  // Force exit after tests complete to prevent hanging
  forceExit: true,
  // Note: 'runInBand' is a command line option, not a config option
  // So we remove it from here and add it to the command line
};