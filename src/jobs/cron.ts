import cron from 'node-cron';
import { processAbandonedCarts } from '../utils/cartAbandonment';

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

  console.log('Cron jobs registered (abandoned cart check: daily at 10:00 AM IST)');
};
