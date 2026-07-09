import { z } from 'zod';

const baseCouponSchema = z.object({
  code: z.string().min(3).max(20),
  discountType: z.enum(['percentage', 'flat']),
  discountValue: z.number().min(1),
  minOrderValue: z.number().min(0).optional(),
  maxDiscount: z.number().min(0).optional(),
  usageLimitPerUser: z.number().int().min(1).optional(),
  totalUsageLimit: z.number().int().min(1),
  expiryDate: z.string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid date')
    .refine((val) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return new Date(val) >= today;
    }, 'Expiry date cannot be in the past'),
  isActive: z.boolean().optional(),
});

export const createCouponSchema = baseCouponSchema.refine((data) => {
  if (data.discountType === 'percentage' && data.discountValue > 100) {
    return false;
  }
  return true;
}, { message: 'Percentage discount cannot exceed 100%', path: ['discountValue'] });

export const updateCouponSchema = z.object({
  code: z.string().min(3).max(20).optional(),
  discountType: z.enum(['percentage', 'flat']).optional(),
  discountValue: z.number().min(1).optional(),
  minOrderValue: z.number().min(0).optional(),
  maxDiscount: z.number().min(0).optional(),
  usageLimitPerUser: z.number().int().min(1).optional(),
  totalUsageLimit: z.number().int().min(1).optional(),
  expiryDate: z.string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid date')
    .optional(),
  isActive: z.boolean().optional(),
}).refine((data) => {
  if (data.discountType === 'percentage' && data.discountValue && data.discountValue > 100) return false;
  return true;
}, { message: 'Percentage discount cannot exceed 100%', path: ['discountValue'] })
.refine((data) => {
  if (data.expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(data.expiryDate) >= today;
  }
  return true;
}, { message: 'Expiry date cannot be in the past', path: ['expiryDate'] });

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
