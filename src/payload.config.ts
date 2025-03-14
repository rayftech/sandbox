// src/payload.config.ts
import { buildConfig } from 'payload/config';
import path from 'path';
import { mongooseAdapter } from '@payloadcms/db-mongodb';
import { dbConnection } from './config/database';
import { createLogger } from './config/logger';

// Import the collections we'll create
import { UsersCollection } from './collections/Users';
import { CoursesCollection } from './collections/Courses';
import { ProjectsCollection } from './collections/Projects';
import { PartnershipsCollection } from './collections/Partnerships';

const logger = createLogger('PayloadCMS');

export default buildConfig({
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000',
  admin: {
    user: 'User', // This should match the collection slug for your users
    meta: {
      titleSuffix: '- Academic Industry Sandbox Admin',
      ogImage: '/og-image.jpg',
      favicon: '/favicon.ico',
    },
  },
  collections: [
    UsersCollection,
    CoursesCollection,
    ProjectsCollection,
    PartnershipsCollection,
  ],
  db: mongooseAdapter({
    // We use our existing Mongoose connection
    url: process.env.ATLAS_URI || 'mongodb://localhost:27017/sandbox_db',
    connectOptions: {
      // Pass our existing dbConnection.connect method options if needed
    }
  }),
  typescript: {
    outputFile: path.resolve(__dirname, 'payload-types.ts'),
  },
  graphQL: {
    schemaOutputFile: path.resolve(__dirname, 'generated-schema.graphql'),
  },
  // Uncomment this when we're ready to use it
  // plugins: [
  //   // We may need to add plugins such as form-builder, seo, etc.
  // ],
  onInit: async (payload) => {
    // Triggered when Payload initializes
    logger.info('Payload CMS initialized');
  },
});