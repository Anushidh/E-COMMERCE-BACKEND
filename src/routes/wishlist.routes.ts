import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  moveToCart,
} from '../controllers/wishlist.controller';

const router = Router();

router.use(authenticate);

router.get('/', getWishlist);
router.post('/', addToWishlist);
router.delete('/:productId', removeFromWishlist);
router.post('/move-to-cart', moveToCart);

export default router;
