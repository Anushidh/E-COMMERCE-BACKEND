import dotenv from 'dotenv';
dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

/**
 * Asserts that a required environment variable is set in production.
 * In development, falls back to the provided default.
 * Throws at startup if a required secret is missing in production — fail fast.
 */
function requireEnv(key: string, defaultValue: string): string {
  const value = process.env[key];
  if (!value) {
    if (isProd) {
      throw new Error(`[ENV] Missing required environment variable in production: ${key}`);
    }
    return defaultValue;
  }
  return value;
}

/**
 * Centralized environment configuration.
 * Loads all environment variables with sensible defaults for local development.
 * In production, these should be set via the hosting platform's env management.
 * Critical secrets will throw on startup if missing in production.
 */
export const env = {
  // Server
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // MongoDB
  MONGODB_URI: requireEnv('MONGODB_URI', 'mongodb://localhost:27017/ecommerce'),

  // Redis (used for OTP storage, token blacklisting, signup temp data)
  REDIS_URL: requireEnv('REDIS_URL', 'redis://localhost:6379'),

  // JWT tokens — secrets are required in production (no insecure defaults)
  JWT_ACCESS_SECRET: requireEnv('JWT_ACCESS_SECRET', 'dev_access_secret_change_in_production'),
  JWT_REFRESH_SECRET: requireEnv('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_in_production'),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // Google OAuth 2.0
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',

  // Cloudinary (image uploads)
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',

  // SendGrid (email delivery)
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '',
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || 'Wearhaus',
  FROM_EMAIL: process.env.FROM_EMAIL || 'noreply@ecommerce.com',

  // Razorpay (payment gateway) — required in production
  RAZORPAY_KEY_ID: requireEnv('RAZORPAY_KEY_ID', ''),
  RAZORPAY_KEY_SECRET: requireEnv('RAZORPAY_KEY_SECRET', ''),
  RAZORPAY_WEBHOOK_SECRET: requireEnv('RAZORPAY_WEBHOOK_SECRET', ''),

  // Frontend URL (used for CORS and OAuth redirects)
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',

  // Business rules
  REFERRAL_REWARD_AMOUNT: parseInt(process.env.REFERRAL_REWARD_AMOUNT || '100', 10),
  LOW_STOCK_THRESHOLD: parseInt(process.env.LOW_STOCK_THRESHOLD || '5', 10),

  // Delivery charges
  DELIVERY_CHARGE: parseInt(process.env.DELIVERY_CHARGE || '40', 10),
  FREE_DELIVERY_THRESHOLD: parseInt(process.env.FREE_DELIVERY_THRESHOLD || '499', 10),

  // Seller state (for GST CGST/SGST vs IGST determination)
  SELLER_STATE: process.env.SELLER_STATE || 'Maharashtra',

  // Company details (for invoices)
  COMPANY_NAME: process.env.COMPANY_NAME || 'Your E-Commerce Store',
  COMPANY_ADDRESS: process.env.COMPANY_ADDRESS || '123, Business Park, Mumbai',
  COMPANY_CITY_STATE_PIN: process.env.COMPANY_CITY_STATE_PIN || 'Maharashtra, India - 400001',
  COMPANY_GSTIN: process.env.COMPANY_GSTIN || '27XXXXX1234X1Z5',
  COMPANY_EMAIL: process.env.COMPANY_EMAIL || 'support@ecommerce.com',
  COMPANY_PHONE: process.env.COMPANY_PHONE || '+91 9876543210',

  // Admin seed
  ADMIN_NAME: process.env.ADMIN_NAME || 'Super Admin',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@ecommerce.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@123',

  // Cart limits
  MAX_QUANTITY_PER_ITEM: parseInt(process.env.MAX_QUANTITY_PER_ITEM || '10', 10),
  MAX_CART_ITEMS: parseInt(process.env.MAX_CART_ITEMS || '20', 10),
};
