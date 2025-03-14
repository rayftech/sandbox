// src/config/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';
import { createLogger } from './logger';

const logger = createLogger('SwaggerConfig');

/**
 * Configure Swagger documentation for the application
 */
export function setupSwagger(app: Application): void {
  // Swagger definition
  const swaggerOptions: swaggerJsdoc.Options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Academic-Industry Partnership API',
        version: '1.0.0',
        description: 'API for managing academic-industry partnerships, users, courses, and projects',
        contact: {
          name: 'API Support',
          email: 'support@example.com',
        },
      },
      servers: [
        {
          url: '/api',
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          UserAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'x-user-id',
            description: 'User ID for authentication',
          },
        },
        schemas: {
          User: {
            type: 'object',
            properties: {
              userId: {
                type: 'string',
                example: '399ee4d8-c081-7025-f7fb-b98931232178',
              },
              email: {
                type: 'string',
                format: 'email',
                example: 'raymondf0123@gmail.com',
              },
              firstName: {
                type: 'string',
                example: 'JunJie',
              },
              lastName: {
                type: 'string',
                example: 'Fu',
              },
              userType: {
                type: 'string',
                enum: ['academic', 'industry', 'admin'],
                example: 'academic',
              },
              isAdmin: {
                type: 'boolean',
                example: false,
              },
            },
          },
          Error: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                example: 'error',
              },
              message: {
                type: 'string',
                example: 'Error message',
              },
              statusCode: {
                type: 'integer',
                example: 400,
              },
            },
          },
        },
      },
      tags: [
        {
          name: 'Auth',
          description: 'Authentication endpoints',
        },
        {
          name: 'Users',
          description: 'User management endpoints',
        },
        {
          name: 'Health',
          description: 'Health check endpoints',
        },
      ],
    },
    // Path to the API docs with JSDoc annotations
    apis: [
      './src/routes/*.ts',           // Route files
      './src/routes/auth.routes.ts', // Auth routes specifically
      './src/routes/user.routes.ts', // User routes specifically
      './src/routes/index.ts',       // Main routes
      './src/app.ts'                // App file for the health endpoint
    ],
  };

  // Initialize swagger-jsdoc
  const swaggerSpec = swaggerJsdoc(swaggerOptions);

  // Serve swagger docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  
  // Serve swagger spec as JSON
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  logger.info('Swagger documentation initialized at /api-docs');
}