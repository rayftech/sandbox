// src/test/setup.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config({ path: '.env.test' });

// Generate a unique database name for this test run to avoid conflicts
const uniqueTestDbName = `test_${uuidv4().replace(/-/g, '').substring(0, 10)}`;
let mongoURI: string;

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

// Add this helper function for tests
export const waitForDb = async (ms = 300) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Setup and teardown for MongoDB
beforeAll(async () => {
  // Get the Atlas connection string from .env.test
  mongoURI = process.env.ATLAS_URI || '';
  
  if (!mongoURI) {
    throw new Error('ATLAS_URI environment variable is required for tests');
  }
  
  // Modify the URI to use our unique test database name
  // This assumes a URI format like: mongodb+srv://user:pass@cluster0.xxx.mongodb.net/database
  // We want to replace 'database' with our unique test database name
  if (mongoURI.includes('?')) {
    // If there are query parameters
    mongoURI = mongoURI.replace(/\/([^/?]+)(\?|$)/, `/${uniqueTestDbName}$2`);
  } else {
    // If no query parameters
    if (mongoURI.endsWith('/')) {
      mongoURI = `${mongoURI}${uniqueTestDbName}`;
    } else {
      mongoURI = `${mongoURI}/${uniqueTestDbName}`;
    }
  }
  
  try {
    // Connect to MongoDB Atlas with the unique test database name
    await mongoose.connect(mongoURI);
    console.log(`Connected to MongoDB Atlas test database: ${uniqueTestDbName}`);
  } catch (error) {
    console.error('Error connecting to MongoDB Atlas:', error);
    throw error; // Fail tests if DB connection fails
  }
});

beforeEach(async () => {
  // Clear all collections before each test
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
  
  // Give a small pause after clearing collections
  await waitForDb(100);
});

afterAll(async () => {
  // Drop the test database to clean up
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.dropDatabase();
      console.log(`Dropped test database: ${uniqueTestDbName}`);
    } catch (error) {
      console.error('Error dropping test database:', error);
    }
    
    // Wait a bit to ensure the drop completes
    await waitForDb(300);
    
    // Close the connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB Atlas');
  }
});

// Clear all mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});

// Increase timeout for slower Atlas connection
jest.setTimeout(60000);