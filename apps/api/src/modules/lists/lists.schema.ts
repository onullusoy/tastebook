import { z } from "zod";
import { createListSchema, updateListSchema, reorderItemsSchema } from "@tastebook/shared/schemas/lists";

export const createListRouteSchema = {
  body: createListSchema,
};

export const updateListRouteSchema = {
  body: updateListSchema,
};

export const reorderItemsRouteSchema = {
  body: reorderItemsSchema,
};

export const addListItemSchema = z.object({
  entry_id: z.string().uuid(),
});
