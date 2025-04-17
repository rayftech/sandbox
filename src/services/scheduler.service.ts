// src/services/scheduler.service.ts
import * as cron from 'node-cron';
import { createLogger } from '../config/logger';
import { CourseService } from './course.service';
import { ProjectService } from './project.service';
import { EventPublisher } from './event.publisher';

const logger = createLogger('SchedulerService');

/**
 * Scheduler Service responsible for running periodic tasks
 * Uses node-cron to schedule and manage recurring tasks
 */
export class SchedulerService {
  private static instance: SchedulerService | null = null;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private initialized: boolean = false;
  private eventPublisher: EventPublisher;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.eventPublisher = EventPublisher.getInstance();
  }

  /**
   * Get the singleton instance of SchedulerService
   * @returns The SchedulerService instance
   */
  public static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  /**
   * Initialize the scheduler service and set up all scheduled tasks
   * @returns Promise resolving to boolean indicating success
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      logger.info('Initializing scheduler service');

      // Initialize event publisher for notifications
      await this.eventPublisher.initialize();

      // Schedule daily check for course end dates (runs at 1:00 AM every day)
      // Cron format: second(optional) minute hour day-of-month month day-of-week
      this.scheduleTask(
        'check-course-end-dates',
        '0 1 * * *',
        async () => {
          try {
            logger.info('Running scheduled task: check-course-end-dates');
            const result = await CourseService.checkCoursesEndDate();
            logger.info(`Course end date check completed. Updated: ${result.updated}, Errors: ${result.errors}`);
            
            // Log a message about the task running (instead of notification)
            logger.info(`Task Summary: Processed ${result.updated + result.errors} courses. Updated: ${result.updated}, Errors: ${result.errors}`);
          } catch (error) {
            logger.error(`Error in scheduled task (check-course-end-dates): ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      );

      // Schedule daily check for project end dates (runs at 2:00 AM every day)
      this.scheduleTask(
        'check-project-end-dates',
        '0 2 * * *',
        async () => {
          try {
            logger.info('Running scheduled task: check-project-end-dates');
            const result = await ProjectService.checkProjectsEndDate();
            logger.info(`Project end date check completed. Updated: ${result.updated}, Errors: ${result.errors}`);
            
            // Log a message about the task running (instead of notification)
            logger.info(`Task Summary: Processed ${result.updated + result.errors} projects. Updated: ${result.updated}, Errors: ${result.errors}`);
          } catch (error) {
            logger.error(`Error in scheduled task (check-project-end-dates): ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      );

      this.initialized = true;
      logger.info('Scheduler service initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize scheduler service: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Schedule a new task with error handling and logging
   * @param taskName The name of the task (used for identification)
   * @param cronExpression The cron expression defining when the task runs
   * @param task The function to execute on schedule
   * @returns Promise resolving to boolean indicating success
   */
  private scheduleTask(
    taskName: string,
    cronExpression: string,
    task: () => Promise<void>
  ): boolean {
    try {
      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        logger.error(`Invalid cron expression for task ${taskName}: ${cronExpression}`);
        return false;
      }

      // Create a wrapper function that includes error handling
      const wrappedTask = async () => {
        try {
          logger.debug(`Executing scheduled task: ${taskName}`);
          await task();
        } catch (error) {
          logger.error(`Error in scheduled task (${taskName}): ${error instanceof Error ? error.message : String(error)}`);
        }
      };

      // Schedule the task
      const scheduledTask = cron.schedule(cronExpression, wrappedTask, {
        scheduled: true,
        timezone: 'UTC' // Use UTC for consistency across deployments
      });

      // Store the task reference for management
      this.scheduledTasks.set(taskName, scheduledTask);
      
      logger.info(`Scheduled task "${taskName}" with cron expression "${cronExpression}"`);
      return true;
    } catch (error) {
      logger.error(`Error scheduling task "${taskName}": ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Start a specific scheduled task by name
   * @param taskName The name of the task to start
   * @returns Boolean indicating success
   */
  public startTask(taskName: string): boolean {
    try {
      const task = this.scheduledTasks.get(taskName);
      if (!task) {
        logger.warn(`Cannot start task "${taskName}": task not found`);
        return false;
      }

      task.start();
      logger.info(`Started scheduled task: ${taskName}`);
      return true;
    } catch (error) {
      logger.error(`Error starting task "${taskName}": ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Stop a specific scheduled task by name
   * @param taskName The name of the task to stop
   * @returns Boolean indicating success
   */
  public stopTask(taskName: string): boolean {
    try {
      const task = this.scheduledTasks.get(taskName);
      if (!task) {
        logger.warn(`Cannot stop task "${taskName}": task not found`);
        return false;
      }

      task.stop();
      logger.info(`Stopped scheduled task: ${taskName}`);
      return true;
    } catch (error) {
      logger.error(`Error stopping task "${taskName}": ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Run a task immediately, regardless of its schedule
   * @param taskName The name of the task to run
   * @returns Promise resolving to boolean indicating success
   */
  public async runTaskNow(taskName: string): Promise<boolean> {
    try {
      logger.info(`Running task "${taskName}" immediately`);

      if (taskName === 'check-course-end-dates') {
        await CourseService.checkCoursesEndDate();
        return true;
      } else if (taskName === 'check-project-end-dates') {
        await ProjectService.checkProjectsEndDate();
        return true;
      } else {
        logger.warn(`Unknown task name: ${taskName}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error running task "${taskName}" immediately: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Gracefully shut down the scheduler service
   * @returns Promise resolving to boolean indicating success
   */
  public async shutdown(): Promise<boolean> {
    try {
      logger.info('Shutting down scheduler service');
      
      // Stop all scheduled tasks
      for (const [taskName, task] of this.scheduledTasks.entries()) {
        task.stop();
        logger.info(`Stopped scheduled task: ${taskName}`);
      }
      
      this.scheduledTasks.clear();
      this.initialized = false;
      
      logger.info('Scheduler service shut down successfully');
      return true;
    } catch (error) {
      logger.error(`Error shutting down scheduler service: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}