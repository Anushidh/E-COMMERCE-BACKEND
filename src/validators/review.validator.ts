import { z } from 'zod';

export const createReviewSchema = z.object({
  product: z.string().min(1),
  order: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  review: z.string().min(5).max(1000),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
