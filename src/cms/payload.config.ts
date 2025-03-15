// src/cms/payload.config.ts
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

// // Import your collections
// import { Users } from './collections/Users'
// import { Articles } from './collections/Articles'
// import { Media } from './collections/Media'

// Use dirname correctly in ESM
const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
//   admin: {
//     user: Users.slug,
//   },
//   collections: [
//     Users,
//     Articles,
//     Media,
//     // Other collections
//   ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'your-dev-secret-key',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.MONGODB_URI || 'mongodb://localhost/cms',
  }),
  sharp,
})