import Redis from 'ioredis';
import { env } from './env';

/**
 * Redis client instance (ioredis).
 * Used for: OTP temporary storage, signup data caching, token blacklisting.
 * Logs connection status and errors to the console.
 */
export const redis = new Redis(env.REDIS_URL);

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});
