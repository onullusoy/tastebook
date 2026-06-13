import { z } from "zod";
import { createListSchema, updateListSchema, reorderItemsSchema, addCollaboratorSchema, addListItemSchema } from "@tastebook/shared/schemas/lists";

export const createListRouteSchema = {
  body: createListSchema,
};

export const updateListRouteSchema = {
  body: updateListSchema,
};

export const reorderItemsRouteSchema = {
  body: reorderItemsSchema,
};

export { addListItemSchema };

export const addCollaboratorRouteSchema = {
  body: addCollaboratorSchema,
};
