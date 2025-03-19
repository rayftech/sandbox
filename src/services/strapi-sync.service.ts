// src/services/strapi-sync.service.ts
import axios, { AxiosInstance } from 'axios';
import { Course, ICourse, CourseLevel } from '../models/course.model';
import { Project, IProject, StudentLevel } from '../models/project.model';
import { createLogger } from '../config/logger';
import { EventPublisher } from './event.publisher';
import { EventType } from '../models/events.model';
import { RabbitMQService, } from './rabbitmq.service';
// import mongoose from 'mongoose';

const logger = createLogger('StrapiSyncService');

/**
 * Interface for Strapi course data
 */
interface IStrapiCourse {
  id: number;
  attributes: {
    name: string;
    code: string;
    userId: string;
    expectedEnrollment?: number;
    description?: string;
    courseLevel: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
    courseStatus: string;
    country: string;
    targetIndustryPartnership?: string;
    preferredPartnerRepresentative?: string;
    createdAt: string;
    updatedAt: string;
    publishedAt: string;
  };
}

/**
 * Interface for Strapi challenge (project) data
 */
interface IStrapiChallenge {
  id: number;
  attributes: {
    name: string;
    userId: string;
    shortDescription?: string;
    studentLevel: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
    challengeStatus: string;
    country: string;
    targetAcademicPartnership?: string;
    createdAt: string;
    updatedAt: string;
    publishedAt: string;
  };
}

/**
 * Strapi Synchronization Service Class
 * Handles synchronization between Strapi CMS and MongoDB
 */
export class StrapiSyncService {
  private static instance: StrapiSyncService;
  private strapiClient: AxiosInstance;
  private rabbitMQService: RabbitMQService;
  private eventPublisher: EventPublisher;
  private initialized: boolean = false;
  private strapiBaseUrl: string;
  private strapiApiToken: string;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.strapiBaseUrl = process.env.STRAPI_BASE_URL || 'http://localhost:1337';
    this.strapiApiToken = process.env.STRAPI_API_TOKEN || '';
    
