import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Decimal from 'decimal.js';
import Order from '../models/Order';
import Cart from '../models/Cart';
import Variant from '../models/Variant';
import Product from '../models/Product';
import Coupon from '../models/Coupon';
import Wallet from '../models/Wallet';
import WalletTransaction from '../models/WalletTransaction';
import Payment from '../models/Payment';
import ProductOffer from '../models/ProductOffer';
import CategoryOffer from '../models/CategoryOffer';
import User from '../models/User';
import { AppError } from '../utils/AppError';
import { generateOrderId, calculateDiscount, calculateCouponDiscount, safeMultiply, safeAdd, safeSubtract, calculateDeliveryCharge, calculateGST } from '../utils/helpers';
import { placeOrderSchema, cancelOrderSchema, returnOrderSchema } from '../validators/order.validator';
import { sendOrderConfirmationEmail, sendOrderStatusEmail, sendRefundEmail, sendInvoiceEmail } from '../utils/email';
import { env } from '../config/env';
import { createInvoice } from '../utils/invoice';

const RETURN_WINDOW_DAYS = 15;

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

/**
 * Places a new order from the user's cart using a MongoDB transaction.
 * All write operations (coupon, wallet, stock, order, cart) are atomic —
 * if any step fails, everything rolls back.
 */
export const placeOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const data = placeOrderSchema.parse(req.body);
    const userId = req.user!.userId;

    const user = await User.findById(userId).session(session);
    if (!user) throw new AppError('User not found', 404);

    const address = user.addresses.id(data.addressId);
    if (!address) throw new AppError('Address not found', 404);

    const cart = await Cart.findOne({ user: userId }).session(session);
    if (!cart || cart.items.length === 0) throw new AppError('Cart is empty', 400);

    // Determine if order is inter-state (for IGST vs CGST+SGST)
    const isInterState = address.state.toLowerCase() !== env.SELLER_STATE.toLowerCase();

    // Build order items — validate stock & compute pricing
    const now = new Date();
    let subtotal = 0;
    let totalOfferDiscount = 0;
    let totalTax = 0;
    const orderItems: any[] = [];

    for (const item of cart.items) {
      const variant = await Variant.findOne({ _id: item.variant, isDeleted: false }).session(session);
      if (!variant || variant.stock < item.quantity) {
        throw new AppError(`Insufficient stock for variant ${item.variant}`, 400);
      }

      const product = await Product.findOne({ _id: item.product, isDeleted: false, status: 'Active' }).session(session);
      if (!product) {
        throw new AppError(`Product ${item.product} is not available`, 400);
      }

      const price = variant.price || product.basePrice;
      const itemTotal = safeMultiply(price, item.quantity);

      // Determine the better discount: product-level or category-level offer
      let bestDiscount = 0;

      const productOffer = await ProductOffer.findOne({
        product: product._id,
        isActive: true,
        isDeleted: false,
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).sort({ discountValue: -1 }).session(session);

      const categoryOffer = await CategoryOffer.findOne({
        category: product.category,
        isActive: true,
        isDeleted: false,
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).sort({ discountValue: -1 }).session(session);

      if (productOffer) {
        bestDiscount = calculateDiscount(price, productOffer.discountType, productOffer.discountValue);
      }

      if (categoryOffer) {
        const catDiscount = calculateDiscount(price, categoryOffer.discountType, categoryOffer.discountValue);
        if (catDiscount > bestDiscount) bestDiscount = catDiscount;
      }

      // Cap discount at item price
      bestDiscount = Math.min(bestDiscount, price);

      const offerDiscount = safeMultiply(bestDiscount, item.quantity);
      totalOfferDiscount = safeAdd(totalOfferDiscount, offerDiscount);
      subtotal = safeAdd(subtotal, itemTotal);

      const itemFinalPrice = safeSubtract(itemTotal, offerDiscount);
      const itemTax = calculateGST(itemFinalPrice, product.gstRate, isInterState);
      const itemTaxableValue = safeSubtract(itemFinalPrice, itemTax.gstAmount);

      orderItems.push({
        product: product._id,
        variant: variant._id,
        productName: product.name,
        variantInfo: `${variant.size} / ${variant.color}`,
        quantity: item.quantity,
        price,
        offerDiscount,
        finalPrice: itemFinalPrice,
        taxableValue: itemTaxableValue,
        ...itemTax,
      });

      // Accumulate total tax
      totalTax = safeAdd(totalTax, itemTax.gstAmount);
    }

    // Compute coupon discount (validation only — don't persist yet)
    let couponDiscount = 0;
    let couponDoc: any = null;
    if (data.couponCode) {
      couponDoc = await Coupon.findOne({
        code: data.couponCode.toUpperCase(),
        isActive: true,
        isDeleted: false,
        expiryDate: { $gte: now },
      }).session(session);

      if (!couponDoc) throw new AppError('Invalid or expired coupon', 400);
      if (couponDoc.totalUsed >= couponDoc.totalUsageLimit) throw new AppError('Coupon usage limit reached', 400);

      const userUsage = couponDoc.usedBy.find((u: any) => u.user.toString() === userId);
      if (userUsage && userUsage.count >= couponDoc.usageLimitPerUser) {
        throw new AppError('You have already used this coupon maximum times', 400);
      }

      const afterOfferTotal = safeSubtract(subtotal, totalOfferDiscount);
      if (afterOfferTotal < couponDoc.minOrderValue) {
        throw new AppError(`Minimum order value for this coupon is ₹${couponDoc.minOrderValue}`, 400);
      }

      couponDiscount = calculateCouponDiscount(
        afterOfferTotal,
        couponDoc.discountType,
        couponDoc.discountValue,
        couponDoc.maxDiscount
      );
    }

    // Compute wallet deduction amount (don't persist yet)
    let walletAmountUsed = 0;
    if (data.useWallet) {
      const wallet = await Wallet.findOne({ user: userId }).session(session);
      if (wallet && wallet.balance > 0) {
        const remainingAmount = safeSubtract(safeSubtract(subtotal, totalOfferDiscount), couponDiscount);
        walletAmountUsed = Math.min(wallet.balance, Math.max(remainingAmount, 0));
      }
    }

    // Calculate delivery charge (free above threshold, otherwise flat rate)
    const afterDiscountsTotal = safeSubtract(safeSubtract(subtotal, totalOfferDiscount), couponDiscount);
    const shippingCharge = calculateDeliveryCharge(afterDiscountsTotal, env.FREE_DELIVERY_THRESHOLD, env.DELIVERY_CHARGE);

    // Final total = subtotal - offers - coupon - wallet + shipping
    const totalAmount = Math.max(
      safeAdd(
        safeSubtract(safeSubtract(safeSubtract(subtotal, totalOfferDiscount), couponDiscount), walletAmountUsed),
        shippingCharge
      ),
      0
    );

    // COD minimum validation (before any writes)
    if (data.paymentMethod === 'cod' && totalAmount < 500) {
      throw new AppError('Cash on Delivery is only available for orders above ₹500', 400);
    }

    // ─── All validations passed. Start atomic writes within the transaction ───

    // 1. Atomic stock deduction — prevents overselling
    for (const item of orderItems) {
      const updated = await Variant.findOneAndUpdate(
        { _id: item.variant, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { new: true, session }
      );
      if (!updated) {
        throw new AppError(`Insufficient stock for ${item.productName} (${item.variantInfo})`, 400);
      }
      await Product.findByIdAndUpdate(item.product, { $inc: { totalSold: item.quantity } }, { session });
    }

    // 2. Atomic coupon usage increment
    if (couponDoc) {
      const couponUpdate = await Coupon.findOneAndUpdate(
        {
          _id: couponDoc._id,
          totalUsed: { $lt: couponDoc.totalUsageLimit },
        },
        {
          $inc: { totalUsed: 1 },
          $push: { usedBy: { user: userId, count: 1 } },
        },
        { new: true, session }
      );

      // If user already has a usedBy entry, increment instead
      if (!couponUpdate) {
        throw new AppError('Coupon usage limit reached', 400);
      }

      // Check if user entry already existed and needs count increment instead of push
      const existingEntry = couponDoc.usedBy.find((u: any) => u.user.toString() === userId);
      if (existingEntry) {
        await Coupon.findOneAndUpdate(
          { _id: couponDoc._id, 'usedBy.user': userId },
          { $inc: { 'usedBy.$.count': 1 }, $set: {} },
          { session }
        );
        // Undo the push we just did
        await Coupon.findOneAndUpdate(
          { _id: couponDoc._id },
          { $pull: { usedBy: { user: userId, count: 1 } } },
          { session }
        );
      }
    }

    // 3. Atomic wallet deduction
    if (walletAmountUsed > 0) {
      const walletUpdate = await Wallet.findOneAndUpdate(
        { user: userId, balance: { $gte: walletAmountUsed } },
        { $inc: { balance: -walletAmountUsed } },
        { new: true, session }
      );
      if (!walletUpdate) {
        throw new AppError('Insufficient wallet balance', 400);
      }

      await WalletTransaction.create([{
        wallet: walletUpdate._id,
        user: userId,
        type: 'debit',
        amount: walletAmountUsed,
        description: 'Used for order payment',
      }], { session });
    }

    // 4. Create order
    const orderId = generateOrderId();
    const [order] = await Order.create([{
      orderId,
      user: userId,
      items: orderItems,
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        country: address.country,
      },
      subtotal,
      offerDiscount: totalOfferDiscount,
      couponDiscount,
      couponCode: data.couponCode?.toUpperCase(),
      walletAmountUsed,
      shippingCharge,
      totalTax,
      isInterState,
      totalAmount,
      paymentMethod: data.paymentMethod,
      paymentStatus: 'Pending',
      orderStatus: 'Placed',
      statusHistory: [{ status: 'Placed', timestamp: new Date() }],
    }], { session });

    // 5. Clear cart
    await Cart.findOneAndUpdate({ user: userId }, { items: [], totalAmount: 0 }, { session });

    // 6. Commit transaction
    await session.commitTransaction();

    // ─── Post-transaction operations (non-critical, outside transaction) ───

    if (data.paymentMethod === 'razorpay') {
      const razorpayOrder = await razorpay.orders.create({
        amount: new Decimal(order.totalAmount).mul(100).round().toNumber(),
        currency: 'INR',
        receipt: orderId,
      });

      order.razorpayOrderId = razorpayOrder.id;
      await order.save();

      await Payment.create({
        order: order._id,
        user: userId,
        razorpayOrderId: razorpayOrder.id,
        amount: order.totalAmount,
        status: 'created',
      });

      res.status(201).json({
        success: true,
        data: {
          order,
          razorpayOrder: {
            id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
          },
        },
      });
    } else {
      await sendOrderConfirmationEmail(user.email, orderId, order.totalAmount);
      // Generate and send invoice (non-blocking — don't fail the order if invoice fails)
      try {
        const { invoiceId, pdfUrl } = await createInvoice(order);
        await sendInvoiceEmail(user.email, orderId, invoiceId, pdfUrl);
      } catch (invoiceErr) {
        console.error('Invoice generation failed (non-blocking):', invoiceErr);
      }
      res.status(201).json({ success: true, data: { order } });
    }
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * Verifies Razorpay payment after the client completes the payment flow.
 * Validates signature, ensures order belongs to the requesting user,
 * then marks order as Paid.
 */
export const verifyPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      throw new AppError('Payment verification failed', 400);
    }

    // Ensure the order belongs to the authenticated user
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id, user: req.user!.userId });
    if (!order) throw new AppError('Order not found', 404);

    await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { razorpayPaymentId: razorpay_payment_id, razorpaySignature: razorpay_signature, status: 'captured' }
    );

    order.paymentStatus = 'Paid';
    order.razorpayPaymentId = razorpay_payment_id;
    await order.save();

    const user = await User.findById(order.user);
    if (user) {
      await sendOrderConfirmationEmail(user.email, order.orderId, order.totalAmount);
      // Generate and send invoice
      try {
        const { invoiceId, pdfUrl } = await createInvoice(order);
        await sendInvoiceEmail(user.email, order.orderId, invoiceId, pdfUrl);
      } catch (invoiceErr) {
        console.error('Invoice generation failed (non-blocking):', invoiceErr);
      }
    }

    res.status(200).json({ success: true, message: 'Payment verified successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Handles Razorpay webhook events (payment.captured, payment.failed).
 * Validates webhook signature and implements idempotency via Payment status check.
 */
export const razorpayWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      res.status(400).json({ success: false });
      return;
    }

    const event = req.body.event;
    const payment = req.body.payload?.payment?.entity;

    if (!payment) {
      res.status(200).json({ success: true });
      return;
    }

    // Idempotency: skip if already processed
    const existingPayment = await Payment.findOne({ razorpayOrderId: payment.order_id });
    if (!existingPayment || existingPayment.status === 'captured') {
      res.status(200).json({ success: true });
      return;
    }

    if (event === 'payment.captured') {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: payment.order_id, status: { $ne: 'captured' } },
        { razorpayPaymentId: payment.id, status: 'captured', method: payment.method }
      );
      await Order.findOneAndUpdate(
        { razorpayOrderId: payment.order_id },
        { paymentStatus: 'Paid', razorpayPaymentId: payment.id }
      );
    } else if (event === 'payment.failed') {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: payment.order_id },
        { status: 'failed' }
      );
      await Order.findOneAndUpdate(
        { razorpayOrderId: payment.order_id },
        { paymentStatus: 'Failed' }
      );
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

