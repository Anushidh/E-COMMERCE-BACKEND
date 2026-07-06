import { Router } from 'express';
import { authenticate, adminOnly } from '../middlewares/auth';
import {
  createProductOffer,
  getAllProductOffers,
  updateProductOffer,
  deleteProductOffer,
  createCategoryOffer,
  getAllCategoryOffers,
  updateCategoryOffer,
  deleteCategoryOffer,
  getActiveOffers,
} from '../controllers/offer.controller';

const router = Router();

// Public route for active offers
router.get('/active', getActiveOffers);

// Admin-only routes
router.use(authenticate, adminOnly);

// Product offers
router.post('/product', createProductOffer);
router.get('/product', getAllProductOffers);
router.put('/product/:id', updateProductOffer);
router.delete('/product/:id', deleteProductOffer);

// Category offers
router.post('/category', createCategoryOffer);
router.get('/category', getAllCategoryOffers);
router.put('/category/:id', updateCategoryOffer);
router.delete('/category/:id', deleteCategoryOffer);

export default router;
