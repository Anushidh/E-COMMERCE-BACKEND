import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Wishlist from '../models/Wishlist';
import Cart from '../models/Cart';
import Variant from '../models/Variant';
import Product from '../models/Product';
import ProductOffer from '../models/ProductOffer';
import CategoryOffer from '../models/CategoryOffer';
import { safeMultiply, safeSum, calculateDiscount, safeSubtract } from '../utils/helpers';
import { AppError } from '../utils/AppError';
import { z } from 'zod';

const addToWishlistSchema = z.object({
  productId: z.string().min(1),
});

const moveToCartSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
});

/**
 * Returns the user's wishlist with populated product details.
 * Filters out soft-deleted products and includes stock availability info.
 */
export const getWishlist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user!.userId })
      .populate({
        path: 'products',
        match: { isDeleted: false },
        select: 'name images basePrice status averageRating category',
      });

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user!.userId, products: [] });
      res.status(200).json({ success: true, data: { ...wishlist.toObject(), products: [] } });
      return;
    }

    // Enrich products with stock availability using a single aggregation query
    const productIds = wishlist.products
      .filter((p) => p !== null)
      .map((p: any) => p._id);

    const categoryIds = wishlist.products
      .filter((p) => p !== null)
      .map((p: any) => p.category)
      .filter(Boolean);

    const now = new Date();

    const [stockData, productOffers, categoryOffers] = await Promise.all([
      Variant.aggregate([
        { $match: { product: { $in: productIds }, isDeleted: false } },
        { $group: { _id: '$product', total: { $sum: '$stock' } } },
      ]),
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

    const stockMap = new Map(stockData.map((s) => [s._id.toString(), s.total]));

    // Build best offer maps
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

    const productsWithStock = wishlist.products
      .filter((p) => p !== null)
      .map((product: any) => {
        const totalStock = stockMap.get(product._id.toString()) || 0;

        // Calculate best offer
        let bestDiscount = 0;
        const prodOffer = productOfferMap.get(product._id.toString());
        if (prodOffer) {
          bestDiscount = calculateDiscount(product.basePrice, prodOffer.discountType, prodOffer.discountValue);
        }
        const catId = product.category?.toString();
        const catOffer = catId ? categoryOfferMap.get(catId) : undefined;
        if (catOffer) {
          const catDiscount = calculateDiscount(product.basePrice, catOffer.discountType, catOffer.discountValue);
          if (catDiscount > bestDiscount) bestDiscount = catDiscount;
        }

        return {
          ...product.toObject(),
          inStock: totalStock > 0,
          totalStock,
          discountedPrice: bestDiscount > 0 ? safeSubtract(product.basePrice, Math.min(bestDiscount, product.basePrice)) : null,
        };
      });

    res.status(200).json({ success: true, data: { ...wishlist.toObject(), products: productsWithStock } });
  } catch (error) {
    next(error);
  }
};

/** Adds a product to the user's wishlist. Validates input and prevents duplicates. */
export const addToWishlist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId } = addToWishlistSchema.parse(req.body);

    const product = await Product.findOne({ _id: productId, isDeleted: false });
    if (!product) throw new AppError('Product not found', 404);

    let wishlist = await Wishlist.findOne({ user: req.user!.userId });
    if (!wishlist) {
      wishlist = new Wishlist({ user: req.user!.userId, products: [] });
    }

    if (wishlist.products.some((p) => p.toString() === productId)) {
      throw new AppError('Product already in wishlist', 400);
    }

    wishlist.products.push(productId as any);
    await wishlist.save();

    res.status(200).json({ success: true, message: 'Added to wishlist' });
  } catch (error) {
    next(error);
  }
};

/** Removes a product from the user's wishlist by product ID. */
export const removeFromWishlist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId } = req.params;

    const wishlist = await Wishlist.findOne({ user: req.user!.userId });
    if (!wishlist) throw new AppError('Wishlist not found', 404);

    wishlist.products = wishlist.products.filter((p) => p.toString() !== productId);
    await wishlist.save();

    res.status(200).json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    next(error);
  }
};

/** Clears all products from the user's wishlist. */
export const clearWishlist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user!.userId });
    if (!wishlist) throw new AppError('Wishlist not found', 404);

    wishlist.products = [];
    await wishlist.save();

    res.status(200).json({ success: true, message: 'Wishlist cleared' });
  } catch (error) {
    next(error);
  }
};

/**
 * Moves a product from the wishlist to the cart.
 * Uses a MongoDB transaction to ensure both cart addition and wishlist removal
 * succeed or fail together — preventing the item from existing in both places.
 */
export const moveToCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    const { productId, variantId } = moveToCartSchema.parse(req.body);

    const product = await Product.findOne({ _id: productId, isDeleted: false, status: 'Active' });
    if (!product) throw new AppError('Product not available', 400);

    const variant = await Variant.findOne({ _id: variantId, product: productId, isDeleted: false });
    if (!variant) throw new AppError('Variant not found', 400);
    if (variant.stock < 1) throw new AppError('Out of stock', 400);

    const price = variant.price || product.basePrice;

    await session.withTransaction(async () => {
      let cart = await Cart.findOne({ user: req.user!.userId }).session(session);
      if (!cart) {
        cart = new Cart({ user: req.user!.userId, items: [], totalAmount: 0 });
      }

      const existingItem = cart.items.find(
        (item) => item.product.toString() === productId && item.variant.toString() === variantId
      );

      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        cart.items.push({ product: productId as any, variant: variantId as any, quantity: 1, price });
      }

      cart.totalAmount = safeSum(cart.items.map((item) => safeMultiply(item.price, item.quantity)));
      await cart.save({ session });

      await Wishlist.findOneAndUpdate(
        { user: req.user!.userId },
        { $pull: { products: productId } },
        { session }
      );
    });

    res.status(200).json({ success: true, message: 'Moved to cart' });
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
};