/** Returns paginated list of the authenticated user's orders, newest first. */
export const getUserOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = Math.min(parseInt(req.query.limit as string || '10', 10), 50);
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find({ user: req.user!.userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments({ user: req.user!.userId }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    next(error);
  }
};

/** Returns full details of a specific order including populated product/variant info. */
export const getOrderById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user!.userId })
      .populate('items.product', 'name images')
      .populate('items.variant', 'size color');

    if (!order) throw new AppError('Order not found', 404);

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancels an order (allowed only in Placed/Confirmed stages).
 * Atomically restores stock, refunds wallet, and restores coupon usage.
 * Uses a MongoDB transaction for data consistency.
 */
export const cancelOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { reason } = cancelOrderSchema.parse(req.body);
    const order = await Order.findOne({ _id: req.params.id, user: req.user!.userId }).session(session);

    if (!order) throw new AppError('Order not found', 404);
    if (!['Placed', 'Confirmed'].includes(order.orderStatus)) {
      throw new AppError('Order cannot be cancelled at this stage', 400);
    }

    order.orderStatus = 'Cancelled';
    order.cancelReason = reason;
    order.statusHistory.push({ status: 'Cancelled', timestamp: new Date(), note: reason });

    // Restore stock and decrement totalSold
    for (const item of order.items) {
      await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } }, { session });
      await Product.findByIdAndUpdate(item.product, { $inc: { totalSold: -item.quantity } }, { session });
    }

    // Restore coupon usage
    if (order.couponCode) {
      await Coupon.findOneAndUpdate(
        { code: order.couponCode, isDeleted: false },
        { $inc: { totalUsed: -1 } },
        { session }
      );
      await Coupon.findOneAndUpdate(
        { code: order.couponCode, 'usedBy.user': req.user!.userId },
        { $inc: { 'usedBy.$.count': -1 } },
        { session }
      );
    }

    // Refund to wallet if payment was made
    if (order.paymentStatus === 'Paid' || order.walletAmountUsed > 0) {
      const refundAmount = order.paymentStatus === 'Paid'
        ? safeAdd(order.totalAmount, order.walletAmountUsed)
        : order.walletAmountUsed;

      if (refundAmount > 0) {
        const wallet = await Wallet.findOneAndUpdate(
          { user: req.user!.userId },
          { $inc: { balance: refundAmount } },
          { new: true, session }
        );

        if (wallet) {
          await WalletTransaction.create([{
            wallet: wallet._id,
            user: req.user!.userId,
            type: 'credit',
            amount: refundAmount,
            description: `Refund for cancelled order ${order.orderId}`,
            reference: order.orderId,
          }], { session });
        }

        order.paymentStatus = 'Refunded';
      }
    }

    await order.save({ session });
    await session.commitTransaction();

    // Send email outside transaction
    const user = await User.findById(req.user!.userId);
    if (user && order.paymentStatus === 'Refunded') {
      const refundAmount = order.paymentStatus === 'Refunded'
        ? safeAdd(order.totalAmount, order.walletAmountUsed)
        : order.walletAmountUsed;
      await sendRefundEmail(user.email, order.orderId, refundAmount);
    }

    res.status(200).json({ success: true, message: 'Order cancelled successfully' });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * Submits a return request for a delivered order.
 * Enforces a return window (configurable, default 15 days from delivery).
 */
