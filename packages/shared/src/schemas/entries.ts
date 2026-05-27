import { z } from "zod";

export const createEntrySchema = z.object({
  dish_name: z.string().min(1).max(200),
  restaurant_name: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  price_level: z.number().int().min(1).max(5).optional(),
  rating: z.number().int().min(0).max(10),
  notes: z.string().max(2000).optional(),
  visibility: z.enum(["public", "friends", "private"]).default("public"),
  media_ids: z.array(z.string().uuid()).max(5).default([]),
});
export const updateEntrySchema = createEntrySchema.partial().omit({ media_ids: true });
export type CreateEntryRequest = z.infer<typeof createEntrySchema>;
export type UpdateEntryRequest = z.infer<typeof updateEntrySchema>;
