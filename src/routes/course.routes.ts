// src/routes/course.routes.ts - Updated with organisation routes
import { Router } from 'express';
import { CourseController } from '../controllers/course.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { body, query } from 'express-validator';

const router = Router();

/**
 * @swagger
 * /api/courses:
 *   post:
 *     summary: Create a new course
 *     description: Create a new course with the specified details
 *     tags:
 *       - Courses
 *     security:
 *       - UserAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *               - level
 *               - startDate
 *               - endDate
 *               - country
 *             properties:
 *               name:
 *                 type: string
 *                 example: 'Introduction to Computer Science'
 *               code:
 *                 type: string
 *                 example: 'CS101'
 *               level:
 *                 type: string
 *                 enum: ['Undergraduate first & second year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
 *                 example: 'Undergraduate first & second year'
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: '2025-01-15'
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: '2025-05-15'
 *               country:
 *                 type: string
 *                 example: 'Australia'
 *               organisation:
 *                 type: string
 *                 example: 'University of Sydney'
 *               description:
 *                 type: string
 *                 example: 'An introductory course to computer science principles'
 *               expectedEnrollment:
 *                 type: number
 *                 example: 120
 *               targetIndustryPartnership:
 *                 type: string
 *                 example: 'Technology'
 *               preferredPartnerRepresentative:
 *                 type: string
 *                 example: 'Someone from a software company'
 *               isPrivate:
 *                 type: boolean
 *                 example: false
 *                 description: 'If true, the course will only be visible to its owner'
 *     responses:
 *       201:
 *         description: Course created successfully
 *       400:
 *         description: Bad request - invalid data
 *       401:
 *         description: Unauthorized - authentication required
 *       500:
 *         description: Internal server error
 */
router.post(
  '/', 
  AuthMiddleware.authenticateUser,
  [
    body('name').notEmpty().withMessage('Course name is required'),
    body('code').notEmpty().withMessage('Course code is required'),
    body('level').notEmpty().isIn(['Undergraduate first & second year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other'])
      .withMessage('Valid course level is required'),
    body('startDate').isISO8601().withMessage('Valid start date is required'),
    body('endDate').isISO8601().withMessage('Valid end date is required'),
    body('country').notEmpty().withMessage('Country is required'),
    body('organisation').optional(),
    body('isPrivate').optional().isBoolean().withMessage('isPrivate must be a boolean value')
  ],
  CourseController.createCourse
);

/**
 * @swagger
 * /api/courses:
 *   get:
 *     summary: Get all courses
 *     description: Retrieve a list of courses with optional filtering
 *     tags:
 *       - Courses
 *     parameters:
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *         description: Filter by course level
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country
 *       - in: query
 *         name: organisation
 *         schema:
 *           type: string
 *         description: Filter by organisation
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of items per page
 *       - in: query
 *         name: groupByUserCountry
 *         schema:
 *           type: boolean
 *         description: Group results by user country (local and overseas)
 *     responses:
 *       200:
 *         description: List of courses
 *       500:
 *         description: Internal server error
 */
router.get('/', CourseController.getCourses);

/**
 * @swagger
 * /api/courses/search:
 *   get:
 *     summary: Search courses
 *     description: Search courses by name, code, description, country or organisation
 *     tags:
 *       - Courses
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country
 *       - in: query
 *         name: organisation
 *         schema:
 *           type: string
 *         description: Filter by organisation
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Maximum number of results
 *       - in: query
 *         name: groupByUserCountry
 *         schema:
 *           type: boolean
 *         description: Group results by user country (local and overseas)
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Bad request - missing search query
 *       500:
 *         description: Internal server error
 */
router.get('/search', [
  query('q').optional(),
  query('country').optional(),
  query('organisation').optional(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('groupByUserCountry').optional().isBoolean()
], CourseController.searchCourses);

/**
 * @swagger
 * /api/courses/list:
 *   get:
 *     summary: Get a list of all courses with pagination
 *     description: Retrieve a paginated list of all courses with selected fields (id, name, code, startDate, endDate, status, organisation, targetIndustryPartnership, description)
 *     tags:
 *       - Courses
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of items per page
 *       - in: query
 *         name: groupByUserCountry
 *         schema:
 *           type: boolean
 *         description: Group results by user country (local and overseas)
 *     responses:
 *       200:
 *         description: List of courses with selected fields
 *       500:
 *         description: Internal server error
 */
router.get('/list', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('groupByUserCountry').optional().isBoolean()
], CourseController.getCoursesList);

