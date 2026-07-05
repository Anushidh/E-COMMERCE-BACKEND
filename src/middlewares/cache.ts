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
 * Invalidates cache entries matching a pattern using SCAN (non-blocking).
 * KEYS is O(N) and blocks the Redis event loop — SCAN iterates incrementally.
 * Useful when data changes (e.g., product updated → clear product cache).
 *
 * Usage: await invalidateCache('cache:/api/products*')
 */
export const invalidateCache = async (pattern: string): Promise<void> => {
  try {
    // Use SCAN to avoid blocking Redis with KEYS on large keyspaces
    let cursor = '0';
    const keysToDelete: string[] = [];

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keysToDelete.push(...keys);
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } catch (err) {
    console.error('Cache invalidation error:', err);
  }
};
