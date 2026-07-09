import Admin from '../models/Admin';
import { env } from '../config/env';

/**
 * Seeds the first admin account if none exists.
 * Runs silently on every server startup — skips if admin already exists.
 */
export const seedAdmin = async (): Promise<void> => {
  try {
    const existing = await Admin.findOne({ email: env.ADMIN_EMAIL });
    if (!existing) {
      await Admin.create({
        name: env.ADMIN_NAME,
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
      });
      console.log(`Admin seeded: ${env.ADMIN_EMAIL}`);
    }
  } catch (err) {
    console.error('Admin seed failed:', err);
  }
};
