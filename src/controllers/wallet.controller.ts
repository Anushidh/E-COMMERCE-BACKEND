import { Request, Response, NextFunction } from 'express';
import Wallet from '../models/Wallet';
import WalletTransaction from '../models/WalletTransaction';
import { AppError } from '../utils/AppError';

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
