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
 *                 enum: ['Undergraduate 1st & 2nd year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
 *                 example: 'Undergraduate 1st & 2nd year'
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
    body('level').notEmpty().isIn(['Undergraduate 1st & 2nd year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other'])
      .withMessage('Valid course level is required'),
    body('startDate').isISO8601().withMessage('Valid start date is required'),
    body('endDate').isISO8601().withMessage('Valid end date is required'),
    body('country').notEmpty().withMessage('Country is required'),
    body('organisation').optional()
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
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt()
], CourseController.searchCourses);

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
 *                 enum: ['Undergraduate 1st & 2nd year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
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
 * /api/courses/{courseId}/sync:
 *   post:
 *     summary: Synchronize course with Strapi
 *     description: Manually synchronize a course with Strapi CMS
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
 *         description: Course synchronized successfully
 *       400:
 *         description: Bad request - missing course ID
 *       401:
 *         description: Unauthorized - authentication required
 *       404:
 *         description: Course not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:courseId/sync',
  AuthMiddleware.authenticateUser,
  CourseController.syncCourseWithStrapi
);

export default router;