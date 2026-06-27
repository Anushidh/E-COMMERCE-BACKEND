import { z } from 'zod';

export const createCouponSchema = z.object({
  code: z.string().min(3).max(20),
  discountType: z.enum(['percentage', 'flat']),
  discountValue: z.number().min(0),
  minOrderValue: z.number().min(0).optional(),
  maxDiscount: z.number().min(0).optional(),
  usageLimitPerUser: z.number().int().min(1).optional(),
  totalUsageLimit: z.number().int().min(1),
  expiryDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
});

export const updateCouponSchema = createCouponSchema.partial();

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
