import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, isTokenBlacklisted } from '../utils/token';
import { AppError } from '../utils/AppError';
import User from '../models/User';
import Admin from '../models/Admin';

/**
 * Authentication middleware. Extracts and verifies the JWT access token from
 * the Authorization header, checks if it's been blacklisted, and confirms
 * the account exists and isn't blocked/deleted. Attaches decoded user info to req.user.
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Access token required', 401);
    }

    const token = authHeader.split(' ')[1];

    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new AppError('Token has been invalidated', 401);
    }

    const decoded = verifyAccessToken(token);

    // Verify account still exists and is valid based on role
    if (decoded.role === 'admin') {
      const admin = await Admin.findById(decoded.userId);
      if (!admin) {
        return next(new AppError('The user belonging to this token no longer exists.', 401));
      }
    } else {
      const user = await User.findById(decoded.userId).select('isBlocked isDeleted');
      if (!user || user.isDeleted) {
        throw new AppError('User not found', 401);
      }
      if (user.isBlocked) {
        throw new AppError('Your account has been blocked', 403);
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
};

/** Role guard: only allows users with role "admin" to proceed. */
export const adminOnly = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== 'admin') {
    return next(new AppError('Admin access required', 403));
  }
  next();
};

/** Role guard: only allows users with role "user" to proceed. */
export const userOnly = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== 'user') {
    return next(new AppError('User access required', 403));
  }
  next();
};
