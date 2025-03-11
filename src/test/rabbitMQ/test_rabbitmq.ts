// src/test-rabbitmq.ts
// Simple script to test RabbitMQ connection and basic messaging

import { RabbitMQService, } from '../../services/rabbitmq.service';
import { createLogger } from '../../config/logger';
import * as dotenv from 'dotenv';
import { setTimeout } from 'timers/promises';

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

// Run the test
testRabbitMQ().then(() => {
  process.exit(0);
}).catch((error) => {
  logger.error(`Unhandled error in test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});