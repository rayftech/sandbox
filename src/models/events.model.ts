// src/models/events.model.ts
import { PartnershipStatus } from './partnership.model';
import { CourseLevel } from './course.model';

/**
 * Common type for student level that works across models
 * This helps align StudentLevel and CourseLevel between models
 */
export type StudentLevelType = string;

/**
 * Event types for the message system
 */
export enum EventType {
  // Partnership events
  PARTNERSHIP_REQUESTED = 'partnership.requested',
  PARTNERSHIP_APPROVED = 'partnership.approved',
  PARTNERSHIP_REJECTED = 'partnership.rejected',
  PARTNERSHIP_COMPLETED = 'partnership.completed',
  PARTNERSHIP_CANCELED = 'partnership.canceled',
  
  // User events
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  
  // Course events
  COURSE_CREATED = 'course.created',
  COURSE_UPDATED = 'course.updated',
  COURSE_DELETED = 'course.deleted',
  
  // Project events
  PROJECT_CREATED = 'project.created',
  PROJECT_UPDATED = 'project.updated',
  PROJECT_DELETED = 'project.deleted',
  
  // Analytics events
  ANALYTICS_UPDATE = 'analytics.update',
  
  // Notification events
  NOTIFICATION_EMAIL = 'notification.email',
  NOTIFICATION_SYSTEM = 'notification.system'
}

/**
 * Base event interface
 */
export interface BaseEvent {
  id: string;
  type: EventType;
  timestamp: Date;
  // For tracing and debugging
  correlationId?: string;
  source?: string;
}

/**
 * Partnership event interface
 */
export interface PartnershipEvent extends BaseEvent {
  partnershipId: string;
  courseId: string;
  projectId: string;
  requestedByUserId: string;
  requestedToUserId: string;
  status: PartnershipStatus;
  // Additional data based on the event type
  message?: string;
}

/**
 * User event interface - updated to include new fields from Amplify
 */
export interface UserEvent extends BaseEvent {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'academic' | 'industry' | 'admin';
  country?: string;
  organisation?: string;
  fieldOfExpertise?: string[] | string;
}

/**
 * Course event interface
 */
export interface CourseEvent extends BaseEvent {
  courseId: string;
  name: string;
  code: string;
  level: CourseLevel | string; // Allow string to be more flexible
  creatorUserId: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Project event interface
 */
export interface ProjectEvent extends BaseEvent {
  projectId: string;
  title: string;
  shortDescription: string;
  creatorUserId: string;
  studentLevel: StudentLevelType; // Using the common type
  startDate: Date;
  endDate: Date;
  country: string;  // Add country field (this was missing)
  organisation?: string;  // Add organisation field
}

/**
 * Email notification event interface
 */
export interface EmailNotificationEvent extends BaseEvent {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  templateId: string;
  templateData: Record<string, any>;
}

/**
 * System notification event interface
 */
export interface SystemNotificationEvent extends BaseEvent {
  recipientUserId: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  link?: string;
  read?: boolean;
}