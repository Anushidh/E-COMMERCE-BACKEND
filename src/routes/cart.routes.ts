import { Router } from 'express';
import { authenticate, userOnly } from '../middlewares/auth';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} from '../controllers/cart.controller';

const router = Router();

router.use(authenticate);
router.use(userOnly);

router.get('/', getCart);
router.post('/', addToCart);
router.put('/items/:itemId', updateCartItem);
router.delete('/items/:itemId', removeCartItem);
router.delete('/', clearCart);

export default router;
