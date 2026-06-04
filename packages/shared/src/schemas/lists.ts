import { z } from "zod";

export const createListSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  visibility: z.enum(["public", "friends", "private"]).default("public"),
});
export const updateListSchema = createListSchema.partial();

export const reorderItemsSchema = z.object({
  item_ids: z.array(z.string().uuid()).min(1),
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
