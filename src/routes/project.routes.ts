// src/routes/project.routes.ts
import { Router } from 'express';
import { ProjectController } from '../controllers/project.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { body, query } from 'express-validator';

const router = Router();

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     description: Create a new project with the specified details
 *     tags:
 *       - Projects
 *     security:
 *       - UserAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - studentLevel
 *               - startDate
 *               - endDate
 *               - country
 *             properties:
 *               title:
 *                 type: string
 *                 example: 'AI Data Analysis for Financial Services'
 *               shortDescription:
 *                 type: string
 *                 example: 'A project to build AI tools for financial data analysis'
 *               detailedDescription:
 *                 type: string
 *                 example: 'Detailed overview of the project goals and required work'
 *               aim:
 *                 type: string
 *                 example: 'Build a machine learning system to analyze financial patterns'
 *               potentialSolution:
 *                 type: string
 *                 example: 'Potential implementation details and approaches'
 *               studentLevel:
 *                 type: string
 *                 enum: ['Undergraduate 1st & 2nd year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
 *                 example: 'Postgraduate'
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
 *                 example: 'United Kingdom'
 *               organisation:
 *                 type: string
 *                 example: 'Finance Tech Ltd'
 *               targetAcademicPartnership:
 *                 type: string
 *                 example: 'Data Science'
 *     responses:
 *       201:
 *         description: Project created successfully
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
    body('title').notEmpty().withMessage('Project title is required'),
    body('studentLevel').notEmpty().isIn(['Undergraduate 1st & 2nd year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other'])
      .withMessage('Valid student level is required'),
    body('startDate').isISO8601().withMessage('Valid start date is required'),
    body('endDate').isISO8601().withMessage('Valid end date is required'),
    body('country').notEmpty().withMessage('Country is required'),
    body('organisation').optional()
  ],
  ProjectController.createProject
);

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     description: Retrieve a list of projects with optional filtering
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: query
 *         name: studentLevel
 *         schema:
 *           type: string
 *         description: Filter by student level
 *       - in: query
 *         name: isActive
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
 *         name: targetAcademicPartnership
 *         schema:
 *           type: string
 *         description: Filter by academic partnership type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by project status
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
 *         description: List of projects
 *       500:
 *         description: Internal server error
 */
router.get('/', ProjectController.getProjects);

/**
 * @swagger
 * /api/projects/list:
 *   get:
 *     summary: Get a list of projects with specific fields
 *     description: Retrieve a list of projects with only essential fields (name, studentLevel, organisation, startDate, endDate, status, targetAcademicPartnership, shortDescription)
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: query
 *         name: studentLevel
 *         schema:
 *           type: string
 *         description: Filter by student level
 *       - in: query
 *         name: organisation
 *         schema:
 *           type: string
 *         description: Filter by organisation
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by project status
 *       - in: query
 *         name: targetAcademicPartnership
 *         schema:
 *           type: string
 *         description: Filter by academic partnership type
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
 *         description: List of projects with specific fields
 *       500:
 *         description: Internal server error
 */
router.get('/list', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('studentLevel').optional(),
  query('organisation').optional(),
  query('status').optional(),
  query('targetAcademicPartnership').optional()
], ProjectController.getProjectsList);

/**
 * @swagger
 * /api/projects/filter:
 *   get:
 *     summary: Get filtered projects by specific field values
 *     description: Retrieve a paginated list of projects filtered by specific fields with selected response fields
 *     tags:
 *       - Projects
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
 *         name: studentLevel
 *         schema:
 *           type: string
 *           enum: ['Undergraduate 1st & 2nd year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
 *         description: Filter by student level
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
 *         name: targetAcademicPartnership
 *         schema:
 *           type: string
 *         description: Filter by academic partnership type
 *     responses:
 *       200:
 *         description: Filtered list of projects
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     projects:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           shortDescription:
 *                             type: string
 *                           studentLevel:
 *                             type: string
 *                           startDate:
 *                             type: string
 *                             format: date-time
 *                           endDate:
 *                             type: string
 *                             format: date-time
 *                           status:
 *                             type: string
 *                           organisation:
 *                             type: string
 *                           country:
 *                             type: string
 *                           targetAcademicPartnership:
 *                             type: string
 *                           isActive:
 *                             type: boolean
 *                     filters:
 *                       type: object
 *                       description: The filters that were applied
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           description: Total number of matching items
 *                         pages:
 *                           type: integer
 *                           description: Total number of pages
 *                         page:
 *                           type: integer
 *                           description: Current page number
 *                         limit:
 *                           type: integer
 *                           description: Number of items per page
 *       500:
 *         description: Internal server error
 */
