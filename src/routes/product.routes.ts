import { Router } from 'express';
import { authenticate, adminOnly } from '../middlewares/auth';
import { upload } from '../config/multer';
import { cache } from '../middlewares/cache';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProductById,
  getProducts,
  addVariant,
  updateVariant,
  deleteVariant,
  getProductVariants,
  removeProductImage,
  adjustStock,
  trackProductView,
  getRecentlyViewed,
} from '../controllers/product.controller';

const router = Router();

// Public (cached for performance)
router.get('/', cache(30), getProducts);
router.get('/:id', cache(60), getProductById);
router.get('/:productId/variants', cache(60), getProductVariants);

// Authenticated user — recently viewed
router.post('/:productId/view', authenticate, trackProductView);
router.get('/user/recently-viewed', authenticate, getRecentlyViewed);

// Admin only
router.post('/', authenticate, adminOnly, upload.array('productImages', 10), createProduct);
router.put('/:id', authenticate, adminOnly, upload.array('productImages', 10), updateProduct);
router.delete('/:id', authenticate, adminOnly, deleteProduct);
router.patch('/:id/remove-image', authenticate, adminOnly, removeProductImage);

// Variants (Admin)
router.post('/:productId/variants', authenticate, adminOnly, addVariant);
router.put('/variants/:variantId', authenticate, adminOnly, updateVariant);
router.delete('/variants/:variantId', authenticate, adminOnly, deleteVariant);
router.patch('/variants/:variantId/stock', authenticate, adminOnly, adjustStock);

export default router;
