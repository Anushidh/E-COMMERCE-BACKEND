import { Request, Response, NextFunction } from 'express';
import Review from '../models/Review';
import Order from '../models/Order';
import Product from '../models/Product';
import { AppError } from '../utils/AppError';
import { createReviewSchema } from '../validators/review.validator';

/**
 * Creates a product review. Only allowed if:
 * - The order containing the product is delivered
 * - The user hasn't already reviewed this product for the same order
 * After creation, recalculates the product's average rating.
 */
export const createReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createReviewSchema.parse(req.body);
    const userId = req.user!.userId;

    const order = await Order.findOne({
      _id: data.order,
      user: userId,
      orderStatus: 'Delivered',
    });
    if (!order) throw new AppError('You can only review products from delivered orders', 400);

    const orderHasProduct = order.items.some((item) => item.product.toString() === data.product);
    if (!orderHasProduct) throw new AppError('This product is not in your order', 400);

    const existing = await Review.findOne({
      user: userId,
      product: data.product,
      order: data.order,
      isDeleted: false,
    });
    if (existing) throw new AppError('You have already reviewed this product for this order', 400);

    const review = await Review.create({ ...data, user: userId });

    // Recalculate product's average rating
    const reviews = await Review.find({ product: data.product, isDeleted: false });
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    await Product.findByIdAndUpdate(data.product, {
      averageRating: Math.round(avgRating * 10) / 10,
      totalReviews: reviews.length,
    });

    res.status(201).json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
};

/** Returns paginated reviews for a specific product, with reviewer name and avatar. */
export const getProductReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = Math.min(parseInt(req.query.limit as string || '10', 10), 50);
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ product: productId, isDeleted: false })
        .populate('user', 'name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments({ product: productId, isDeleted: false }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        reviews,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin soft-deletes a review and recalculates the product's average rating.
 */
export const deleteReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const review = await Review.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );
    if (!review) throw new AppError('Review not found', 404);

    // Recalculate average after removal
    const reviews = await Review.find({ product: review.product, isDeleted: false });
    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    await Product.findByIdAndUpdate(review.product, {
      averageRating: Math.round(avgRating * 10) / 10,
      totalReviews: reviews.length,
    });

    res.status(200).json({ success: true, message: 'Review deleted' });
  } catch (error) {
    next(error);
  }
};
