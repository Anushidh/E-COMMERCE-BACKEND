import { Request, Response, NextFunction } from 'express';
import ProductOffer from '../models/ProductOffer';
import CategoryOffer from '../models/CategoryOffer';
import { AppError } from '../utils/AppError';
import {
  createProductOfferSchema,
  createCategoryOfferSchema,
  updateProductOfferSchema,
  updateCategoryOfferSchema,
} from '../validators/offer.validator';

// ─── Product Offers ──────────────────────────────────────────────────────────

/** Admin creates a percentage or flat discount offer on a specific product. Prevents overlapping active offers. */
export const createProductOffer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createProductOfferSchema.parse(req.body);

    // Prevent overlapping active offers on same product
    const existingOffer = await ProductOffer.findOne({
      product: data.product,
      isDeleted: false,
      isActive: true,
      startDate: { $lte: new Date(data.endDate) },
      endDate: { $gte: new Date(data.startDate) },
    });
    if (existingOffer) {
      throw new AppError('An active offer already exists for this product in the given date range', 400);
    }

    const offer = await ProductOffer.create({
      ...data,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
    });

    res.status(201).json({ success: true, data: offer });
  } catch (error) {
    next(error);
  }
};

/** Returns all active (non-deleted) product offers with product name populated. */
export const getAllProductOffers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const offers = await ProductOffer.find({ isDeleted: false })
      .populate('product', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: offers });
  } catch (error) {
    next(error);
  }
};

/** Admin updates a product offer's discount, dates, or active status. */
export const updateProductOffer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateProductOfferSchema.parse(req.body);
    const updateData: any = { ...data };
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    const offer = await ProductOffer.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      updateData,
      { new: true }
    );
    if (!offer) throw new AppError('Product offer not found', 404);

    res.status(200).json({ success: true, data: offer });
  } catch (error) {
    next(error);
  }
};

/** Soft-deletes a product offer. */
export const deleteProductOffer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const offer = await ProductOffer.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );
    if (!offer) throw new AppError('Product offer not found', 404);

    res.status(200).json({ success: true, message: 'Product offer deleted' });
  } catch (error) {
    next(error);
  }
};

// ─── Category Offers ─────────────────────────────────────────────────────────

/** Admin creates a percentage or flat discount offer on an entire category. Prevents overlapping active offers. */
export const createCategoryOffer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createCategoryOfferSchema.parse(req.body);

    // Prevent overlapping active offers on same category
    const existingOffer = await CategoryOffer.findOne({
      category: data.category,
      isDeleted: false,
      isActive: true,
      startDate: { $lte: new Date(data.endDate) },
      endDate: { $gte: new Date(data.startDate) },
    });
    if (existingOffer) {
      throw new AppError('An active offer already exists for this category in the given date range', 400);
    }

    const offer = await CategoryOffer.create({
      ...data,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
    });

    res.status(201).json({ success: true, data: offer });
  } catch (error) {
    next(error);
  }
};

/** Returns all active (non-deleted) category offers with category name populated. */
export const getAllCategoryOffers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const offers = await CategoryOffer.find({ isDeleted: false })
      .populate('category', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: offers });
  } catch (error) {
    next(error);
  }
};

/** Admin updates a category offer's discount, dates, or active status. */
export const updateCategoryOffer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateCategoryOfferSchema.parse(req.body);
    const updateData: any = { ...data };
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    const offer = await CategoryOffer.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      updateData,
      { new: true }
    );
    if (!offer) throw new AppError('Category offer not found', 404);

    res.status(200).json({ success: true, data: offer });
  } catch (error) {
    next(error);
  }
};

/** Soft-deletes a category offer. */
export const deleteCategoryOffer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const offer = await CategoryOffer.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );
    if (!offer) throw new AppError('Category offer not found', 404);

    res.status(200).json({ success: true, message: 'Category offer deleted' });
  } catch (error) {
    next(error);
  }
};

// ─── Public Offers ───────────────────────────────────────────────────────────

/** Returns all active product and category offers for the public storefront. */
export const getActiveOffers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const now = new Date();

    const productOffers = await ProductOffer.find({
      isDeleted: false,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).populate('product', 'name slug');

    const categoryOffers = await CategoryOffer.find({
      isDeleted: false,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).populate('category', 'name slug');

    res.status(200).json({
      success: true,
      data: {
        productOffers,
        categoryOffers,
      },
    });
  } catch (error) {
    next(error);
  }
};
