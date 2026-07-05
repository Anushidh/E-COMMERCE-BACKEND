import { Request, Response, NextFunction } from 'express';
import Product from '../models/Product';
import Variant from '../models/Variant';
import ProductOffer from '../models/ProductOffer';
import CategoryOffer from '../models/CategoryOffer';
import RecentlyViewed from '../models/RecentlyViewed';
import cloudinary from '../config/cloudinary';
import { AppError } from '../utils/AppError';
import {
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  productFilterSchema,
} from '../validators/product.validator';
import { paginationHelper, calculateDiscount, safeSubtract } from '../utils/helpers';
import { env } from '../config/env';
import { z } from 'zod';
import { invalidateCache } from '../middlewares/cache';

/**
 * Extracts the Cloudinary public_id from a full URL for deletion.
 * Example: https://res.cloudinary.com/.../ecommerce/products/abc123.jpg → ecommerce/products/abc123
 */
const getCloudinaryPublicId = (url: string): string | null => {
  try {
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;
    const pathWithExtension = parts[1].replace(/^v\d+\//, ''); // Remove version
    return pathWithExtension.replace(/\.[^.]+$/, ''); // Remove extension
  } catch {
    return null;
  }
};

/** Deletes an image from Cloudinary by its URL. Non-blocking — logs errors silently. */
const deleteFromCloudinary = async (imageUrl: string): Promise<void> => {
  const publicId = getCloudinaryPublicId(imageUrl);
  if (publicId) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.error(`Failed to delete from Cloudinary: ${publicId}`, err);
    }
  }
};

/** Creates a new product with image uploads via Cloudinary. */
export const createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createProductSchema.parse(req.body);
    const images = req.files
      ? (req.files as Express.Multer.File[]).map((f: any) => f.path)
      : [];

    const product = await Product.create({ ...data, images });

    await invalidateCache('cache:/api/products*');
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

/** Updates product fields and optionally appends new uploaded images. */
export const updateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateProductSchema.parse(req.body);
    const updateData: any = { ...data };

    if (req.files && (req.files as Express.Multer.File[]).length > 0) {
      const newImages = (req.files as Express.Multer.File[]).map((f: any) => f.path);
      updateData.$push = { images: { $each: newImages } };
      delete updateData.images;
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      updateData,
      { new: true }
    );
    if (!product) throw new AppError('Product not found', 404);

    await invalidateCache('cache:/api/products*');

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

/** Soft-deletes a product and all its associated variants. Cleans up images from Cloudinary. */
export const deleteProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );
    if (!product) throw new AppError('Product not found', 404);

    // Soft delete variants too
    await Variant.updateMany({ product: product._id }, { isDeleted: true });

    // Delete images from Cloudinary (non-blocking, fire and forget)
    for (const imageUrl of product.images) {
      deleteFromCloudinary(imageUrl).catch(() => {});
    }

    await invalidateCache('cache:/api/products*');
    res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns a product by ID with its variants, best applicable offer,
 * discounted price, and related products from the same category.
 */