/**
 * @swagger
 * /api/courses/filter:
 *   get:
 *     summary: Get filtered courses by specific field values
 *     description: Retrieve a paginated list of courses filtered by specific fields with selected response fields (id, name, code, level, startDate, endDate, status, organisation, country, targetIndustryPartnership, description)
 *     tags:
 *       - Courses
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of items per page
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: ['Undergraduate first & second year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
 *         description: Filter by course level
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country
 *       - in: query
 *         name: organisation
 *         schema:
 *           type: string
 *         description: Filter by organisation
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status (true/false)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['upcoming', 'ongoing', 'completed']
 *         description: Filter by lifecycle status
 *       - in: query
 *         name: groupByUserCountry
 *         schema:
 *           type: boolean
 *         description: Group results by user country (local and overseas)
 *     responses:
 *       200:
 *         description: Filtered list of courses
 *       500:
 *         description: Internal server error
 */
router.get('/filter', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('level').optional(),
  query('country').optional(),
  query('organisation').optional(),
  query('isActive').optional(),
  query('status').optional(),
  query('groupByUserCountry').optional().isBoolean()
], CourseController.getFilteredCourses);

/**
 * @swagger
 * /api/courses/by-location:
 *   get:
 *     summary: Get courses grouped by user's location
 *     description: Retrieves courses grouped by the user's country (local) and other countries (overseas)
 *     tags:
 *       - Courses
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of items per page
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: ['Undergraduate first & second year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
 *         description: Filter by course level
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: organisation
 *         schema:
 *           type: string
 *         description: Filter by organisation
 *     responses:
 *       200:
 *         description: Courses grouped by local and overseas
 *       400:
 *         description: Missing user country information
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/by-location', 
  AuthMiddleware.authenticateUser,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('level').optional(),
    query('active').optional(),
    query('organisation').optional()
  ],
  CourseController.getCoursesByUserLocation
);

/**
 * @swagger
 * /api/courses/organisation/{organisation}:
 *   get:
 *     summary: Get courses by organisation
 *     description: Retrieve courses offered by a specific organisation
 *     tags:
 *       - Courses
 *     parameters:
 *       - in: path
 *         name: organisation
 *         required: true
 *         schema:
 *           type: string
 *         description: The organisation name
 *     responses:
 *       200:
 *         description: List of courses
 *       400:
 *         description: Bad request - missing organisation
 *       500:
 *         description: Internal server error
 */
router.get('/organisation/:organisation', CourseController.getCoursesByOrganisation);

/**
 * @swagger
 * /api/courses/stats/organisation:
 *   get:
 *     summary: Get course statistics by organisation
 *     description: Retrieve statistics about courses grouped by organisation
 *     tags:
 *       - Courses
 *     responses:
 *       200:
 *         description: Course statistics
 *       500:
 *         description: Internal server error
 */
router.get('/stats/organisation', CourseController.getCourseStatsByOrganisation);

/**
 * @swagger
 * /api/courses/stats/academic:
 *   get:
 *     summary: Get course statistics by academic period
 *     description: Retrieve statistics about courses grouped by academic year and semester
 *     tags:
 *       - Courses
 *     responses:
 *       200:
 *         description: Course statistics
 *       500:
 *         description: Internal server error
 */
router.get('/stats/academic', CourseController.getCourseStatsByAcademicPeriod);

/**
 * @swagger
 * /api/courses/stats/country:
 *   get:
 *     summary: Get course statistics by country
 *     description: Retrieve statistics about courses grouped by country
 *     tags:
 *       - Courses
 *     responses:
 *       200:
 *         description: Course statistics
 *       500:
 *         description: Internal server error
 */
router.get('/stats/country', CourseController.getCourseStatsByCountry);

/**
 * @swagger
 * /api/courses/country/{country}:
 *   get:
 *     summary: Get courses by country
 *     description: Retrieve courses from a specific country
 *     tags:
 *       - Courses
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         description: The country name
 *     responses:
 *       200:
 *         description: List of courses
 *       400:
 *         description: Bad request - missing country
 *       500:
 *         description: Internal server error
 */
router.get('/country/:country', CourseController.getCoursesByCountry);

/**
 * @swagger
 * /api/courses/user/{userId}:
 *   get:
 *     summary: Get courses by creator
 *     description: Retrieve courses created by a specific user
 *     tags:
 *       - Courses
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     responses:
 *       200:
 *         description: List of courses
 *       400:
 *         description: Bad request - missing user ID
 *       500:
 *         description: Internal server error
 */
router.get('/user/:userId', CourseController.getCoursesByCreator);

/**
 * @swagger
 * /api/courses/user-courses/{userId}:
 *   get:
 *     summary: Get courses by user ID with pagination and selected fields
 *     description: Retrieve a paginated list of courses created by a specific user with selected fields (id, name, code, level, startDate, endDate, status, organisation, country, targetIndustryPartnership, description)
 *     tags:
 *       - Courses
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The creator user ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of items per page
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: ['Undergraduate first & second year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
 *         description: Filter by course level
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['upcoming', 'ongoing', 'completed']
 *         description: Filter by lifecycle status
 *     responses:
 *       200:
 *         description: List of user's courses with selected fields
 *       400:
 *         description: Bad request - missing user ID
 *       500:
 *         description: Internal server error
 */
