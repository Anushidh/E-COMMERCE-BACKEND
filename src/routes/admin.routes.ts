import { Router } from 'express';
import { authenticate, adminOnly } from '../middlewares/auth';
import { authRateLimiter } from '../middlewares/rateLimiter';
import {
  adminLogin,
  adminLogout,
  getAllUsers,
  getUserDetail,
  blockUser,
  unblockUser,
  getAllOrders,
  updateOrderStatus,
  handleReturn,
  getDashboardStats,
  getLowStockProducts,
  getAbandonedCarts,
  triggerCartAbandonmentCheck,
} from '../controllers/admin.controller';

const router = Router();

// Public admin routes (no auth required)
router.post('/login', authRateLimiter, adminLogin);

// Protected admin routes
router.use(authenticate, adminOnly);

// Admin logout
router.post('/logout', adminLogout);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Users
router.get('/users', getAllUsers);
router.get('/users/:id', getUserDetail);
router.patch('/users/:id/block', blockUser);
router.patch('/users/:id/unblock', unblockUser);

// Orders
router.get('/orders', getAllOrders);
router.patch('/orders/:id/status', updateOrderStatus);
router.patch('/orders/:id/return', handleReturn);

// Inventory
router.get('/inventory/low-stock', getLowStockProducts);

// Cart abandonment
router.get('/carts/abandoned', getAbandonedCarts);
router.post('/carts/abandoned/process', triggerCartAbandonmentCheck);

export default router;
