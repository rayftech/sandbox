// src/collections/User.ts
import { CollectionConfig } from 'payload';

export const User: CollectionConfig = {
  slug: 'users',
  auth: {
    useAPIKey: true,
  },
  admin: {
    useAsTitle: 'email',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'userId',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
    },
    {
      name: 'firstName',
      type: 'text',
    },
    {
      name: 'lastName',
      type: 'text',
    },
    {
      name: 'userType',
      type: 'select',
      options: [
        { label: 'Academic', value: 'academic' },
        { label: 'Industry', value: 'industry' },
        { label: 'Admin', value: 'admin' },
      ],
      defaultValue: 'academic',
    },
    {
      name: 'isAdmin',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'country',
      type: 'text',
    },
    // Add other fields that match your existing user model
  ],
};