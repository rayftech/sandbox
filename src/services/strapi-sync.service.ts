// src/services/strapi-sync.service.ts
import { Course, ICourse, CourseLevel } from '../models/course.model';
import { Project, IProject, StudentLevel } from '../models/project.model';
import { createLogger } from '../config/logger';
import { EventPublisher } from './event.publisher';
import { EventType } from '../models/events.model';
import { RabbitMQService, } from './rabbitmq.service';
import { StrapiAuthService } from './strapi-auth.service';
import {RichTextFormatter} from '../utils/rich-text-formatter'

// import mongoose from 'mongoose';

const logger = createLogger('StrapiSyncService');

/**
 * Interface for Strapi course data
 */
interface IStrapiCourse {
  id: number;
  attributes: {
    isPartnered?: boolean; 
    assessmentRedesign?: string; 
    organisation?: string;
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

// Make sure this interface is properly defined in the file:
/**
 * Interface for Strapi challenge/project data
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
    projectStatus: string;
    country: string;
    organisation?: string;
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
  private strapiAuthService: StrapiAuthService;
  private rabbitMQService: RabbitMQService;
  private eventPublisher: EventPublisher;
  private initialized: boolean = false;

  /**
   * Private constructor to enforce singleton pattern
   */

  private constructor() {
    // Add StrapiAuthService
    this.strapiAuthService = StrapiAuthService.getInstance();
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
        // For projects, we need to find by name since we don't store strapiId
        const attributes = entry.attributes || {};
        if (attributes.name && attributes.userId) {
          await Project.findOneAndUpdate(
            { 
              name: attributes.name,
              userId: attributes.userId
            },
            { isActive: false },
            { new: true }
          );
          
          logger.info(`Project ${attributes.name} marked as inactive due to unpublish`);
        } else {
          logger.warn(`Unable to find project to unpublish - insufficient data`);
        }
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
        // For projects, we need to find by name since we don't store strapiId
        const attributes = entry.attributes || {};
        if (attributes.name && attributes.userId) {
          await Project.findOneAndDelete({ 
            name: attributes.name,
            userId: attributes.userId
          });
          logger.info(`Project ${attributes.name} deleted from MongoDB`);
        } else {
          logger.warn(`Unable to find project to delete - insufficient data`);
        }
      }
    } catch (error) {
      logger.error(`Error handling delete event: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private validateIndustryPartnership(partnership?: string): string | null {
    const validPartnerships = [
      'Financial Services', 'Technology Consulting', 'Cybersecurity',
      'Digital Transformation', 'Data Analytics', 'Enterprise Software',
      // ... add other valid partnerships from your schema ...
    ];
    return partnership && validPartnerships.includes(partnership) ? partnership : null;
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
        
        // course.strapiUpdatedAt = new Date(attributes.updatedAt);
        
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
    // Format the data for MongoDB
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
        organisation: attributes.organisation || '',
        isActive: attributes.isActive,
        description: attributes.description ? RichTextFormatter.toLexical(attributes.description) : null,
        assessmentRedesign: attributes.assessmentRedesign ? RichTextFormatter.toLexical(attributes.assessmentRedesign) : null,
        targetIndustryPartnership: this.validateIndustryPartnership(attributes.targetIndustryPartnership),
        preferredPartnerRepresentative: attributes.preferredPartnerRepresentative || null,
        expectedEnrollment: attributes.expectedEnrollment || null,
        courseStatus: attributes.courseStatus || 'upcoming',
        isPartnered: attributes.isPartnered || false
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

// Update to the syncProject method to properly handle the organisation field

private async syncProject(strapiChallenge: IStrapiChallenge): Promise<IProject> {
  try {
    const strapiId = strapiChallenge.id.toString();
    const { attributes } = strapiChallenge;
    
    // Find project with the same name and creator (since strapiId is removed)
    let project = await Project.findOne({ 
      name: attributes.name,
      userId: attributes.userId
    });
    
    if (project) {
      // Update existing project
      project.name = attributes.name;
      // Use as any to avoid type issues with studentLevel
      project.studentLevel = attributes.studentLevel as any;
      project.startDate = new Date(attributes.startDate);
      project.endDate = new Date(attributes.endDate);
      project.country = attributes.country;
      project.isActive = attributes.isActive;
      
      // Update organisation if provided
      if (attributes.organisation) {
        project.organisation = attributes.organisation;
      }
      
      // Safe property access
      if (attributes.targetAcademicPartnership) {
        project.targetAcademicPartnership = attributes.targetAcademicPartnership as any;
      }
      
      // Update status if method exists
      if (typeof project.updateStatus === 'function') {
        project.updateStatus();
      }
      
      await project.save();
      logger.info(`Updated MongoDB project ${strapiId} from Strapi`);
    } else {
      // Create new project with proper typing
      const projectData: any = {
        userId: attributes.userId,
        name: attributes.name,
        shortDescription: attributes.shortDescription || '',
        studentLevel: attributes.studentLevel as StudentLevel,
        startDate: new Date(attributes.startDate),
        endDate: new Date(attributes.endDate),
        country: attributes.country,
        organisation: attributes.organisation || '', // Ensure organisation is included
        isActive: attributes.isActive
      };
      
      // Add optional fields if present
      if (attributes.targetAcademicPartnership) {
        projectData.targetAcademicPartnership = attributes.targetAcademicPartnership;
      }
      
      project = new Project(projectData);
      
      // Update status
      if (typeof project.updateStatus === 'function') {
        project.updateStatus();
      }
      
      // Set time analytics dimensions
      if (typeof project.setTimeAnalyticsDimensions === 'function') {
        project.setTimeAnalyticsDimensions();
      }
      
      await project.save();
      logger.info(`Created new MongoDB project ${strapiId} from Strapi (${project.country}, ${project.organisation || 'no organisation'})`);
      
      // Get the MongoDB document ID as a string
      const projectId = project._id ? project._id.toString() : '';
      
      if (projectId) {
        // Publish project creation event with string-based StudentLevel and include organisation
        await this.eventPublisher.publishProjectEvent(
          EventType.PROJECT_CREATED,
          {
            projectId: projectId,
            title: project.name,
            shortDescription: project.shortDescription || '',
            creatorUserId: project.userId,
            studentLevel: project.studentLevel as string, // Cast to string to match event type
            startDate: project.startDate,
            endDate: project.endDate,
            country: project.country,
            organisation: project.organisation // Include organisation in the event
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
    // Replace direct axios calls with StrapiAuthService methods
    const coursesResponse = await this.strapiAuthService.get('/courses', { 
      populate: '*'
    });
    const strapiCourses = coursesResponse.data as IStrapiCourse[];
    
    const challengesResponse = await this.strapiAuthService.get('/challenges', { 
      populate: '*'
    });
    const strapiChallenges = challengesResponse.data as IStrapiChallenge[];
      
      let courseCount = 0;
      for (const course of strapiCourses) {
        await this.syncCourse(course);
        courseCount++;
      }
      
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
    const response = await this.strapiAuthService.get(`/api/courses/${strapiId}`);
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
    const response = await this.strapiAuthService.get(`/api/courses`, {
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

  // Queue for serializing Strapi course creation requests
  private static courseCreationQueue: Array<{
    courseData: any;
    resolve: (value: string) => void;
    reject: (reason: any) => void;
  }> = [];
  
  // Flag to track if we're currently processing a course creation request
  private static isProcessingCourseCreation = false;

  /**
   * Create a course in Strapi
   * @param courseData The course data to create
   * @returns The created Strapi course ID
   */
  public async createCourseInStrapi(courseData: any): Promise<string> {
    try {
      // Ensure rich text fields are properly formatted
      const formattedData = {
        name: courseData.name,
        code: courseData.code,
        userId: courseData.userId,
        courseLevel: courseData.courseLevel,
        startDate: courseData.startDate,
        endDate: courseData.endDate,
        isActive: courseData.isActive,
        country: courseData.country,
        organisation: courseData.organisation || '',
        description: RichTextFormatter.toLexical(courseData.description),
        assessmentRedesign: RichTextFormatter.toLexical(courseData.assessmentRedesign),
        targetIndustryPartnership: this.validateIndustryPartnership(courseData.targetIndustryPartnership),
        preferredPartnerRepresentative: courseData.preferredPartnerRepresentative || '',
        expectedEnrollment: courseData.expectedEnrollment || null,
        courseStatus: courseData.courseStatus || 'upcoming',
        isPartnered: courseData.isPartnered || false
      };
      
      // Format description field if it exists
      if (formattedData.description !== undefined) {
        formattedData.description = RichTextFormatter.toLexical(formattedData.description);
      }
      
      // Format assessmentRedesign field if it exists
      if (formattedData.assessmentRedesign !== undefined) {
        formattedData.assessmentRedesign = RichTextFormatter.toLexical(formattedData.assessmentRedesign);
      }
      
      // Send the request to Strapi
      const response = await this.strapiAuthService.post('/api/courses', {
        data: formattedData
      });
      
      const strapiId = response.data.id.toString();
      logger.info(`Created course in Strapi with ID ${strapiId}`);
      return strapiId;
    } catch (error) {
      logger.error(`Error creating course in Strapi: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Process the course creation queue
   * This method processes one course creation request at a time
   */
  private static async processNextCourseCreationRequest(): Promise<void> {
    if (StrapiSyncService.isProcessingCourseCreation || StrapiSyncService.courseCreationQueue.length === 0) {
      return;
    }
    
    // Set flag to indicate we're processing a request
    StrapiSyncService.isProcessingCourseCreation = true;
    
    // Get the next request from the queue
    const request = StrapiSyncService.courseCreationQueue.shift();
    
    if (!request) {
      StrapiSyncService.isProcessingCourseCreation = false;
      return;
    }
    
    try {
      // Process the request
      const instance = StrapiSyncService.getInstance();
      const strapiId = await instance.createCourseInStrapi(request.courseData);
      
      // Resolve the promise with the Strapi ID
      request.resolve(strapiId);
    } catch (error) {
      // Reject the promise with the error
      request.reject(error);
    } finally {
      // Reset the processing flag and process the next request if any
      StrapiSyncService.isProcessingCourseCreation = false;
      StrapiSyncService.processNextCourseCreationRequest();
    }
  }
  
  /**
   * Create a course in Strapi using a queue to serialize requests
   * This method queues the course creation request and processes them one at a time
   * to prevent concurrent creation issues
   * 
   * @param courseData The course data to create
   * @returns Promise that resolves to the created Strapi course ID
   */
  public async createCourseInStrapiQueued(courseData: any): Promise<string> {
    // First check if a course with this code already exists
    if (courseData.code) {
      try {
        const existingCourses = await this.searchCourses(courseData.code);
        
        // Check for exact code match
        const exactMatch = existingCourses.find((course: any) => 
          course.attributes && course.attributes.code === courseData.code
        );
        
        if (exactMatch) {
          logger.info(`Course with code ${courseData.code} already exists in Strapi with ID ${exactMatch.id}`);
          return exactMatch.id.toString();
        }
      } catch (error) {
        logger.warn(`Error checking for existing course: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with creation even if check fails
      }
    }
    
    return new Promise<string>((resolve, reject) => {
      // Add the request to the queue
      StrapiSyncService.courseCreationQueue.push({
        courseData,
        resolve,
        reject
      });
      
      logger.info(`Queued course creation request for course ${courseData.name} (${courseData.code})`);
      
      // Try to process the next request in the queue
      setTimeout(() => StrapiSyncService.processNextCourseCreationRequest(), 0);
    });
  }

/**
 * Update a course in Strapi
 * @param strapiId The Strapi ID of the course
 * @param updateData The data to update in Strapi
 * @returns Promise resolving to true if successful
 */
public async updateCourseInStrapi(strapiId: string, updateData: any): Promise<boolean> {
  try {
    // Create a deep copy of the update data to avoid modifying the original
    const formattedData = { ...updateData };
    
    // Format description field if it exists
    if (formattedData.description !== undefined) {
      formattedData.description = RichTextFormatter.toLexical(formattedData.description);
    }
    
    // Format assessmentRedesign field if it exists
    if (formattedData.assessmentRedesign !== undefined) {
      formattedData.assessmentRedesign = RichTextFormatter.toLexical(formattedData.assessmentRedesign);
    }
    
    // Send the update request to Strapi
    await this.strapiAuthService.put(
      `/api/courses/${strapiId}`,
      { data: formattedData }
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
    await this.strapiAuthService.delete(`/api/courses/${strapiId}`);
    
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
      const response = await this.strapiAuthService.post('/api/challenges', {
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
    await this.strapiAuthService.put(
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
    await this.strapiAuthService.delete(`/api/challenges/${strapiId}`);
    
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
    const response = await this.strapiAuthService.get(`/api/challenges/${strapiId}`);
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
      const response = await this.strapiAuthService.get(`/api/challenges`, {
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
