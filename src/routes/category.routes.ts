import { Router } from 'express';
import { authenticate, adminOnly } from '../middlewares/auth';
import { upload } from '../config/multer';
import { cache } from '../middlewares/cache';
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';

const router = Router();

// Public (cached)
router.get('/', cache(60), getAllCategories);
router.get('/:id', cache(60), getCategoryById);

// Admin only
router.post('/', authenticate, adminOnly, upload.single('categoryImage'), createCategory);
router.put('/:id', authenticate, adminOnly, upload.single('categoryImage'), updateCategory);
router.delete('/:id', authenticate, adminOnly, deleteCategory);

export default router;
