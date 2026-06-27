import { Request, Response, NextFunction } from 'express';
import Cart from '../models/Cart';
import Variant from '../models/Variant';
import Product from '../models/Product';

import { AppError } from '../utils/AppError';
import { safeMultiply, safeSum } from '../utils/helpers';
import { env } from '../config/env';
import { z } from 'zod';

const addToCartSchema = z.object({
  product: z.string().min(1),
  variant: z.string().min(1),
  quantity: z.number().int().min(1),
});

const updateCartSchema = z.object({
  quantity: z.number().int().min(1),
});

/** Recalculates the cart total by summing up all item prices multiplied by their quantities. */
const recalculateTotal = (items: any[]): number => {
  return safeSum(items.map((item) => safeMultiply(item.price, item.quantity)));
};

/**
 * Returns the user's cart with populated product and variant details.
 * Automatically removes items whose product or variant has been soft-deleted,
 * and refreshes prices from the current variant/product data.
 */
export const getCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let cart = await Cart.findOne({ user: req.user!.userId })
      .populate('items.product', 'name images status isDeleted basePrice')
      .populate('items.variant', 'size color stock price isDeleted');

    if (!cart) {
      cart = await Cart.create({ user: req.user!.userId, items: [], totalAmount: 0 });
      res.status(200).json({ success: true, data: cart });
      return;
    }

    // Filter out items with deleted/unavailable products or variants, and refresh prices
    let needsSave = false;
    const validItems = cart.items.filter((item) => {
      const product = item.product as any;
      const variant = item.variant as any;
      if (!product || !variant || product.isDeleted || variant.isDeleted || product.status !== 'Active') {
        needsSave = true;
        return false;
      }
      // Refresh price from current data
      const currentPrice = variant.price || product.basePrice;
      if (item.price !== currentPrice) {
        item.price = currentPrice;
        needsSave = true;
      }
      return true;
    });

    if (needsSave) {
      cart.items = validItems as any;
      cart.totalAmount = recalculateTotal(cart.items);
      await cart.save();
    }

    res.status(200).json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

/**
 * Adds a product variant to the cart.
 * Validates product availability and stock before adding.
 */
export const addToCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = addToCartSchema.parse(req.body);

    const product = await Product.findOne({ _id: data.product, isDeleted: false, status: 'Active' });
    if (!product) throw new AppError('Product not available', 400);

    const variant = await Variant.findOne({ _id: data.variant, product: data.product, isDeleted: false });
    if (!variant) throw new AppError('Variant not found', 400);
    if (data.quantity > env.MAX_QUANTITY_PER_ITEM) {
      throw new AppError(`Maximum ${env.MAX_QUANTITY_PER_ITEM} units allowed per item`, 400);
    }
    if (variant.stock < data.quantity) {
      throw new AppError(`Only ${variant.stock} items available in stock`, 400);
    }

    const price = variant.price || product.basePrice;

    let cart = await Cart.findOne({ user: req.user!.userId });
    if (!cart) {
      cart = new Cart({ user: req.user!.userId, items: [], totalAmount: 0 });
    }

    const existingItem = cart.items.find(
      (item) => item.product.toString() === data.product && item.variant.toString() === data.variant
    );

    if (existingItem) {
      const newQty = existingItem.quantity + data.quantity;
      if (newQty > env.MAX_QUANTITY_PER_ITEM) {
        throw new AppError(`Maximum ${env.MAX_QUANTITY_PER_ITEM} units allowed per item`, 400);
      }
      if (newQty > variant.stock) {
        throw new AppError(`Only ${variant.stock} items available in stock`, 400);
      }
      existingItem.quantity = newQty;
      existingItem.price = price;
    } else {
      cart.items.push({
        product: data.product as any,
        variant: data.variant as any,
        quantity: data.quantity,
        price,
      });
    }

    cart.totalAmount = recalculateTotal(cart.items);
    cart.lastActivityAt = new Date();
    cart.isAbandoned = false;
    await cart.save();

    res.status(200).json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

/** Updates the quantity of an existing cart item after validating available stock. */
export const updateCartItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { itemId } = req.params;
    const { quantity } = updateCartSchema.parse(req.body);

    const cart = await Cart.findOne({ user: req.user!.userId });
    if (!cart) throw new AppError('Cart not found', 404);

    const item = cart.items.find((i) => i._id?.toString() === itemId);
    if (!item) throw new AppError('Item not found in cart', 404);

    const variant = await Variant.findById(item.variant);
    if (!variant || variant.isDeleted) throw new AppError('Variant no longer available', 400);
    if (quantity > env.MAX_QUANTITY_PER_ITEM) {
      throw new AppError(`Maximum ${env.MAX_QUANTITY_PER_ITEM} units allowed per item`, 400);
    }
    if (variant.stock < quantity) {
      throw new AppError(`Only ${variant.stock} items available in stock`, 400);
    }

    item.quantity = quantity;
    cart.totalAmount = recalculateTotal(cart.items);
    cart.lastActivityAt = new Date();
    cart.isAbandoned = false;
    await cart.save();

    res.status(200).json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

/** Removes a specific item from the cart by item ID. */
export const removeCartItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { itemId } = req.params;

    const cart = await Cart.findOne({ user: req.user!.userId });
    if (!cart) throw new AppError('Cart not found', 404);

    cart.items = cart.items.filter((i) => i._id?.toString() !== itemId);
    cart.totalAmount = recalculateTotal(cart.items);
    cart.lastActivityAt = new Date();
    cart.isAbandoned = false;
    await cart.save();

    res.status(200).json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

/** Empties the entire cart by removing all items and resetting the total to zero. */
export const clearCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await Cart.findOneAndUpdate(
      { user: req.user!.userId },
      { items: [], totalAmount: 0 }
    );

    res.status(200).json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    next(error);
  }
};
