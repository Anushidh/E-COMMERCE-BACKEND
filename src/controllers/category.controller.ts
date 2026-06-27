import { Request, Response, NextFunction } from 'express';
import Category from '../models/Category';
import Product from '../models/Product';
import { AppError } from '../utils/AppError';
import { createCategorySchema, updateCategorySchema } from '../validators/category.validator';
import { invalidateCache } from '../middlewares/cache';

/** Creates a new category with an optional image upload. Prevents duplicate category names. */
export const createCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createCategorySchema.parse(req.body);
    const imageUrl = req.file ? (req.file as any).path : undefined;

    const existing = await Category.findOne({ name: data.name, isDeleted: false });
    if (existing) throw new AppError('Category already exists', 400);

    const category = await Category.create({ ...data, image: imageUrl });

    await invalidateCache('cache:/api/categories*');
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

/** Returns all active (non-deleted) categories sorted alphabetically by name. */
export const getAllCategories = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const categories = await Category.find({ isDeleted: false }).sort({ name: 1 });
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

/** Returns a single category by its ID. */
export const getCategoryById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const category = await Category.findOne({ _id: req.params.id, isDeleted: false });
    if (!category) throw new AppError('Category not found', 404);

    res.status(200).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

/** Updates a category's name, description, gender, or image. Invalidates cache. */
export const updateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateCategorySchema.parse(req.body);
    const updateData: any = { ...data };

    if (req.file) {
      updateData.image = (req.file as any).path;
    }

    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      updateData,
      { new: true }
    );
    if (!category) throw new AppError('Category not found', 404);

    await invalidateCache('cache:/api/categories*');
    res.status(200).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

/**
 * Soft-deletes a category. Blocks deletion if active (non-deleted) products
 * still exist under this category. Invalidates cache.
 */
export const deleteCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const category = await Category.findOne({ _id: req.params.id, isDeleted: false });
    if (!category) throw new AppError('Category not found', 404);

    const productCount = await Product.countDocuments({ category: category._id, isDeleted: false });
    if (productCount > 0) {
      throw new AppError(
        `Cannot delete category. ${productCount} active product(s) still belong to it. Reassign or delete them first.`,
        400
      );
    }

    category.isDeleted = true;
    await category.save();

    await invalidateCache('cache:/api/categories*');
    res.status(200).json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
};
