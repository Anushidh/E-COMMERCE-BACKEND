import { z } from 'zod';

export const placeOrderSchema = z.object({
  addressId: z.string().min(1),
  paymentMethod: z.enum(['razorpay', 'cod']),
  couponCode: z.string().optional(),
  useWallet: z.boolean().optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(5).max(500),
});

export const returnOrderSchema = z.object({
  reason: z.string().min(5).max(500),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['Confirmed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Returned']),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type ReturnOrderInput = z.infer<typeof returnOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
