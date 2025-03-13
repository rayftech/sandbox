// src/test/rabbitMQ/test_rabbitmq.ts
// Simple script to test RabbitMQ connection and basic messaging

import { RabbitMQService, } from '../../services/rabbitmq.service';
import { createLogger } from '../../config/logger';
import * as dotenv from 'dotenv';
import { setTimeout } from 'timers/promises';


const describe = global.describe || ((_name: string, fn: () => void) => fn());
const it = global.it || ((_name: string, fn: () => void) => fn());


// Load environment variables
dotenv.config();

const logger = createLogger('RabbitMQTest');

/**
 * Test RabbitMQ connection and messaging
 */
async function testRabbitMQ() {
  logger.info('Starting RabbitMQ connection test...');

  try {
    // Get RabbitMQ service instance
    const rabbitService = RabbitMQService.getInstance();

    // Connect to RabbitMQ
    logger.info('Connecting to RabbitMQ...');
    await rabbitService.connect();
    logger.info('Connected to RabbitMQ successfully! ✅');
    
    // Define test queue
    const testQueue = 'test_queue';
    
    // Assert the test queue exists
    logger.info(`Asserting test queue: ${testQueue}`);
    await rabbitService.assertQueue(testQueue);
    logger.info(`Test queue created successfully! ✅`);
    
    // Setup message consumer
    logger.info('Setting up message consumer...');
    await rabbitService.consumeQueue(testQueue, async (content) => {
      logger.info(`Received message: ${JSON.stringify(content)}`);
    });
    logger.info('Consumer setup successful! ✅');
    
    // Send test messages
    logger.info('Sending test messages...');
    for (let i = 1; i <= 3; i++) {
      const message = {
        id: i,
        text: `Test message ${i}`,
        timestamp: new Date().toISOString()
      };
      
      const result = await rabbitService.sendToQueue(testQueue, message);
      logger.info(`Message ${i} sent: ${result ? 'success ✅' : 'failed ❌'}`);
      
      // Small delay between messages
      await setTimeout(500);
    }
    
    // Wait a bit to ensure messages are processed
    logger.info('Waiting for message processing...');
    await setTimeout(2000);
    
    // Close connection
    logger.info('Closing RabbitMQ connection...');
    await rabbitService.close();
    logger.info('RabbitMQ connection closed successfully! ✅');
    
    logger.info('RabbitMQ test completed successfully! 🎉');
  } catch (error) {
    logger.error(`RabbitMQ test failed: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }
    process.exit(1);
  }
}

// Add a simple Jest test
if (typeof jest !== 'undefined') {
  describe('RabbitMQ Service Tests', () => {
    it('should have a test function defined', () => {
      expect(typeof testRabbitMQ).toBe('function');
    });
  });
}

// The original code that runs outside of Jest tests
// Only run the tests if we're executing the file directly
if (require.main === module) {
  console.log('Running RabbitMQ test...');
  testRabbitMQ().then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  }).catch((error) => {
    logger.error(`Unhandled error in test: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
} else {
  // Export the test function for use in Jest tests
  module.exports = { testRabbitMQ };
}