import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

/**
 * Configures the Cloudinary SDK with credentials from environment variables.
 * Used as the storage backend for product images, category images, and user avatars.
 */
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export default cloudinary;
