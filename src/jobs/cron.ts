import cron from 'node-cron';
import mongoose from 'mongoose';
import { processAbandonedCarts } from '../utils/cartAbandonment';
import Order from '../models/Order';
import Variant from '../models/Variant';
import Product from '../models/Product';
import Coupon from '../models/Coupon';
import Wallet from '../models/Wallet';
import WalletTransaction from '../models/WalletTransaction';
import { safeAdd } from '../utils/helpers';

const PAYMENT_TIMEOUT_MINUTES = 30;

/**
 * Auto-cancels Razorpay orders that have been in Pending payment state for more than 30 minutes.
 * Restores stock, wallet, and coupon usage atomically.
 */
async function cancelStaleUnpaidOrders(): Promise<{ cancelled: number }> {
  const cutoff = new Date(Date.now() - PAYMENT_TIMEOUT_MINUTES * 60 * 1000);

  const staleOrders = await Order.find({
    paymentMethod: 'razorpay',
    paymentStatus: { $in: ['Pending', 'Failed'] },
    orderStatus: 'Placed',
    createdAt: { $lte: cutoff },
  });

  let cancelled = 0;

  for (const order of staleOrders) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Restore stock
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

      // Restore wallet
      if (order.walletAmountUsed > 0) {
        const wallet = await Wallet.findOneAndUpdate(
          { user: order.user },
          { $inc: { balance: order.walletAmountUsed } },
          { new: true, session }
        );
        if (wallet) {
          await WalletTransaction.create([{
            wallet: wallet._id,
            user: order.user,
            type: 'credit',
            amount: order.walletAmountUsed,
            description: `Refund for expired unpaid order ${order.orderId}`,
            reference: order.orderId,
          }], { session });
        }
      }

      // Cancel the order
      order.orderStatus = 'Cancelled';
      order.cancelReason = 'Payment not completed within 30 minutes';
      order.statusHistory.push({ status: 'Cancelled', timestamp: new Date(), note: 'Auto-cancelled: payment timeout' });
      await order.save({ session });

      await session.commitTransaction();
      cancelled++;
    } catch (error) {
      await session.abortTransaction();
      console.error(`[CRON] Failed to cancel stale order ${order.orderId}:`, error);
    } finally {
      session.endSession();
    }
  }

  return { cancelled };
}

/**
 * Registers all scheduled cron jobs.
 * Call this once during server startup.
 */
export const registerCronJobs = (): void => {
  // Run abandoned cart check every day at 10:00 AM IST
  cron.schedule('0 10 * * *', async () => {
    console.log('[CRON] Running abandoned cart processing...');
    try {
      const result = await processAbandonedCarts();
      console.log(`[CRON] Abandoned carts: ${result.flagged} flagged, ${result.emailed} emails sent`);
    } catch (error) {
      console.error('[CRON] Abandoned cart processing failed:', error);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  // Auto-cancel stale unpaid Razorpay orders every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await cancelStaleUnpaidOrders();
      if (result.cancelled > 0) {
        console.log(`[CRON] Auto-cancelled ${result.cancelled} unpaid order(s)`);
      }
    } catch (error) {
      console.error('[CRON] Stale order cancellation failed:', error);
    }
  });

  console.log('Cron jobs registered (abandoned carts: daily 10 AM IST, stale orders: every 5 min)');
};
