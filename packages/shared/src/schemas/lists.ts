import { z } from "zod";

export const listMetadataSchema = z.object({
  cities: z.array(z.string()).optional().default([]),
}).passthrough();

export const createListSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  visibility: z.enum(["public", "friends", "private"]).default("public"),
  cover_image_url: z.string().nullable().optional(),
  metadata: listMetadataSchema.optional(),
});
export const updateListSchema = createListSchema.partial();

export const reorderItemsSchema = z.object({
  item_ids: z.array(z.string().min(1)).min(1),
});

export const addListItemSchema = z.object({
  restaurant_id: z.string().min(1),
  name: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
});

// Collaborator management
export const addCollaboratorSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["contributor", "editor"]).default("contributor"),
});

export type CreateListRequest = z.infer<typeof createListSchema>;
export type UpdateListRequest = z.infer<typeof updateListSchema>;
export type ReorderItemsRequest = z.infer<typeof reorderItemsSchema>;
export type AddCollaboratorRequest = z.infer<typeof addCollaboratorSchema>;
export type AddListItemRequest = z.infer<typeof addListItemSchema>;
