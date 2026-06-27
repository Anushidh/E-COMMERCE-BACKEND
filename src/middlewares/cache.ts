import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

/**
 * Redis caching middleware factory.
 * Caches GET responses for the specified duration (in seconds).
 * Cache key is based on the full URL (path + query string).
 * Only caches successful (200) responses.
 *
 * Usage: router.get('/products', cache(60), getProducts)
 */
export const cache = (ttlSeconds: number) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    const cacheKey = `cache:${req.originalUrl}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        res.status(200).json(parsed);
        return;
      }
    } catch (err) {
      // If Redis fails, just skip cache and continue
      console.error('Cache read error:', err);
    }

    // Override res.json to intercept the response and cache it
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Only cache successful responses
      if (res.statusCode === 200) {
        redis.setex(cacheKey, ttlSeconds, JSON.stringify(body)).catch((err) => {
          console.error('Cache write error:', err);
        });
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * Invalidates cache entries matching a pattern.
 * Useful when data changes (e.g., product updated → clear product cache).
 *
 * Usage: await invalidateCache('cache:/api/products*')
 */
export const invalidateCache = async (pattern: string): Promise<void> => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('Cache invalidation error:', err);
  }
};
