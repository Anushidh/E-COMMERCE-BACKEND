import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import Admin from '../models/Admin';
import Order from '../models/Order';
import Product from '../models/Product';
import Category from '../models/Category';
import Coupon from '../models/Coupon';
import Variant from '../models/Variant';
import Wallet from '../models/Wallet';
import WalletTransaction from '../models/WalletTransaction';
import Referral from '../models/Referral';
import { AppError } from '../utils/AppError';
import { generateAccessToken, generateRefreshToken, blacklistToken, invalidateRefreshToken } from '../utils/token';
import { loginSchema } from '../validators/auth.validator';
import { updateOrderStatusSchema } from '../validators/order.validator';
import { sendOrderStatusEmail, sendRefundEmail } from '../utils/email';
import { safeAdd } from '../utils/helpers';
import { env } from '../config/env';
import { z } from 'zod';

const handleReturnSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

// ─── Admin Auth ──────────────────────────────────────────────────────────────

/**
 * Authenticates an admin with email + password.
 * Uses the separate Admin collection (no OAuth, no OTP, no referrals).
 * Returns JWT access + refresh tokens on success.
 */
export const adminLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const admin = await Admin.findOne({ email, isDeleted: false }).select('+password');
    if (!admin) {
      throw new AppError('Invalid email or password', 401);
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    const accessToken = generateAccessToken({ userId: admin._id.toString(), role: 'admin' });
    const refreshToken = await generateRefreshToken({ userId: admin._id.toString(), role: 'admin' });

    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: {
        admin: { id: admin._id, name: admin.name, email: admin.email },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logs out the admin by blacklisting their current access token in Redis.
 * The token remains blacklisted for its remaining lifetime (15 min).
 */
export const adminLogout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      await blacklistToken(token, 15 * 60);
    }

    // Invalidate refresh token if provided
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      await invalidateRefreshToken(refreshToken);
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ─── User Management ─────────────────────────────────────────────────────────

/** Returns a paginated list of all users with optional name/email search. */
export const getAllUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);
    const skip = (page - 1) * limit;
    const search = req.query.search as string;

    const query: any = { isDeleted: false };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query).select('-password').skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: { users, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } },
    });
  } catch (error) {
    next(error);
  }
};

/** Blocks a user account, preventing them from logging in or placing orders. */
export const blockUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isBlocked: true },
      { new: true }
    );
    if (!user) throw new AppError('User not found', 404);
    res.status(200).json({ success: true, message: 'User blocked' });
  } catch (error) {
    next(error);
  }
};

/** Unblocks a previously blocked user account. */
export const unblockUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isBlocked: false },
      { new: true }
    );
    if (!user) throw new AppError('User not found', 404);
    res.status(200).json({ success: true, message: 'User unblocked' });
  } catch (error) {
    next(error);
  }
};

// ─── Order Management (Admin) ────────────────────────────────────────────────

/** Returns paginated list of all orders with optional status filter. */
export const getAllOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);
    const skip = (page - 1) * limit;
    const status = req.query.status as string;

    const query: any = {};
    if (status) query.orderStatus = status;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: { orders, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates an order's status (Confirmed → Shipped → Delivered, etc.).
 * On "Delivered": marks COD as Paid, processes pending referral reward atomically.
 */
export const updateOrderStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = updateOrderStatusSchema.parse(req.body);
    const order = await Order.findById(req.params.id);
    if (!order) throw new AppError('Order not found', 404);

    // Enforce valid state transitions
    const validTransitions: Record<string, string[]> = {
      'Placed': ['Confirmed', 'Cancelled'],
      'Confirmed': ['Shipped', 'Cancelled'],
      'Shipped': ['Out for Delivery'],
      'Out for Delivery': ['Delivered'],
      'Delivered': [],
      'Cancelled': [],
      'Return Requested': ['Returned'],
      'Returned': [],
    };

    const allowedNext = validTransitions[order.orderStatus] || [];
    if (!allowedNext.includes(status)) {
      throw new AppError(
        `Cannot transition from "${order.orderStatus}" to "${status}". Allowed: ${allowedNext.join(', ') || 'none'}`,
        400
      );
    }

    order.orderStatus = status;
    order.statusHistory.push({ status, timestamp: new Date() });
    if (status === 'Delivered') {
      order.deliveredAt = new Date();
      if (order.paymentMethod === 'cod') {
        order.paymentStatus = 'Paid';
      }

      // Atomically process referral reward (prevents double-reward race)
      const user = await User.findById(order.user);
      if (user?.referredBy) {
        const referral = await Referral.findOneAndUpdate(
          { referee: user._id, status: 'Pending' },
          { status: 'Rewarded' },
          { new: true }
        );

        if (referral) {
          // Credit the referrer's wallet atomically
          const referrerWallet = await Wallet.findOneAndUpdate(
            { user: referral.referrer },
            { $inc: { balance: referral.rewardAmount } },
            { new: true, upsert: true }
          );

          await WalletTransaction.create({
            wallet: referrerWallet._id,
            user: referral.referrer,
            type: 'credit',
            amount: referral.rewardAmount,
            description: `Referral reward for ${user.name}`,
            reference: `REF-${user._id}`,
          });
        }
      }
    }

    await order.save();

    // Notify user via email
    const orderUser = await User.findById(order.user);
    if (orderUser) {
      await sendOrderStatusEmail(orderUser.email, order.orderId, status);
    }

    res.status(200).json({ success: true, message: `Order status updated to ${status}` });
  } catch (error) {
    next(error);
  }
};

