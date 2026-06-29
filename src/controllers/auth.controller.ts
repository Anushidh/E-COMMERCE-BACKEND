import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import User from '../models/User';
import OTPRecord from '../models/OTPRecord';
import Wallet from '../models/Wallet';
import Referral from '../models/Referral';
import { AppError } from '../utils/AppError';
import { generateOTP } from '../utils/helpers';
import { sendOTPEmail } from '../utils/email';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAndRotateRefreshToken,
  blacklistToken,
  isTokenBlacklisted,
  invalidateRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from '../utils/token';
import {
  signupSchema,
  loginSchema,
  verifyOTPSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendOTPSchema,
} from '../validators/auth.validator';
import { env } from '../config/env';

const OTP_EXPIRY = 5 * 60; // 5 minutes in seconds
const OTP_COOLDOWN = 60; // 1 minute cooldown between resends

/**
 * Initiates user signup by validating input, generating an OTP,
 * storing signup data temporarily in Redis, and sending the OTP via email.
 * The user is NOT created until the OTP is verified.
 */
export const signup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = signupSchema.parse(req.body);

    const existingUser = await User.findOne({ email: data.email, isDeleted: false });
    if (existingUser) {
      throw new AppError('Email already registered', 400);
    }

    // Store signup data in Redis temporarily
    const otp = generateOTP();
    await redis.setex(
      `signup:${data.email}`,
      OTP_EXPIRY,
      JSON.stringify({ ...data, otp })
    );

    // Store OTP record in DB for cooldown tracking
    await OTPRecord.findOneAndUpdate(
      { email: data.email, type: 'signup' },
      { otp, expiresAt: new Date(Date.now() + OTP_EXPIRY * 1000), lastSentAt: new Date() },
      { upsert: true, new: true }
    );

    await sendOTPEmail(data.email, otp, 'signup');

    res.status(200).json({
      success: true,
      message: 'OTP sent to your email. Please verify to complete signup.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verifies the OTP sent during signup. On success:
 * - Creates the user account (verified)
 * - Creates a wallet for the user
 * - Records referral if a referral code was provided
 * - Returns JWT access + refresh tokens
 */
export const verifySignupOTP = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, otp } = verifyOTPSchema.parse(req.body);

    const signupData = await redis.get(`signup:${email}`);
    if (!signupData) {
      throw new AppError('OTP expired or invalid. Please signup again.', 400);
    }

    const parsed = JSON.parse(signupData);
    if (parsed.otp !== otp) {
      throw new AppError('Invalid OTP', 400);
    }

    // Create user
    const user = await User.create({
      name: parsed.name,
      email: parsed.email,
      password: parsed.password,
      phone: parsed.phone,
      isVerified: true,
      referredBy: parsed.referralCode,
    });

    // Create wallet for new user
    await Wallet.create({ user: user._id });

    // Handle referral — create pending referral record
    if (parsed.referralCode) {
      const referrer = await User.findOne({ referralCode: parsed.referralCode, isDeleted: false });
      if (referrer) {
        await Referral.create({
          referrer: referrer._id,
          referee: user._id,
          status: 'Pending',
          rewardAmount: env.REFERRAL_REWARD_AMOUNT,
        });
      }
    }

    // Cleanup temporary Redis/OTP data
    await redis.del(`signup:${email}`);
    await OTPRecord.deleteOne({ email, type: 'signup' });

    const accessToken = generateAccessToken({ userId: user._id.toString(), role: 'user' });
    const refreshToken = await generateRefreshToken({ userId: user._id.toString(), role: 'user' });

    setRefreshTokenCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: 'user' },
        accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Authenticates a user with email + password.
 * Checks: account exists, not blocked, email verified, password matches.
 * Returns JWT access + refresh tokens on success.
 */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await User.findOne({ email, isDeleted: false }).select('+password');
    if (!user || !user.password) {
      throw new AppError('Invalid email or password', 401);
    }

    if (user.isBlocked) {
      throw new AppError('Your account has been blocked', 403);
    }

    if (!user.isVerified) {
      throw new AppError('Please verify your email first', 403);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    const accessToken = generateAccessToken({ userId: user._id.toString(), role: 'user' });
    const refreshToken = await generateRefreshToken({ userId: user._id.toString(), role: 'user' });

    setRefreshTokenCookie(res, refreshToken);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: 'user' },
        accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Issues a new access token using a valid refresh token.
 * Checks if the user/admin is still active (not blocked/deleted) before issuing.
 */
