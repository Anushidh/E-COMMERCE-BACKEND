import { z } from 'zod';

const baseOfferFields = {
  discountType: z.enum(['percentage', 'flat']),
  discountValue: z.number().min(1),
  startDate: z.string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid date')
    .refine((val) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return new Date(val) >= today;
    }, 'Start date cannot be in the past'),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
  isActive: z.boolean().optional(),
};

export const createProductOfferSchema = z.object({
  product: z.string().min(1),
  ...baseOfferFields,
}).refine((data) => {
  if (data.discountType === 'percentage' && data.discountValue > 100) return false;
  return true;
}, { message: 'Percentage discount cannot exceed 100%', path: ['discountValue'] })
.refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
  message: 'End date must be after start date',
  path: ['endDate'],
});

export const createCategoryOfferSchema = z.object({
  category: z.string().min(1),
  ...baseOfferFields,
}).refine((data) => {
  if (data.discountType === 'percentage' && data.discountValue > 100) return false;
  return true;
}, { message: 'Percentage discount cannot exceed 100%', path: ['discountValue'] })
.refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
  message: 'End date must be after start date',
  path: ['endDate'],
});

export const updateProductOfferSchema = z.object({
  product: z.string().min(1).optional(),
  discountType: z.enum(['percentage', 'flat']).optional(),
  discountValue: z.number().min(1).optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional(),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional(),
  isActive: z.boolean().optional(),
}).refine((data) => {
  if (data.discountType === 'percentage' && data.discountValue && data.discountValue > 100) return false;
  return true;
}, { message: 'Percentage discount cannot exceed 100%', path: ['discountValue'] })
.refine((data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.endDate) >= new Date(data.startDate);
  }
  return true;
}, { message: 'End date must be after start date', path: ['endDate'] })
.refine((data) => {
  if (data.startDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(data.startDate) >= today;
  }
  return true;
}, { message: 'Start date cannot be in the past', path: ['startDate'] });

export const updateCategoryOfferSchema = z.object({
  category: z.string().min(1).optional(),
  discountType: z.enum(['percentage', 'flat']).optional(),
  discountValue: z.number().min(1).optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional(),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional(),
  isActive: z.boolean().optional(),
}).refine((data) => {
  if (data.discountType === 'percentage' && data.discountValue && data.discountValue > 100) return false;
  return true;
}, { message: 'Percentage discount cannot exceed 100%', path: ['discountValue'] })
.refine((data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.endDate) >= new Date(data.startDate);
  }
  return true;
}, { message: 'End date must be after start date', path: ['endDate'] })
.refine((data) => {
  if (data.startDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(data.startDate) >= today;
  }
  return true;
}, { message: 'Start date cannot be in the past', path: ['startDate'] });

export type CreateProductOfferInput = z.infer<typeof createProductOfferSchema>;
export type CreateCategoryOfferInput = z.infer<typeof createCategoryOfferSchema>;