router.get('/filter', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('studentLevel').optional(),
  query('country').optional(),
  query('organisation').optional(),
  query('isActive').optional(),
  query('status').optional(),
  query('targetAcademicPartnership').optional()
], ProjectController.getFilteredProjects);

/**
 * @swagger
 * /api/projects/search:
 *   get:
 *     summary: Search projects
 *     description: Search projects by title, description, country or organisation
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: query
 *         name: q
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
 *         description: Bad request - missing search parameters
 *       500:
 *         description: Internal server error
 */
router.get('/search', [
  query('q').optional(),
  query('country').optional(),
  query('organisation').optional(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt()
], ProjectController.searchProjects);

/**
 * @swagger
 * /api/projects/student-level/{studentLevel}:
 *   get:
 *     summary: Get projects by student level
 *     description: Retrieve projects requiring a specific student level
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: studentLevel
 *         required: true
 *         schema:
 *           type: string
 *           enum: ['Undergraduate 1st & 2nd year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
 *         description: The student level to filter by
 *     responses:
 *       200:
 *         description: List of projects matching the student level
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     projects:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           shortDescription:
 *                             type: string
 *                           studentLevel:
 *                             type: string
 *                           organisation:
 *                             type: string
 *                           country:
 *                             type: string
 *                     count:
 *                       type: integer
 *                       description: Number of projects found
 *                     studentLevel:
 *                       type: string
 *                       description: The student level that was searched for
 *       400:
 *         description: Bad request - missing student level
 *       500:
 *         description: Internal server error
 */
router.get('/student-level/:studentLevel', ProjectController.getProjectsByStudentLevel);

/**
 * @swagger
 * /api/projects/organisation/{organisation}:
 *   get:
 *     summary: Get projects by organisation
 *     description: Retrieve projects offered by a specific organisation
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: organisation
 *         required: true
 *         schema:
 *           type: string
 *         description: The organisation name
 *     responses:
 *       200:
 *         description: List of projects
 *       400:
 *         description: Bad request - missing organisation
 *       500:
 *         description: Internal server error
 */
router.get('/organisation/:organisation', ProjectController.getProjectsByOrganisation);

/**
 * @swagger
 * /api/projects/country/{country}:
 *   get:
 *     summary: Get projects by country
 *     description: Retrieve projects from a specific country
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         description: The country name
 *     responses:
 *       200:
 *         description: List of projects
 *       400:
 *         description: Bad request - missing country
 *       500:
 *         description: Internal server error
 */
router.get('/country/:country', ProjectController.getProjectsByCountry);

/**
 * @swagger
 * /api/projects/user/{userId}:
 *   get:
 *     summary: Get projects by creator
 *     description: Retrieve projects created by a specific user
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     responses:
 *       200:
 *         description: List of projects
 *       400:
 *         description: Bad request - missing user ID
 *       500:
 *         description: Internal server error
 */
router.get('/user/:userId', ProjectController.getProjectsByCreator);

/**
 * @swagger
 * /api/projects/user-projects/{userId}:
 *   get:
 *     summary: Get projects by user ID with pagination
 *     description: Retrieve a paginated list of projects created by a specific user with optional filtering
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
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
 *         name: studentLevel
 *         schema:
 *           type: string
 *           enum: ['Undergraduate 1st & 2nd year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
 *         description: Filter by student level
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['upcoming', 'ongoing', 'completed']
 *         description: Filter by project status
 *     responses:
 *       200:
 *         description: Paginated list of projects created by the specified user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     projects:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           shortDescription:
 *                             type: string
 *                           studentLevel:
 *                             type: string
 *                           startDate:
 *                             type: string
 *                             format: date-time
 *                           endDate:
 *                             type: string
 *                             format: date-time
 *                           status:
 *                             type: string
 *                           organisation:
 *                             type: string
 *                           country:
 *                             type: string
 *                     userId:
 *                       type: string
 *                       description: The user ID that was searched for
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           description: Total number of matching items
 *                         pages:
 *                           type: integer
 *                           description: Total number of pages
 *                         page:
 *                           type: integer
 *                           description: Current page number
 *                         limit:
 *                           type: integer
 *                           description: Number of items per page
 *       400:
 *         description: Bad request - missing user ID
 *       500:
 *         description: Internal server error
 */
router.get('/user-projects/:userId', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('studentLevel').optional(),
  query('status').optional()
], ProjectController.getProjectsByUserId);

