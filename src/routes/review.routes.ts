import { Router } from 'express';
import { authenticate, adminOnly } from '../middlewares/auth';
import { createReview, getProductReviews, deleteReview } from '../controllers/review.controller';

const router = Router();

router.get('/product/:productId', getProductReviews);
router.post('/', authenticate, createReview);
router.delete('/:id', authenticate, adminOnly, deleteReview);

export default router;
