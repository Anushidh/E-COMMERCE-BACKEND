import http from 'http';
import app from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import { redis } from './config/redis';
import { registerCronJobs } from './jobs/cron';
import { seedAdmin } from './scripts/seedAdmin';
import './config/passport'; // Initialize Passport strategies

const startServer = async (): Promise<void> => {
  try {
    await connectDB();
    await seedAdmin();

    const server = http.createServer(app);

    server.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
      registerCronJobs();
    });

    // ─── Graceful Shutdown ─────────────────────────────────────────────────

    const shutdown = (signal: string) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(async () => {
        console.log('HTTP server closed.');

        try {
          // Close Redis connection
          await redis.quit();
          console.log('Redis connection closed.');

          // Close MongoDB connection
          const mongoose = await import('mongoose');
          await mongoose.default.connection.close();
          console.log('MongoDB connection closed.');

          console.log('Graceful shutdown complete.');
          process.exit(0);
        } catch (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
      });

      // Force shutdown if graceful shutdown takes too long (30 seconds)
      setTimeout(() => {
        console.error('Forced shutdown — graceful shutdown timed out.');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
