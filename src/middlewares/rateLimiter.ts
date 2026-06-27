import rateLimit from 'express-rate-limit';

/** Rate limiter for auth routes (login, signup, reset): 10 requests per 15 minutes per IP. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Rate limiter for OTP resend requests: 3 requests per 1 minute per IP. */
export const otpRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { success: false, message: 'Too many OTP requests, please try again after 1 minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** General rate limiter applied to all routes: 100 requests per 15 minutes per IP. */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