/**
 * Handles a return request: approve (refund to wallet + restore stock + restore coupon)
 * or reject. Uses a transaction for data consistency.
 */
export const handleReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { action } = handleReturnSchema.parse(req.body);
    const order = await Order.findById(req.params.id).session(session);
    if (!order) throw new AppError('Order not found', 404);

    if (order.orderStatus !== 'Return Requested') {
      throw new AppError('No return request for this order', 400);
    }

    if (action === 'approve') {
      order.orderStatus = 'Returned';
      order.statusHistory.push({ status: 'Returned', timestamp: new Date(), note: 'Return approved by admin' });
      order.paymentStatus = 'Refunded';

      // Restore stock and decrement totalSold
      for (const item of order.items) {
        await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } }, { session });
        await Product.findByIdAndUpdate(item.product, { $inc: { totalSold: -item.quantity } }, { session });
      }

      // Restore coupon usage
      if (order.couponCode) {
        await Coupon.findOneAndUpdate(
          { code: order.couponCode, isDeleted: false },
          { $inc: { totalUsed: -1 } },
          { session }
        );
        await Coupon.findOneAndUpdate(
          { code: order.couponCode, 'usedBy.user': order.user },
          { $inc: { 'usedBy.$.count': -1 } },
          { session }
        );
      }

      // Refund full amount to wallet atomically
      const refundAmount = safeAdd(order.totalAmount, order.walletAmountUsed);
      const wallet = await Wallet.findOneAndUpdate(
        { user: order.user },
        { $inc: { balance: refundAmount } },
        { new: true, upsert: true, session }
      );

      await WalletTransaction.create([{
        wallet: wallet._id,
        user: order.user,
        type: 'credit',
        amount: refundAmount,
        description: `Refund for returned order ${order.orderId}`,
        reference: order.orderId,
      }], { session });

      await order.save({ session });
      await session.commitTransaction();

      // Email outside transaction
      const user = await User.findById(order.user);
      if (user) await sendRefundEmail(user.email, order.orderId, refundAmount);
    } else {
      // Reject — revert status
      order.orderStatus = 'Delivered';
      await order.save({ session });
      await session.commitTransaction();
    }

    res.status(200).json({ success: true, message: `Return ${action}d` });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// ─── Dashboard Analytics ─────────────────────────────────────────────────────

/**
 * Returns comprehensive admin dashboard data including revenue, top products,
 * top categories, new users, coupon stats, and monthly revenue chart.
 */
export const getDashboardStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisYear = new Date(now.getFullYear(), 0, 1);

    const [dailyRevenue, weeklyRevenue, monthlyRevenue, yearlyRevenue] = await Promise.all([
      Order.aggregate([
        { $match: { createdAt: { $gte: today }, paymentStatus: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: thisWeek }, paymentStatus: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: thisMonth }, paymentStatus: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: thisYear }, paymentStatus: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
    ]);

    const ordersByStatus = await Order.aggregate([
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
    ]);

    const topProducts = await Product.find({ isDeleted: false })
      .sort({ totalSold: -1 })
      .limit(10)
      .select('name totalSold basePrice images');

    const topCategories = await Order.aggregate([
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: '$category' },
      {
        $group: {
          _id: '$category._id',
          name: { $first: '$category.name' },
          totalSold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.finalPrice' },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
    ]);

    // New users over last 30 days (User collection has no role field — all entries are customers)
    const newUsers = await User.aggregate([
      { $match: { createdAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }, isDeleted: false } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const topCoupons = await Coupon.find({ isDeleted: false })
      .sort({ totalUsed: -1 })
      .limit(5)
      .select('code discountType discountValue totalUsed');

    const revenueChart = await Order.aggregate([
      { $match: { paymentStatus: 'Paid', createdAt: { $gte: thisYear } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const [totalUsers, totalProducts, totalOrders] = await Promise.all([
      User.countDocuments({ isDeleted: false }),
      Product.countDocuments({ isDeleted: false }),
      Order.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        revenue: {
          daily: dailyRevenue[0]?.total || 0,
          weekly: weeklyRevenue[0]?.total || 0,
          monthly: monthlyRevenue[0]?.total || 0,
          yearly: yearlyRevenue[0]?.total || 0,
        },
        ordersByStatus,
        topProducts,
        topCategories,
        newUsers,
        topCoupons,
        revenueChart,
        totals: { users: totalUsers, products: totalProducts, orders: totalOrders },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Inventory ───────────────────────────────────────────────────────────────

/** Returns all variants with stock at or below the configured low-stock threshold. */
export const getLowStockProducts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const variants = await Variant.find({
      isDeleted: false,
      stock: { $lte: env.LOW_STOCK_THRESHOLD },
    })
      .populate('product', 'name images')
      .sort({ stock: 1 });

    res.status(200).json({ success: true, data: variants });
  } catch (error) {
    next(error);
  }
};

// ─── Cart Abandonment ────────────────────────────────────────────────────────

import { processAbandonedCarts, getAbandonedCartStats } from '../utils/cartAbandonment';

/** Returns stats on abandoned carts (count, total value, recent list). */
export const getAbandonedCarts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = await getAbandonedCartStats();
    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually triggers abandoned cart processing — flags inactive carts (24h+)
 * and sends reminder emails to their owners.
 */
export const triggerCartAbandonmentCheck = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await processAbandonedCarts();
    res.status(200).json({
      success: true,
      message: `Processed abandoned carts: ${result.flagged} flagged, ${result.emailed} emails sent`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
