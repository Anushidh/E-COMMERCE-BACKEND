import mongoose from 'mongoose';
import { env } from '../config/env';
import Admin from '../models/Admin';

/**
 * Seeds the first admin account from environment variables.
 * Run this once during initial setup: npx ts-node src/scripts/seedAdmin.ts
 * Skips if an admin with the same email already exists.
 */
const seedAdmin = async (): Promise<void> => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const existing = await Admin.findOne({ email: env.ADMIN_EMAIL, isDeleted: false });
    if (existing) {
      console.log(`Admin already exists: ${env.ADMIN_EMAIL}`);
      process.exit(0);
    }

    const admin = await Admin.create({
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    });

    console.log(`Admin created successfully:`);
    console.log(`  Name: ${admin.name}`);
    console.log(`  Email: ${admin.email}`);
    console.log(`  ID: ${admin._id}`);
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed admin:', error);
    process.exit(1);
  }
};

seedAdmin();