router.get('/user-courses/:userId', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('level').optional(),
  query('status').optional()
], CourseController.getCoursesByUserId);

/**
 * @swagger
 * /api/courses/{courseId}:
 *   get:
 *     summary: Get course by ID
 *     description: Retrieve a specific course by its ID
 *     tags:
 *       - Courses
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The course ID
 *     responses:
 *       200:
 *         description: Course details
 *       400:
 *         description: Bad request - missing course ID
 *       404:
 *         description: Course not found
 *       500:
 *         description: Internal server error
 */
router.get('/:courseId', CourseController.getCourseById);

/**
 * @swagger
 * /api/courses/{courseId}:
 *   put:
 *     summary: Update course
 *     description: Update a course with the specified details
 *     tags:
 *       - Courses
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The course ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               level:
 *                 type: string
 *                 enum: ['Undergraduate first & second year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               country:
 *                 type: string
 *               organisation:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               isPrivate:
 *                 type: boolean
 *                 description: 'If true, the course will only be visible to its owner'
 *               description:
 *                 type: string
 *               expectedEnrollment:
 *                 type: number
 *               targetIndustryPartnership:
 *                 type: string
 *               preferredPartnerRepresentative:
 *                 type: string
 *     responses:
 *       200:
 *         description: Course updated successfully
 *       400:
 *         description: Bad request - invalid data
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Course not found
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:courseId',
  AuthMiddleware.authenticateUser,
  CourseController.updateCourse
);

/**
 * @swagger
 * /api/courses/{courseId}:
 *   delete:
 *     summary: Delete course
 *     description: Delete a specific course
 *     tags:
 *       - Courses
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The course ID
 *     responses:
 *       200:
 *         description: Course deleted successfully
 *       400:
 *         description: Bad request - missing course ID or active partnerships
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Course not found
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/:courseId',
  AuthMiddleware.authenticateUser,
  CourseController.deleteCourse
);

/**
 * @swagger
 * /api/courses/{courseId}/status:
 *   patch:
 *     summary: Update course active status
 *     description: Update the active status of a course
 *     tags:
 *       - Courses
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The course ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isActive
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Course status updated successfully
 *       400:
 *         description: Bad request - missing isActive status
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Course not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  '/:courseId/status',
  AuthMiddleware.authenticateUser,
  CourseController.setCourseActiveStatus
);

/**
 * @swagger
 * /api/courses/{courseId}/multimedia:
 *   post:
 *     summary: Add multimedia files to a course
 *     description: Add one or more multimedia files to a course
 *     tags:
 *       - Courses
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The course ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - files
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - fileId
 *                     - type
 *                     - name
 *                   properties:
 *                     fileId:
 *                       type: string
 *                       description: The file ID in storage system
 *                     type:
 *                       type: string
 *                       enum: ['image', 'file', 'video', 'audio']
 *                       description: The type of the file
 *                     url:
 *                       type: string
 *                       description: URL if stored externally
 *                     name:
 *                       type: string
 *                       description: Original filename
 *                     size:
 *                       type: number
 *                       description: File size in bytes
 *                     mimeType:
 *                       type: string
 *                       description: MIME type of the file
 *     responses:
 *       200:
 *         description: Multimedia files added successfully
 *       400:
 *         description: Bad request - missing course ID or files
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Course not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:courseId/multimedia',
  AuthMiddleware.authenticateUser,
  CourseController.addMultimediaFiles
);

/**
 * @swagger
 * /api/courses/{courseId}/multimedia/{fileId}:
 *   delete:
 *     summary: Remove a multimedia file from a course
 *     description: Remove a specific multimedia file from a course
 *     tags:
 *       - Courses
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The course ID
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: The file ID to remove
 *     responses:
 *       200:
 *         description: Multimedia file removed successfully
 *       400:
 *         description: Bad request - missing course ID or file ID
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Course or file not found
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/:courseId/multimedia/:fileId',
  AuthMiddleware.authenticateUser,
  CourseController.removeMultimediaFile
);

/**
 * @swagger
 * /api/courses/{courseId}/localizations:
 *   put:
 *     summary: Update course localizations
 *     description: Update or add localizations for a course
 *     tags:
 *       - Courses
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The course ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - localizations
 *             properties:
 *               localizations:
 *                 type: object
 *                 description: Map of locale codes to localized content
 *                 additionalProperties:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       description: Localized name
 *                     description:
 *                       type: string
 *                       description: Localized description
 *                     targetIndustryPartnership:
 *                       type: string
 *                       description: Localized target industry
 *                     preferredPartnerRepresentative:
 *                       type: string
 *                       description: Localized preferred partner representative
 *     responses:
 *       200:
 *         description: Localizations updated successfully
 *       400:
 *         description: Bad request - missing course ID or localizations
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Course not found
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:courseId/localizations',
  AuthMiddleware.authenticateUser,
  CourseController.updateLocalizations
);

export default router;