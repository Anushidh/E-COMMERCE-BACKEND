import { Request, Response, NextFunction } from 'express';
import Wishlist from '../models/Wishlist';
import Cart from '../models/Cart';
import Variant from '../models/Variant';
import Product from '../models/Product';
import { safeMultiply, safeSum } from '../utils/helpers';
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
        select: 'name images basePrice status averageRating',
      });

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user!.userId, products: [] });
      res.status(200).json({ success: true, data: { ...wishlist.toObject(), products: [] } });
      return;
    }

    // Enrich each product with stock availability from variants
    const productsWithStock = await Promise.all(
      wishlist.products
        .filter((p) => p !== null)
        .map(async (product: any) => {
          const totalStock = await Variant.aggregate([
            { $match: { product: product._id, isDeleted: false } },
            { $group: { _id: null, total: { $sum: '$stock' } } },
          ]);
          return {
            ...product.toObject(),
            inStock: (totalStock[0]?.total || 0) > 0,
            totalStock: totalStock[0]?.total || 0,
          };
        })
    );

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

/**
 * Moves a product from the wishlist to the cart.
 * Validates input, checks stock, and removes from wishlist on success.
 */
export const moveToCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId, variantId } = moveToCartSchema.parse(req.body);

    const product = await Product.findOne({ _id: productId, isDeleted: false, status: 'Active' });
    if (!product) throw new AppError('Product not available', 400);

    const variant = await Variant.findOne({ _id: variantId, product: productId, isDeleted: false });
    if (!variant) throw new AppError('Variant not found', 400);
    if (variant.stock < 1) throw new AppError('Out of stock', 400);

    const price = variant.price || product.basePrice;

    let cart = await Cart.findOne({ user: req.user!.userId });
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
    await cart.save();

    // Remove from wishlist
    await Wishlist.findOneAndUpdate(
      { user: req.user!.userId },
      { $pull: { products: productId } }
    );

    res.status(200).json({ success: true, message: 'Moved to cart' });
  } catch (error) {
    next(error);
  }
};
