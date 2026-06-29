import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().min(10),
  brand: z.string().optional(),
  category: z.string().min(1),
  gender: z.enum(['Men', 'Women', 'Unisex']),
  basePrice: z.coerce.number().min(0),
  gstRate: z.coerce
    .number()
    .refine(
      (v) => [0, 5, 12, 18, 28].includes(v),
      'GST rate must be 0, 5, 12, 18, or 28'
    ),
  status: z.enum(['Active', 'Inactive', 'Out of Stock']).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const createVariantSchema = z.object({
  size: z.string().min(1),
  color: z.string().min(1),
  stock: z.number().int().min(0),
  sku: z.string().optional(),
  price: z.number().min(0).optional(),
});

export const productFilterSchema = z.object({
  category: z.string().optional(),
  gender: z.enum(['Men', 'Women', 'Unisex']).optional(),
  status: z.enum(['Active', 'Inactive', 'Out of Stock', 'all']).optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  rating: z.string().optional(),
  availability: z.enum(['instock', 'outofstock']).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'popularity', 'rating']).optional(),
  search: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type ProductFilterInput = z.infer<typeof productFilterSchema>;
