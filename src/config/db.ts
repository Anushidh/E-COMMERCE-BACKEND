import mongoose from 'mongoose';
import { env } from './env';

/**
 * Establishes a connection to MongoDB using Mongoose.
 * Exits the process with code 1 if the connection fails (fail-fast on startup).
 */
export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};
