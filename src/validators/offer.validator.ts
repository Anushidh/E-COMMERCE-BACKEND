import { z } from 'zod';

const baseOfferFields = {
  discountType: z.enum(['percentage', 'flat']),
  discountValue: z.number().min(1),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
  isActive: z.boolean().optional(),
};

export const createProductOfferSchema = z.object({
  product: z.string().min(1),
  ...baseOfferFields,
}).refine((data) => {
  if (data.discountType === 'percentage' && data.discountValue > 100) return false;
  return true;
}, { message: 'Percentage discount cannot exceed 100%', path: ['discountValue'] });

export const createCategoryOfferSchema = z.object({
  category: z.string().min(1),
  ...baseOfferFields,
}).refine((data) => {
  if (data.discountType === 'percentage' && data.discountValue > 100) return false;
  return true;
}, { message: 'Percentage discount cannot exceed 100%', path: ['discountValue'] });

export const updateProductOfferSchema = z.object({
  product: z.string().min(1).optional(),
  discountType: z.enum(['percentage', 'flat']).optional(),
  discountValue: z.number().min(1).optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional(),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional(),
  isActive: z.boolean().optional(),
});

export const updateCategoryOfferSchema = z.object({
  category: z.string().min(1).optional(),
  discountType: z.enum(['percentage', 'flat']).optional(),
  discountValue: z.number().min(1).optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional(),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional(),
  isActive: z.boolean().optional(),
});

export type CreateProductOfferInput = z.infer<typeof createProductOfferSchema>;
export type CreateCategoryOfferInput = z.infer<typeof createCategoryOfferSchema>;
