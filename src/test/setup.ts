// src/test/setup.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.test' });

// Mock the logger to prevent console noise during tests
jest.mock('../config/logger', () => ({
  createLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Setup and teardown for MongoDB
beforeAll(async () => {
  // Use an in-memory MongoDB server for testing or connect to a test database
  const mongoURI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/test-db';
  
  try {
    await mongoose.connect(mongoURI);
    console.log('Connected to test database');
  } catch (error) {
    console.error('Error connecting to test database:', error);
    // Don't fail tests if MongoDB isn't available - just log the error
  }
});

afterAll(async () => {
  // Clean up database connections
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      console.log('Disconnected from test database');
    } catch (error) {
      console.error('Error disconnecting from test database:', error);
    }
  }
});

// Clear all mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});

// Add global test timeout (can be overridden in individual tests)
jest.setTimeout(30000);