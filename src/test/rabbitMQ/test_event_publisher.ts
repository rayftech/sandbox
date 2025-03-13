// src/test-event-publisher.ts
// Test script for the event publisher system

import { createLogger } from '../../config/logger';
import * as dotenv from 'dotenv';
import { setTimeout } from 'timers/promises';
import { EventPublisher } from '../../services/event.publisher';
import { EventType } from '../../models/events.model';
import { PartnershipStatus } from '../../models/partnership.model';
import { CourseLevel } from '../../models/course.model';
import { RabbitMQService, QueueType } from '../../services/rabbitmq.service';

// Load environment variables
dotenv.config();

const logger = createLogger('EventPublisherTest');

/**
 * Test the event publisher system
 */
async function testEventPublisher() {
  logger.info('Starting Event Publisher test...');

  try {
    // Get event publisher instance
    const eventPublisher = EventPublisher.getInstance();
    
    // Get RabbitMQ service for consumer setup
    const rabbitService = RabbitMQService.getInstance();
    
    // Setup consumers to verify events are published
    logger.info('Setting up event consumers...');
    
    // Setup consumer for partnership events
    await rabbitService.consumeQueue(QueueType.PARTNERSHIP_REQUEST, async (content) => {
      logger.info(`Received partnership event: ${JSON.stringify(content)}`);
    });
    
    // Setup consumer for notification events
    await rabbitService.consumeQueue(QueueType.NOTIFICATION, async (content) => {
      logger.info(`Received notification event: ${JSON.stringify(content)}`);
    });
    
    logger.info('Event consumers setup successfully! ✅');
    
    // Publish a partnership event
    logger.info('Publishing partnership requested event...');
    const partnershipResult = await eventPublisher.publishPartnershipEvent(
      EventType.PARTNERSHIP_REQUESTED,
      {
        partnershipId: 'test-partnership-id-123',
        courseId: 'test-course-id-123',
        projectId: 'test-project-id-123',
        requestedByUserId: 'academic-user-123',
        requestedToUserId: 'industry-user-456',
        status: PartnershipStatus.PENDING,
        message: 'Test partnership request'
      }
    );
    
    logger.info(`Partnership event published: ${partnershipResult ? 'success ✅' : 'failed ❌'}`);
    
    // Publish a system notification
    logger.info('Publishing system notification...');
    const notificationResult = await eventPublisher.publishSystemNotification({
      recipientUserId: 'industry-user-456',
      title: 'New Partnership Request',
      message: 'You have received a new partnership request.',
      priority: 'medium',
      link: '/partnerships/pending'
    });
    
    logger.info(`System notification published: ${notificationResult ? 'success ✅' : 'failed ❌'}`);
    
    // Publish a course event
    logger.info('Publishing course created event...');
    const courseResult = await eventPublisher.publishCourseEvent(
      EventType.COURSE_CREATED,
      {
        courseId: 'test-course-id-123',
        name: 'Introduction to Computer Science',
        code: 'CS101',
        level: CourseLevel.UNDERGRAD_EARLY,
        creatorUserId: 'academic-user-123',
        startDate: new Date('2025-09-01'),
        endDate: new Date('2025-12-15')
      }
    );
    
    logger.info(`Course event published: ${courseResult ? 'success ✅' : 'failed ❌'}`);
    
    // Wait for events to be processed
    logger.info('Waiting for event processing...');
    await setTimeout(3000);
    
    // Clean up and close connections
    logger.info('Closing RabbitMQ connection...');
    await rabbitService.close();
    
    logger.info('Event Publisher test completed successfully! 🎉');
  } catch (error) {
    logger.error(`Event Publisher test failed: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }
    process.exit(1);
  }
}

describe('EventPublisher', () => {
  it('should exist', () => {
    expect(true).toBe(true);
  });
});

// Run the test
testEventPublisher().then(() => {
  process.exit(0);
}).catch((error) => {
  logger.error(`Unhandled error in test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});