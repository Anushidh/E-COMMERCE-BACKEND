import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import Referral from '../models/Referral';
import { AppError } from '../utils/AppError';

/**
 * Returns the user's referral code, list of all referrals (with referee details),
 * and stats (total rewarded, pending, and overall count).
 */
export const getReferralInfo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId).select('referralCode');
    if (!user) throw new AppError('User not found', 404);

    const referrals = await Referral.find({ referrer: req.user!.userId })
      .populate('referee', 'name email')
      .sort({ createdAt: -1 });

    const totalRewarded = referrals.filter((r) => r.status === 'Rewarded').length;
    const totalPending = referrals.filter((r) => r.status === 'Pending').length;

    res.status(200).json({
      success: true,
      data: {
        referralCode: user.referralCode,
        referrals,
        stats: { totalRewarded, totalPending, totalReferrals: referrals.length },
      },
    });
  } catch (error) {
    next(error);
  }
};
