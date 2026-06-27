import { Router } from 'express';
import passport from '../config/passport';
import { authenticate } from '../middlewares/auth';
import { authRateLimiter, otpRateLimiter } from '../middlewares/rateLimiter';
import {
  signup,
  verifySignupOTP,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  resendOTP,
  googleCallback,
} from '../controllers/auth.controller';

const router = Router();

router.post('/signup', authRateLimiter, signup);
router.post('/verify-otp', authRateLimiter, verifySignupOTP);
router.post('/login', authRateLimiter, login);
router.post('/refresh-token', refreshToken);
router.post('/logout', authenticate, logout);
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password', authRateLimiter, resetPassword);
router.post('/resend-otp', otpRateLimiter, resendOTP);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  googleCallback
);

export default router;