    // Create Axios instance for Strapi API
    this.strapiClient = axios.create({
      baseURL: this.strapiBaseUrl,
      headers: {
        'Authorization': `Bearer ${this.strapiApiToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    this.rabbitMQService = RabbitMQService.getInstance();
    this.eventPublisher = EventPublisher.getInstance();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): StrapiSyncService {
    if (!StrapiSyncService.instance) {
      StrapiSyncService.instance = new StrapiSyncService();
    }
    return StrapiSyncService.instance;
  }

  /**
   * Initialize the sync service
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      // Connect to RabbitMQ
      await this.rabbitMQService.connect();
      
      // Set up consumer for Strapi webhook events
      const STRAPI_EVENTS_QUEUE = 'strapi_events';
      await this.rabbitMQService.assertQueue(STRAPI_EVENTS_QUEUE);
      
      await this.rabbitMQService.consumeQueue(
        STRAPI_EVENTS_QUEUE,
        this.handleStrapiEvent.bind(this)
      );
      
      this.initialized = true;
      logger.info('Strapi Sync Service initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Strapi Sync Service: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Handle Strapi webhook events
   */
  private async handleStrapiEvent(content: any): Promise<void> {
    try {
      logger.debug(`Received Strapi event: ${JSON.stringify(content)}`);
      
      if (!content || !content.event || !content.model || !content.entry) {
        logger.warn('Invalid Strapi webhook event format');
        return;
      }
      
      const { event, model, entry } = content;
      
      // Handle different event types
      switch (event) {
        case 'entry.create':
          await this.handleEntryCreated(model, entry);
          break;
        case 'entry.update':
          await this.handleEntryUpdated(model, entry);
          break;
        case 'entry.publish':
          await this.handleEntryPublished(model, entry);
          break;
        case 'entry.unpublish':
          await this.handleEntryUnpublished(model, entry);
          break;
        case 'entry.delete':
          await this.handleEntryDeleted(model, entry);
          break;
        default:
          logger.debug(`Ignoring unhandled Strapi event type: ${event}`);
      }
    } catch (error) {
      logger.error(`Error processing Strapi event: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Handle entry created event
   */
  private async handleEntryCreated(model: string, entry: any): Promise<void> {
    if (model === 'course') {
      await this.syncCourse(entry);
    } else if (model === 'challenge') {
      await this.syncProject(entry);
    }
  }

  /**
   * Handle entry updated event
   */
  private async handleEntryUpdated(model: string, entry: any): Promise<void> {
    if (model === 'course') {
      await this.syncCourse(entry);
    } else if (model === 'challenge') {
      await this.syncProject(entry);
    }
  }

  /**
   * Handle entry published event
   */
  private async handleEntryPublished(model: string, entry: any): Promise<void> {
    if (model === 'course') {
      await this.syncCourse(entry);
    } else if (model === 'challenge') {
      await this.syncProject(entry);
    }
  }

  /**
   * Handle entry unpublished event
   */
  private async handleEntryUnpublished(model: string, entry: any): Promise<void> {
    try {
      const strapiId = entry.id.toString();
      
      if (model === 'course') {
        await Course.findOneAndUpdate(
          { strapiId },
          { isActive: false },
          { new: true }
        );
        
        logger.info(`Course ${strapiId} marked as inactive due to unpublish`);
      } else if (model === 'challenge') {
        await Project.findOneAndUpdate(
          { strapiId },
          { isActive: false },
          { new: true }
        );
        
        logger.info(`Project ${strapiId} marked as inactive due to unpublish`);
      }
    } catch (error) {
      logger.error(`Error handling unpublish event: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Handle entry deleted event
   */
  private async handleEntryDeleted(model: string, entry: any): Promise<void> {
    try {
      const strapiId = entry.id.toString();
      
      if (model === 'course') {
        await Course.findOneAndDelete({ strapiId });
        logger.info(`Course ${strapiId} deleted from MongoDB`);
      } else if (model === 'challenge') {
        await Project.findOneAndDelete({ strapiId });
        logger.info(`Project ${strapiId} deleted from MongoDB`);
      }
    } catch (error) {
      logger.error(`Error handling delete event: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Sync course data from Strapi to MongoDB
   */
  private async syncCourse(strapiCourse: IStrapiCourse): Promise<ICourse> {
    try {
      const strapiId = strapiCourse.id.toString();
      const { attributes } = strapiCourse;
      
      // Find existing course or create new one
      let course = await Course.findOne({ strapiId });
      
      if (course) {
        // Update existing course
        course.name = attributes.name;
        course.code = attributes.code;
        course.level = attributes.courseLevel as CourseLevel;
        course.startDate = new Date(attributes.startDate);
        course.endDate = new Date(attributes.endDate);
        course.country = attributes.country;
        course.isActive = attributes.isActive;

        // Safe property access with type assertion
        if (attributes.targetIndustryPartnership) {
          (course as any).targetIndustryPartnership = attributes.targetIndustryPartnership;
        }
        
        course.strapiUpdatedAt = new Date(attributes.updatedAt);
        
        // Update status and academic year/semester
        if (typeof course.updateStatus === 'function') {
          course.updateStatus();
        }
        
        if (typeof course.setAcademicYearAndSemester === 'function') {
          course.setAcademicYearAndSemester();
        }
        
        await course.save();
        logger.info(`Updated MongoDB course ${strapiId} from Strapi`);
      } else {
        // Create new course with proper typing
        const courseData: any = {
          creatorUserId: attributes.userId,
          strapiId,
          strapiCreatedAt: new Date(attributes.createdAt),
          strapiUpdatedAt: new Date(attributes.updatedAt),
          name: attributes.name,
          code: attributes.code,
          level: attributes.courseLevel as CourseLevel,
          startDate: new Date(attributes.startDate),
          endDate: new Date(attributes.endDate),
          country: attributes.country,
          isActive: attributes.isActive
        };
        
        // Add optional fields if present
        if (attributes.targetIndustryPartnership) {
          courseData.targetIndustryPartnership = attributes.targetIndustryPartnership;
        }
        
        course = new Course(courseData);
        
        // Calculate academic year and semester
        if (typeof course.setAcademicYearAndSemester === 'function') {
          course.setAcademicYearAndSemester();
        }
        
        await course.save();
        logger.info(`Created new MongoDB course ${strapiId} from Strapi`);
        
        // Get the MongoDB document ID as a string - handle with type safety
        const courseId = course._id ? course._id.toString() : '';
        
        if (courseId) {
          // Publish course creation event
          await this.eventPublisher.publishCourseEvent(
            EventType.COURSE_CREATED,
            {
              courseId: courseId,
              name: course.name,
              code: course.code,
              level: course.level,
              creatorUserId: course.creatorUserId,
              startDate: course.startDate,
              endDate: course.endDate
            }
          );
        }
      }
      
      return course;
    } catch (error) {
      logger.error(`Error syncing course from Strapi: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Sync project (challenge) data from Strapi to MongoDB
   */
  private async syncProject(strapiChallenge: IStrapiChallenge): Promise<IProject> {
    try {
      const strapiId = strapiChallenge.id.toString();
      const { attributes } = strapiChallenge;
      
      // Find existing project or create new one
      let project = await Project.findOne({ strapiId });
      
      if (project) {
        // Update existing project
        project.title = attributes.name;
        // Use as any to avoid type issues with studentLevel
        project.studentLevel = attributes.studentLevel as any;
        project.startDate = new Date(attributes.startDate);
        project.endDate = new Date(attributes.endDate);
        project.country = attributes.country;
        project.isActive = attributes.isActive;
        
        // Safe property access with type assertion
        if (attributes.targetAcademicPartnership) {
          (project as any).targetAcademicPartnership = attributes.targetAcademicPartnership;
        }
        
        project.strapiUpdatedAt = new Date(attributes.updatedAt);
        
        // Update status if method exists
        if (typeof project.updateStatus === 'function') {
          project.updateStatus();
        }
        
        await project.save();
        logger.info(`Updated MongoDB project ${strapiId} from Strapi`);
      } else {
        // Create new project with proper typing
        const projectData: any = {
          creatorUserId: attributes.userId,
          strapiId,
          strapiCreatedAt: new Date(attributes.createdAt),
          strapiUpdatedAt: new Date(attributes.updatedAt),
          title: attributes.name,
          studentLevel: attributes.studentLevel as StudentLevel,
          startDate: new Date(attributes.startDate),
          endDate: new Date(attributes.endDate),
          country: attributes.country,
          isActive: attributes.isActive
        };
        
        // Add optional fields if present
        if (attributes.targetAcademicPartnership) {
          projectData.targetAcademicPartnership = attributes.targetAcademicPartnership;
        }
        
        project = new Project(projectData);
        
        await project.save();
        logger.info(`Created new MongoDB project ${strapiId} from Strapi`);
        
        // Get the MongoDB document ID as a string - handle with type safety
        const projectId = project._id ? project._id.toString() : '';
        
        if (projectId) {
          // Publish project creation event with string-based StudentLevel
          await this.eventPublisher.publishProjectEvent(
            EventType.PROJECT_CREATED,
            {
              projectId: projectId,
              title: project.title,
              shortDescription: attributes.shortDescription || '',
              creatorUserId: project.creatorUserId,
              studentLevel: project.studentLevel as string, // Cast to string to match event type
              startDate: project.startDate,
              endDate: project.endDate
            }
          );
        }
      }
      
      return project;
    } catch (error) {
      logger.error(`Error syncing project from Strapi: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Synchronize all courses and projects from Strapi (for initial sync)
   */
  public async syncAll(): Promise<{ courses: number; projects: number }> {
    try {
      // Sync all courses
      const coursesResponse = await this.strapiClient.get('/api/courses?populate=*');
      const strapiCourses = coursesResponse.data.data as IStrapiCourse[];
      
      let courseCount = 0;
      for (const course of strapiCourses) {
        await this.syncCourse(course);
        courseCount++;
      }
      
      // Sync all challenges (projects)
      const challengesResponse = await this.strapiClient.get('/api/challenges?populate=*');
      const strapiChallenges = challengesResponse.data.data as IStrapiChallenge[];
      
      let projectCount = 0;
      for (const challenge of strapiChallenges) {
        await this.syncProject(challenge);
        projectCount++;
      }
      
      logger.info(`Initial sync completed: ${courseCount} courses, ${projectCount} projects`);
      return { courses: courseCount, projects: projectCount };
    } catch (error) {
      logger.error(`Error performing initial sync: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
 * Get a course by its Strapi ID
 * @param strapiId The Strapi ID
 * @returns The Strapi course data
 */
public async getCourseBystrapiId(strapiId: string): Promise<any> {
  try {
    const response = await this.strapiClient.get(`/api/courses/${strapiId}`);
    return response.data?.data;
  } catch (error) {
    logger.error(`Error fetching course from Strapi: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Search for courses in Strapi
 * @param query Search query
 * @param limit Maximum number of results
 * @returns Array of courses matching the query
 */
public async searchCourses(query: string, limit: number = 10): Promise<any[]> {
  try {
    const response = await this.strapiClient.get(`/api/courses`, {
      params: {
        _q: query,
        _limit: limit
      }
    });
    return response.data?.data || [];
  } catch (error) {
    logger.error(`Error searching courses in Strapi: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

  /**
   * Create a course in Strapi
   * @param courseData The course data to create
   * @returns The created Strapi course ID
   */
  public async createCourseInStrapi(courseData: any): Promise<string> {
    try {
      const response = await this.strapiClient.post('/api/courses', {
        data: courseData
      });
      
      const strapiId = response.data.data.id.toString();
      logger.info(`Created course in Strapi with ID ${strapiId}`);
      return strapiId;
    } catch (error) {
      logger.error(`Error creating course in Strapi: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
 * Update a course in Strapi
 * @param strapiId The Strapi ID of the course
 * @param updateData The data to update in Strapi
 * @returns Promise resolving to true if successful
 */
public async updateCourseInStrapi(strapiId: string, updateData: any): Promise<boolean> {
  try {
    await this.strapiClient.put(
      `/api/courses/${strapiId}`,
      { data: updateData }
    );
    
    logger.info(`Updated course in Strapi with ID ${strapiId}`);
    return true;
  } catch (error) {
    logger.error(`Error updating course in Strapi: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Delete a course in Strapi
 * @param strapiId The Strapi ID of the course
 * @returns Promise resolving to true if successful
 */
public async deleteCourseInStrapi(strapiId: string): Promise<boolean> {
  try {
    await this.strapiClient.delete(`/api/courses/${strapiId}`);
    
    logger.info(`Deleted course in Strapi with ID ${strapiId}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting course in Strapi: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

  /**
   * Create a challenge in Strapi
   * @param projectData The project data to create
   * @returns The created Strapi challenge ID
   */
  public async createProjectInStrapi(projectData: any): Promise<string> {
    try {
      const response = await this.strapiClient.post('/api/challenges', {
        data: projectData
      });
      
      const strapiId = response.data.data.id.toString();
      logger.info(`Created challenge in Strapi with ID ${strapiId}`);
      return strapiId;
    } catch (error) {
      logger.error(`Error creating challenge in Strapi: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
 * Update a challenge in Strapi
 * @param strapiId The Strapi ID of the project
 * @param updateData The data to update in Strapi
 * @returns Promise resolving to true if successful
 */
public async updateProjectInStrapi(strapiId: string, updateData: any): Promise<boolean> {
  try {
    await this.strapiClient.put(
      `/api/challenges/${strapiId}`,
      { data: updateData }
    );
    
    logger.info(`Updated project in Strapi with ID ${strapiId}`);
    return true;
  } catch (error) {
    logger.error(`Error updating challenge in Strapi: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Delete a challenge in Strapi
 * @param strapiId The Strapi ID of the project
 * @returns Promise resolving to true if successful
 */
public async deleteProjectInStrapi(strapiId: string): Promise<boolean> {
  try {
    await this.strapiClient.delete(`/api/challenges/${strapiId}`);
    
    logger.info(`Deleted project in Strapi with ID ${strapiId}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting challenge in Strapi: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Get a challenge by its Strapi ID
 * @param strapiId The Strapi ID
 * @returns The Strapi project data
 */
public async getProjectBystrapiId(strapiId: string): Promise<any> {
  try {
    const response = await this.strapiClient.get(`/api/challenges/${strapiId}`);
    return response.data?.data;
  } catch (error) {
    logger.error(`Error fetching challenge from Strapi: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

  /**
   * Search for challenge in Strapi
   * @param query Search query
   * @param limit Maximum number of results
   * @returns Array of projects matching the query
   */
  public async searchProjects(query: string, limit: number = 10): Promise<any[]> {
    try {
      const response = await this.strapiClient.get(`/api/challenges`, {
        params: {
          _q: query,
          _limit: limit
        }
      });
      return response.data?.data || [];
    } catch (error) {
      logger.error(`Error searching challenge in Strapi: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }


  }
}