export const getProductById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Support lookup by either ObjectId or slug
    const identifier = req.params.id as string;
    const query: any = { isDeleted: false };
    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      query._id = identifier;
    } else {
      query.slug = identifier;
    }

    const product = await Product.findOne(query)
      .populate('category', 'name');

    if (!product) throw new AppError('Product not found', 404);

    const variants = await Variant.find({ product: product._id, isDeleted: false });

    // Get applicable offers — sort by discountValue descending to get the best one
    const now = new Date();
    const productOffer = await ProductOffer.findOne({
      product: product._id,
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).sort({ discountValue: -1 });

    const categoryOffer = await CategoryOffer.findOne({
      category: product.category,
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).sort({ discountValue: -1 });

    // Calculate best offer
    let bestDiscount = 0;
    let appliedOffer: any = null;

    if (productOffer) {
      const discount = calculateDiscount(product.basePrice, productOffer.discountType, productOffer.discountValue);
      if (discount > bestDiscount) {
        bestDiscount = discount;
        appliedOffer = { type: 'product', ...productOffer.toObject() };
      }
    }

    if (categoryOffer) {
      const discount = calculateDiscount(product.basePrice, categoryOffer.discountType, categoryOffer.discountValue);
      if (discount > bestDiscount) {
        bestDiscount = discount;
        appliedOffer = { type: 'category', ...categoryOffer.toObject() };
      }
    }

    // Related products
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      isDeleted: false,
      status: 'Active',
    }).limit(8);

    res.status(200).json({
      success: true,
      data: {
        product,
        variants,
        offer: appliedOffer,
        discountedPrice: bestDiscount > 0 ? safeSubtract(product.basePrice, bestDiscount) : null,
        relatedProducts,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lists products with filtering (category, gender, price, size, color, rating, availability),
 * sorting, full-text search, and pagination support.
 */
export const getProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = productFilterSchema.parse(req.query);
    const page = parseInt(filters.page || '1', 10);
    const limit = Math.min(parseInt(filters.limit || '12', 10), 50);
    const { skip } = paginationHelper(page, limit);

    const query: any = { isDeleted: false };

    if (filters.status && filters.status !== 'all') {
      query.status = filters.status;
    } else if (!filters.status) {
      query.status = 'Active';
    }

    if (filters.category) query.category = filters.category;
    if (filters.gender) query.gender = filters.gender;
    if (filters.minPrice || filters.maxPrice) {
      query.basePrice = {};
      if (filters.minPrice) query.basePrice.$gte = parseFloat(filters.minPrice);
      if (filters.maxPrice) query.basePrice.$lte = parseFloat(filters.maxPrice);
    }
    if (filters.rating) query.averageRating = { $gte: parseFloat(filters.rating) };

    if (filters.search) {
      // Escape special regex characters to prevent ReDoS / expensive queries
      const escapedSearch = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { brand: { $regex: escapedSearch, $options: 'i' } },
        { description: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    // Handle size/color filter via variants
    if (filters.size || filters.color || filters.availability) {
      const variantQuery: any = { isDeleted: false };
      if (filters.size) variantQuery.size = filters.size;
      if (filters.color) variantQuery.color = filters.color;
      if (filters.availability === 'instock') variantQuery.stock = { $gt: 0 };
      if (filters.availability === 'outofstock') variantQuery.stock = 0;

      const variantProductIds = await Variant.distinct('product', variantQuery);
      query._id = { $in: variantProductIds };
    }

    // Sorting
    let sortObj: any = { createdAt: -1 };
    if (filters.sort === 'price_asc') sortObj = { basePrice: 1 };
    else if (filters.sort === 'price_desc') sortObj = { basePrice: -1 };
    else if (filters.sort === 'newest') sortObj = { createdAt: -1 };
    else if (filters.sort === 'popularity') sortObj = { totalSold: -1 };
    else if (filters.sort === 'rating') sortObj = { averageRating: -1 };

    const [products, total] = await Promise.all([
      Product.find(query).populate('category', 'name').sort(sortObj).skip(skip).limit(limit),
      Product.countDocuments(query),
    ]);

    // Batch-fetch active offers for all listed products
    const now = new Date();
    const productIds = products.map((p) => p._id);
    const categoryIds = products.map((p) => p.category && typeof p.category === 'object' ? (p.category as any)._id : p.category).filter(Boolean);

    const [productOffers, categoryOffers] = await Promise.all([
      ProductOffer.find({
        product: { $in: productIds },
        isActive: true,
        isDeleted: false,
        startDate: { $lte: now },
        endDate: { $gte: now },
      }),
      CategoryOffer.find({
        category: { $in: categoryIds },
        isActive: true,
        isDeleted: false,
        startDate: { $lte: now },
        endDate: { $gte: now },
      }),
    ]);

    // Build lookup maps for best offer per product/category
    const productOfferMap = new Map<string, typeof productOffers[0]>();
    for (const offer of productOffers) {
      const key = offer.product.toString();
      const existing = productOfferMap.get(key);
      if (!existing || offer.discountValue > existing.discountValue) {
        productOfferMap.set(key, offer);
      }
    }

    const categoryOfferMap = new Map<string, typeof categoryOffers[0]>();
    for (const offer of categoryOffers) {
      const key = offer.category.toString();
      const existing = categoryOfferMap.get(key);
      if (!existing || offer.discountValue > existing.discountValue) {
        categoryOfferMap.set(key, offer);
      }
    }

    // Enrich products with discounted price
    const enrichedProducts = products.map((product) => {
      const p = product.toObject() as any;
      const catId = p.category && typeof p.category === 'object' ? p.category._id?.toString() : p.category?.toString();

      let bestDiscount = 0;
      const prodOffer = productOfferMap.get(p._id.toString());
      if (prodOffer) {
        bestDiscount = calculateDiscount(p.basePrice, prodOffer.discountType, prodOffer.discountValue);
      }

      const catOffer = catId ? categoryOfferMap.get(catId) : undefined;
      if (catOffer) {
        const catDiscount = calculateDiscount(p.basePrice, catOffer.discountType, catOffer.discountValue);
        if (catDiscount > bestDiscount) bestDiscount = catDiscount;
      }

      return {
        ...p,
        discountedPrice: bestDiscount > 0 ? safeSubtract(p.basePrice, Math.min(bestDiscount, p.basePrice)) : null,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        products: enrichedProducts,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Variant management
/** Adds a new size/color variant to a product. Prevents duplicate size-color combinations. */
export const addVariant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createVariantSchema.parse(req.body);
    const { productId } = req.params;

    const product = await Product.findOne({ _id: productId, isDeleted: false });
    if (!product) throw new AppError('Product not found', 404);

    const existing = await Variant.findOne({
      product: productId,
      size: data.size,
      color: data.color,
      isDeleted: false,
    });
    if (existing) throw new AppError('Variant with this size and color already exists', 400);

    const variant = await Variant.create({ ...data, product: productId });

    await invalidateCache('cache:/api/products*');
    res.status(201).json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates a variant's stock or price. Triggers a low-stock alert when stock falls
 * below threshold and auto-updates the product's status based on variant availability.
 */
export const updateVariant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createVariantSchema.partial().parse(req.body);
    const { variantId } = req.params;

    const variant = await Variant.findOneAndUpdate(
      { _id: variantId, isDeleted: false },
      data,
      { new: true }
    );
    if (!variant) throw new AppError('Variant not found', 404);

    // Check low stock
    if (variant.stock <= env.LOW_STOCK_THRESHOLD) {
      console.log(`LOW STOCK ALERT: Product ${variant.product}, Variant ${variant._id}, Stock: ${variant.stock}`);
    }

    // Update product status if all variants out of stock
    const activeVariants = await Variant.find({ product: variant.product, isDeleted: false, stock: { $gt: 0 } });
    if (activeVariants.length === 0) {
      await Product.findByIdAndUpdate(variant.product, { status: 'Out of Stock' });
    } else {
      await Product.findByIdAndUpdate(variant.product, { status: 'Active' });
    }

    await invalidateCache('cache:/api/products*');
    res.status(200).json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
};

/** Soft-deletes a variant by setting its isDeleted flag to true. */
export const deleteVariant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { variantId } = req.params;

    const variant = await Variant.findOneAndUpdate(
      { _id: variantId, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );
    if (!variant) throw new AppError('Variant not found', 404);

    await invalidateCache('cache:/api/products*');
    res.status(200).json({ success: true, message: 'Variant deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/** Returns all active (non-deleted) variants for a given product. */
export const getProductVariants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId } = req.params;
    const variants = await Variant.find({ product: productId, isDeleted: false });
    res.status(200).json({ success: true, data: variants });
  } catch (error) {
    next(error);
  }
};

/** Removes a specific image URL from a product's images array and deletes it from Cloudinary. */
export const removeProductImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { imageUrl } = req.body;

    const product = await Product.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $pull: { images: imageUrl } },
      { new: true }
    );
    if (!product) throw new AppError('Product not found', 404);

    // Delete from Cloudinary (non-blocking)
    await deleteFromCloudinary(imageUrl);

    await invalidateCache('cache:/api/products*');
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

/**
 * Adjusts a variant's stock by a given amount (positive to increase, negative to decrease).
 * Prevents stock from going below zero. Triggers low-stock alert and auto-updates
 * the parent product's status based on remaining variant availability.
 */
export const adjustStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { variantId } = req.params;
    const { adjustment } = adjustStockSchema.parse(req.body);

    const variant = await Variant.findOne({ _id: variantId, isDeleted: false });
    if (!variant) throw new AppError('Variant not found', 404);

    const newStock = variant.stock + adjustment;
    if (newStock < 0) {
      throw new AppError(`Cannot reduce stock below 0. Current stock: ${variant.stock}`, 400);
    }

    variant.stock = newStock;
    await variant.save();

    // Low stock alert
    if (variant.stock <= env.LOW_STOCK_THRESHOLD) {
      console.log(`LOW STOCK ALERT: Product ${variant.product}, Variant ${variant._id}, Stock: ${variant.stock}`);
    }

    // Auto-update product status based on variant availability
    const activeVariants = await Variant.find({ product: variant.product, isDeleted: false, stock: { $gt: 0 } });
    if (activeVariants.length === 0) {
      await Product.findByIdAndUpdate(variant.product, { status: 'Out of Stock' });
    } else {
      await Product.findByIdAndUpdate(variant.product, { status: 'Active' });
    }

    await invalidateCache('cache:/api/products*');
    res.status(200).json({
      success: true,
      message: `Stock ${adjustment > 0 ? 'increased' : 'decreased'} by ${Math.abs(adjustment)}. New stock: ${variant.stock}`,
      data: variant,
    });
  } catch (error) {
    next(error);
  }
};

const MAX_RECENTLY_VIEWED = 20;

const adjustStockSchema = z.object({
  adjustment: z.number().int().min(-10000).max(10000).refine((v) => v !== 0, 'Adjustment must be non-zero'),
});

/**
 * Tracks a product view for the authenticated user.
 * Maintains a capped list of the last 20 viewed products (most recent first).
 * Called when a user views a product detail page.
 */
export const trackProductView = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId } = req.params;
    const userId = req.user!.userId;

    let record = await RecentlyViewed.findOne({ user: userId });
    if (!record) {
      record = new RecentlyViewed({ user: userId, products: [] });
    }

    // Remove the product if already in the list (to move it to the front)
    record.products = record.products.filter((p) => p.product.toString() !== productId);

    // Add to the beginning
    record.products.unshift({ product: productId as any, viewedAt: new Date() });

    // Cap at MAX_RECENTLY_VIEWED
    if (record.products.length > MAX_RECENTLY_VIEWED) {
      record.products = record.products.slice(0, MAX_RECENTLY_VIEWED);
    }

    await record.save();

    res.status(200).json({ success: true, message: 'View tracked' });
  } catch (error) {
    next(error);
  }
};

/** Returns the user's last 20 recently viewed products with basic product details. */
export const getRecentlyViewed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const record = await RecentlyViewed.findOne({ user: req.user!.userId })
      .populate({
        path: 'products.product',
        match: { isDeleted: false },
        select: 'name images basePrice averageRating status',
      });

    const products = record
      ? record.products.filter((p) => p.product !== null)
      : [];

    res.status(200).json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
};
