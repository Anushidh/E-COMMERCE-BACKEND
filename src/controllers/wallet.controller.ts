import { Request, Response, NextFunction } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Wallet from '../models/Wallet';
import WalletTransaction from '../models/WalletTransaction';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import { z } from 'zod';

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

const addMoneySchema = z.object({
  amount: z.number().min(10, 'Minimum top-up is ₹10').max(50000, 'Maximum top-up is ₹50,000'),
});

/** Returns the authenticated user's wallet balance. Creates a wallet if none exists. */
export const getWallet = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let wallet = await Wallet.findOne({ user: req.user!.userId });
    if (!wallet) {
      wallet = await Wallet.create({ user: req.user!.userId });
    }

    res.status(200).json({ success: true, data: wallet });
  } catch (error) {
    next(error);
  }
};

/** Returns paginated wallet transaction history (credits and debits) for the user. */
export const getWalletTransactions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      WalletTransaction.find({ user: req.user!.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WalletTransaction.countDocuments({ user: req.user!.userId }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    next(error);
  }
};

/** Creates a Razorpay order for wallet top-up. */
export const addMoney = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { amount } = addMoneySchema.parse(req.body);

    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency: 'INR',
      receipt: `wlt_${Date.now()}`,
    });

    res.status(200).json({
      success: true,
      data: {
        razorpayOrder: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
        },
        amount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** Verifies Razorpay payment and credits wallet. */
export const verifyTopup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
      throw new AppError('Missing payment details', 400);
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      throw new AppError('Payment verification failed', 400);
    }

    // Credit wallet
    const wallet = await Wallet.findOneAndUpdate(
      { user: req.user!.userId },
      { $inc: { balance: Number(amount) } },
      { new: true, upsert: true }
    );

    // Record transaction
    await WalletTransaction.create({
      wallet: wallet._id,
      user: req.user!.userId,
      type: 'credit',
      amount: Number(amount),
      description: 'Wallet top-up via Razorpay',
      reference: razorpay_payment_id,
    });

    res.status(200).json({
      success: true,
      message: `₹${amount} added to wallet successfully`,
      data: { balance: wallet.balance },
    });
  } catch (error) {
    next(error);
  }
};