export const requestReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { reason } = returnOrderSchema.parse(req.body);
    const order = await Order.findOne({ _id: req.params.id, user: req.user!.userId });

    if (!order) throw new AppError('Order not found', 404);
    if (order.orderStatus !== 'Delivered') {
      throw new AppError('Return can only be requested for delivered orders', 400);
    }

    // Enforce return window
    if (order.deliveredAt) {
      const daysSinceDelivery = (Date.now() - order.deliveredAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDelivery > RETURN_WINDOW_DAYS) {
        throw new AppError(`Return window of ${RETURN_WINDOW_DAYS} days has expired`, 400);
      }
    }

    order.orderStatus = 'Return Requested';
    order.returnReason = reason;
    order.statusHistory.push({ status: 'Return Requested', timestamp: new Date(), note: reason });
    await order.save();

    res.status(200).json({ success: true, message: 'Return request submitted' });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns the invoice details for a specific order.
 * If the invoice hasn't been generated yet, generates it on-the-fly.
 */
export const getOrderInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { default: Invoice } = await import('../models/Invoice');

    const order = await Order.findOne({ _id: req.params.id, user: req.user!.userId });
    if (!order) throw new AppError('Order not found', 404);

    if (!['Placed', 'Confirmed', 'Shipped', 'Out for Delivery', 'Delivered'].includes(order.orderStatus)) {
      throw new AppError('Invoice not available for cancelled/returned orders', 400);
    }

    // Check if invoice already exists
    let invoice = await Invoice.findOne({ order: order._id });

    if (!invoice) {
      // Generate on-the-fly
      const { invoiceId, pdfUrl } = await createInvoice(order);
      invoice = await Invoice.findOne({ invoiceId });
    }

    res.status(200).json({
      success: true,
      data: {
        invoiceId: invoice?.invoiceId,
        pdfUrl: invoice?.pdfUrl,
        invoiceDate: invoice?.invoiceDate,
      },
    });
  } catch (error) {
    next(error);
  }
};
