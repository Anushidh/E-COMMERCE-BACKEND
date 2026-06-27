import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { redis } from '../config/redis';

interface TokenPayload {
  userId: string;
  role: string;
}

const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** Generates a short-lived JWT access token (default 15 min). */
export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
};

/**
 * Generates a refresh token and stores it in Redis.
 * The token is a UUID mapped to the user payload — not a JWT itself.
 * This allows server-side invalidation and rotation.
 */
export const generateRefreshToken = async (payload: TokenPayload): Promise<string> => {
  const tokenId = uuidv4();
  await redis.setex(
    `refresh:${tokenId}`,
    REFRESH_TOKEN_EXPIRY_SECONDS,
    JSON.stringify(payload)
  );
  return tokenId;
};

/** Verifies and decodes an access token. Throws on invalid/expired token. */
export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
};

/**
 * Verifies a refresh token by looking it up in Redis.
 * Returns the stored payload if valid, throws if expired/invalid.
 * Implements rotation: the old token is immediately invalidated
 * and a new one is issued.
 */
export const verifyAndRotateRefreshToken = async (tokenId: string): Promise<{ payload: TokenPayload; newRefreshToken: string }> => {
  const stored = await redis.get(`refresh:${tokenId}`);
  if (!stored) {
    throw new Error('Invalid or expired refresh token');
  }

  // Invalidate the old token immediately (rotation)
  await redis.del(`refresh:${tokenId}`);

  const payload = JSON.parse(stored) as TokenPayload;

  // Issue a new refresh token
  const newTokenId = uuidv4();
  await redis.setex(
    `refresh:${newTokenId}`,
    REFRESH_TOKEN_EXPIRY_SECONDS,
    JSON.stringify(payload)
  );

  return { payload, newRefreshToken: newTokenId };
};

/** Adds a token to the Redis blacklist so it's rejected on subsequent requests. */
export const blacklistToken = async (token: string, expiresInSeconds: number): Promise<void> => {
  await redis.setex(`blacklist:${token}`, expiresInSeconds, '1');
};

/** Checks if a token has been blacklisted (e.g., after logout). */
export const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  const result = await redis.get(`blacklist:${token}`);
  return result !== null;
};

/** Invalidates a refresh token stored in Redis. */
export const invalidateRefreshToken = async (tokenId: string): Promise<void> => {
  await redis.del(`refresh:${tokenId}`);
};
