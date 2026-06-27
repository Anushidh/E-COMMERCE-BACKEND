import { z } from 'zod';

export const createProductOfferSchema = z.object({
  product: z.string().min(1),
  discountType: z.enum(['percentage', 'flat']),
  discountValue: z.number().min(0),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
  isActive: z.boolean().optional(),
});

export const createCategoryOfferSchema = z.object({
  category: z.string().min(1),
  discountType: z.enum(['percentage', 'flat']),
  discountValue: z.number().min(0),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
  isActive: z.boolean().optional(),
});

export const updateProductOfferSchema = createProductOfferSchema.partial();
export const updateCategoryOfferSchema = createCategoryOfferSchema.partial();

export type CreateProductOfferInput = z.infer<typeof createProductOfferSchema>;
export type CreateCategoryOfferInput = z.infer<typeof createCategoryOfferSchema>;
