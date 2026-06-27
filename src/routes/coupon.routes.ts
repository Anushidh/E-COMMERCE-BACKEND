import { Router } from 'express';
import { authenticate, adminOnly } from '../middlewares/auth';
import {
  createCoupon,
  getAllCoupons,
  updateCoupon,
  deleteCoupon,
  applyCoupon,
  getAvailableCoupons,
} from '../controllers/coupon.controller';

const router = Router();

// User
router.get('/available', authenticate, getAvailableCoupons);
router.post('/apply', authenticate, applyCoupon);

// Admin
router.post('/', authenticate, adminOnly, createCoupon);
router.get('/', authenticate, adminOnly, getAllCoupons);
router.put('/:id', authenticate, adminOnly, updateCoupon);
router.delete('/:id', authenticate, adminOnly, deleteCoupon);

export default router;
