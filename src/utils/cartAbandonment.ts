import Cart from '../models/Cart';
import { sendEmail } from './email';

const ABANDONMENT_THRESHOLD_HOURS = 24;

/**
 * Finds carts that have been inactive for more than 24 hours with items in them,
 * flags them as abandoned, and optionally sends reminder emails.
 * This function should be called periodically (e.g., via cron job or scheduled task).
 */
export const processAbandonedCarts = async (): Promise<{ flagged: number; emailed: number }> => {
  const cutoff = new Date(Date.now() - ABANDONMENT_THRESHOLD_HOURS * 60 * 60 * 1000);

  // Find carts with items that haven't been touched in 24+ hours and aren't already flagged
  const abandonedCarts = await Cart.find({
    isAbandoned: false,
    lastActivityAt: { $lte: cutoff },
    'items.0': { $exists: true }, // has at least one item
  }).populate('user', 'name email');

  let emailed = 0;

  for (const cart of abandonedCarts) {
    // Flag as abandoned
    cart.isAbandoned = true;
    await cart.save();

    // Use the already-populated user — no extra DB query needed
    const user = cart.user as any;
    if (user && user.email && !user.isBlocked && !user.isDeleted) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'You left items in your Wearhaus cart!',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Hey ${user.name}! 👋</h2>
              <p>You have ${cart.items.length} item(s) waiting in your Wearhaus cart.</p>
              <p>Complete your purchase before they sell out!</p>
              <p style="margin-top: 20px;">
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/cart"
                   style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                  Complete Your Order
                </a>
              </p>
              <p style="color: #666; margin-top: 20px; font-size: 12px;">
                If you've already completed your purchase, please ignore this email.
              </p>
            </div>
          `,
        });
        emailed++;
      } catch (err) {
        console.error(`Failed to send cart reminder to ${user.email}:`, err);
      }
    }
  }

  return { flagged: abandonedCarts.length, emailed };
};

/**
 * Admin endpoint handler to get abandoned cart stats.
 */
export const getAbandonedCartStats = async () => {
  const totalAbandoned = await Cart.countDocuments({
    isAbandoned: true,
    'items.0': { $exists: true },
  });

  const abandonedCarts = await Cart.find({
    isAbandoned: true,
    'items.0': { $exists: true },
  })
    .populate('user', 'name email')
    .sort({ lastActivityAt: -1 })
    .limit(50);

  const totalValue = abandonedCarts.reduce((sum, cart) => sum + cart.totalAmount, 0);

  return { totalAbandoned, totalValue, carts: abandonedCarts };
};