/**
 * @swagger
 * /api/projects/{projectId}:
 *   get:
 *     summary: Get project by ID
 *     description: Retrieve a specific project by its ID
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The project ID
 *     responses:
 *       200:
 *         description: Project details
 *       400:
 *         description: Bad request - missing project ID
 *       404:
 *         description: Project not found
 *       500:
 *         description: Internal server error
 */
router.get('/:projectId', ProjectController.getProjectById);

/**
 * @swagger
 * /api/projects/{projectId}:
 *   put:
 *     summary: Update project
 *     description: Fully update a project with the specified details
 *     tags:
 *       - Projects
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Project title (will be mapped to 'name' field in database)
 *               shortDescription:
 *                 type: string
 *                 description: Brief overview of the project
 *               detailedDescription:
 *                 type: string
 *                 description: Detailed project description (will be converted to rich text format)
 *               aim:
 *                 type: string
 *                 description: Project aims and objectives (will be converted to rich text format)
 *               potentialSolution:
 *                 type: string
 *                 description: Potential solutions or approaches (will be converted to rich text format)
 *               additionalInformation:
 *                 type: string
 *                 description: Additional project information (will be converted to rich text format)
 *               studentLevel:
 *                 type: string
 *                 enum: ['Undergraduate 1st & 2nd year', 'Undergraduate penultimate & final year', 'Postgraduate', 'Other']
 *                 description: Required student level for the project
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Project start date (must be before end date)
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: Project end date (must be after start date)
 *               country:
 *                 type: string
 *                 description: Country where the project is based
 *               organisation:
 *                 type: string
 *                 description: Organization offering the project
 *               isActive:
 *                 type: boolean
 *                 description: Whether the project is active
 *               targetAcademicPartnership:
 *                 type: string
 *                 description: Target academic discipline for partnerships
 *               multimedia:
 *                 type: array
 *                 description: Associated media files
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                     name:
 *                       type: string
 *                     mimeType:
 *                       type: string
 *                     size:
 *                       type: number
 *     responses:
 *       200:
 *         description: Project updated successfully
 *       400:
 *         description: Bad request - invalid data
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Project not found
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:projectId',
  AuthMiddleware.authenticateUser,
  ProjectController.updateProject
);

/**
 * @swagger
 * /api/projects/{projectId}:
 *   patch:
 *     summary: Partially update project
 *     description: Update specific fields of a project without needing to provide all fields
 *     tags:
 *       - Projects
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Any field from the project model can be updated
 *     responses:
 *       200:
 *         description: Project updated successfully
 *       400:
 *         description: Bad request - invalid data
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Project not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  '/:projectId',
  AuthMiddleware.authenticateUser,
  ProjectController.updateProject
);

/**
 * @swagger
 * /api/projects/{projectId}:
 *   delete:
 *     summary: Delete project
 *     description: Delete a specific project
 *     tags:
 *       - Projects
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The project ID
 *       - in: query
 *         name: force
 *         schema:
 *           type: boolean
 *         description: Force deletion even if project has active partnerships (admin only)
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Project deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     projectId:
 *                       type: string
 *                       description: The ID of the deleted project
 *       400:
 *         description: Bad request - missing project ID or active partnerships
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Project not found
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/:projectId',
  AuthMiddleware.authenticateUser,
  ProjectController.deleteProject
);

/**
 * @swagger
 * /api/projects/{projectId}/status:
 *   patch:
 *     summary: Update project active status
 *     description: Update the active status of a project
 *     tags:
 *       - Projects
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The project ID
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
 *         description: Project status updated successfully
 *       400:
 *         description: Bad request - missing isActive status
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Project not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  '/:projectId/status',
  AuthMiddleware.authenticateUser,
  ProjectController.setProjectActiveStatus
);

export default router;