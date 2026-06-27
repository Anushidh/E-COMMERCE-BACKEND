import { Request, Response, NextFunction } from 'express';
import Coupon from '../models/Coupon';
import { AppError } from '../utils/AppError';
import { calculateCouponDiscount, safeSubtract } from '../utils/helpers';
import { createCouponSchema, updateCouponSchema } from '../validators/coupon.validator';

/** Admin creates a new coupon with code, discount rules, usage limits, and expiry date. */
export const createCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createCouponSchema.parse(req.body);

    const existing = await Coupon.findOne({ code: data.code.toUpperCase(), isDeleted: false });
    if (existing) throw new AppError('Coupon code already exists', 400);

    const coupon = await Coupon.create({
      ...data,
      code: data.code.toUpperCase(),
      expiryDate: new Date(data.expiryDate),
    });

    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

/** Returns all active (non-deleted) coupons sorted by newest first. */
export const getAllCoupons = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupons = await Coupon.find({ isDeleted: false }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: coupons });
  } catch (error) {
    next(error);
  }
};

/** Admin updates coupon fields (code, discount, limits, expiry). */
export const updateCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateCouponSchema.parse(req.body);
    const updateData: any = { ...data };
    if (data.expiryDate) updateData.expiryDate = new Date(data.expiryDate);
    if (data.code) updateData.code = data.code.toUpperCase();

    const coupon = await Coupon.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      updateData,
      { new: true }
    );
    if (!coupon) throw new AppError('Coupon not found', 404);

    res.status(200).json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

/** Soft-deletes a coupon by setting isDeleted to true. */
export const deleteCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupon = await Coupon.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );
    if (!coupon) throw new AppError('Coupon not found', 404);

    res.status(200).json({ success: true, message: 'Coupon deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * Validates and previews a coupon against an order total.
 * Checks: expiry, usage limits (global + per-user), min order value.
 * Returns the calculated discount and final amount without actually applying it.
 */
export const applyCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code, orderTotal } = req.body;
    if (!code || !orderTotal) throw new AppError('Coupon code and order total required', 400);

    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      isActive: true,
      isDeleted: false,
      expiryDate: { $gte: new Date() },
    });

    if (!coupon) throw new AppError('Invalid or expired coupon', 400);
    if (coupon.totalUsed >= coupon.totalUsageLimit) throw new AppError('Coupon usage limit reached', 400);

    const userUsage = coupon.usedBy.find((u) => u.user.toString() === req.user!.userId);
    if (userUsage && userUsage.count >= coupon.usageLimitPerUser) {
      throw new AppError('You have already used this coupon maximum times', 400);
    }

    if (orderTotal < coupon.minOrderValue) {
      throw new AppError(`Minimum order value is ₹${coupon.minOrderValue}`, 400);
    }

    const discount = calculateCouponDiscount(
      orderTotal,
      coupon.discountType,
      coupon.discountValue,
      coupon.maxDiscount
    );

    res.status(200).json({
      success: true,
      data: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discount,
        finalAmount: safeSubtract(orderTotal, discount),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns all currently active coupons visible to users.
 * Only shows non-expired, active, non-deleted coupons that still have usage remaining.
 */
export const getAvailableCoupons = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      isDeleted: false,
      expiryDate: { $gte: now },
      $expr: { $lt: ['$totalUsed', '$totalUsageLimit'] },
    }).select('code discountType discountValue minOrderValue maxDiscount expiryDate');

    res.status(200).json({ success: true, data: coupons });
  } catch (error) {
    next(error);
  }
};