export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      throw new AppError('Refresh token required', 400);
    }

    // Verify and rotate — old token is invalidated, new one issued
    const { payload, newRefreshToken } = await verifyAndRotateRefreshToken(token);

    // Verify account still exists and is active
    if (payload.role === 'admin') {
      const { default: Admin } = await import('../models/Admin');
      const admin = await Admin.findById(payload.userId).select('isDeleted');
      if (!admin || admin.isDeleted) throw new AppError('Account not found', 401);
    } else {
      const user = await User.findById(payload.userId).select('isBlocked isDeleted');
      if (!user || user.isDeleted) throw new AppError('Account not found', 401);
      if (user.isBlocked) throw new AppError('Your account has been blocked', 403);
    }

    const accessToken = generateAccessToken({ userId: payload.userId, role: payload.role });

    setRefreshTokenCookie(res, newRefreshToken);

    res.status(200).json({
      success: true,
      data: { accessToken },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logs out the user by blacklisting the access token and invalidating the refresh token.
 */
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      await blacklistToken(token, 15 * 60); // access token lifetime
    }

    // Invalidate refresh token from cookie
    const rToken = req.cookies?.refreshToken;
    if (rToken) {
      await invalidateRefreshToken(rToken);
    }

    clearRefreshTokenCookie(res);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initiates the forgot-password flow by generating an OTP and emailing it.
 * Does not reveal whether the email exists (security best practice).
 */
export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);

    const user = await User.findOne({ email, isDeleted: false });
    if (!user) {
      // Don't reveal if email exists
      res.status(200).json({
        success: true,
        message: 'If the email exists, an OTP has been sent.',
      });
      return;
    }

    const otp = generateOTP();
    await redis.setex(`forgot:${email}`, OTP_EXPIRY, otp);

    await OTPRecord.findOneAndUpdate(
      { email, type: 'forgot_password' },
      { otp, expiresAt: new Date(Date.now() + OTP_EXPIRY * 1000), lastSentAt: new Date() },
      { upsert: true, new: true }
    );

    await sendOTPEmail(email, otp, 'forgot_password');

    res.status(200).json({
      success: true,
      message: 'If the email exists, an OTP has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resets user password after verifying the OTP from the forgot-password flow.
 * Clears the OTP from Redis and DB after successful reset.
 */
export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, otp, newPassword } = resetPasswordSchema.parse(req.body);

    const storedOTP = await redis.get(`forgot:${email}`);
    if (!storedOTP || storedOTP !== otp) {
      throw new AppError('Invalid or expired OTP', 400);
    }

    const user = await User.findOne({ email, isDeleted: false }).select('+password');
    if (!user) {
      throw new AppError('User not found', 404);
    }

    user.password = newPassword;
    await user.save();

    await redis.del(`forgot:${email}`);
    await OTPRecord.deleteOne({ email, type: 'forgot_password' });

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resends OTP for either signup verification or forgot-password flow.
 * Enforces a cooldown period (60s) between consecutive requests.
 */
export const resendOTP = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, type } = resendOTPSchema.parse(req.body);

    // Check cooldown
    const lastRecord = await OTPRecord.findOne({ email, type });
    if (lastRecord) {
      const timeSinceLastSend = (Date.now() - lastRecord.lastSentAt.getTime()) / 1000;
      if (timeSinceLastSend < OTP_COOLDOWN) {
        throw new AppError(
          `Please wait ${Math.ceil(OTP_COOLDOWN - timeSinceLastSend)} seconds before requesting another OTP`,
          429
        );
      }
    }

    const otp = generateOTP();

    if (type === 'signup') {
      const signupData = await redis.get(`signup:${email}`);
      if (!signupData) {
        throw new AppError('No pending signup found. Please signup again.', 400);
      }
      const parsed = JSON.parse(signupData);
      parsed.otp = otp;
      await redis.setex(`signup:${email}`, OTP_EXPIRY, JSON.stringify(parsed));
    } else {
      await redis.setex(`forgot:${email}`, OTP_EXPIRY, otp);
    }

    await OTPRecord.findOneAndUpdate(
      { email, type },
      { otp, expiresAt: new Date(Date.now() + OTP_EXPIRY * 1000), lastSentAt: new Date() },
      { upsert: true, new: true }
    );

    await sendOTPEmail(email, otp, type);

    res.status(200).json({
      success: true,
      message: 'OTP resent successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handles the Google OAuth callback after successful authentication.
 * Creates wallet if first time, generates JWT tokens, and redirects
 * to the frontend with tokens as query params.
 */
export const googleCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const passportUser = req.user;
    if (!passportUser) {
      throw new AppError('Authentication failed', 401);
    }

    // Create wallet if not exists
    await Wallet.findOneAndUpdate(
      { user: passportUser.userId },
      { user: passportUser.userId },
      { upsert: true }
    );

    const accessToken = generateAccessToken({ userId: passportUser.userId, role: passportUser.role });
    const refreshToken = await generateRefreshToken({ userId: passportUser.userId, role: passportUser.role });

    setRefreshTokenCookie(res, refreshToken);

    // Redirect to frontend with access token only
    res.redirect(
      `${env.CLIENT_URL}/auth/callback?accessToken=${accessToken}`
    );
  } catch (error) {
    next(error);
  }
};
