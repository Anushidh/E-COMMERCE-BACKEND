import { Router } from 'express';
import { authenticate, userOnly } from '../middlewares/auth';
import {
  placeOrder,
  verifyPayment,
  retryPayment,
  razorpayWebhook,
  getUserOrders,
  getOrderById,
  cancelOrder,
  requestReturn,
  getOrderInvoice,
} from '../controllers/order.controller';

const router = Router();

// Razorpay webhook (no auth)
router.post('/webhook/razorpay', razorpayWebhook as any);

router.use(authenticate, userOnly);

router.post('/', placeOrder);
router.post('/verify-payment', verifyPayment);
router.post('/:id/retry-payment', retryPayment);
router.get('/', getUserOrders);
router.get('/:id', getOrderById);
router.get('/:id/invoice', getOrderInvoice);
router.post('/:id/cancel', cancelOrder);
router.post('/:id/return', requestReturn);

export default router;
