import { z } from "zod";
import { createEntrySchema, updateEntrySchema } from "@tastebook/shared/schemas/entries";

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.preprocess((val) => {
    if (typeof val === "string") {
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? undefined : parsed;
    }
    return val;
  }, z.number().int().min(1).max(100).default(20)),
});

export const createEntryRouteSchema = {
  body: createEntrySchema,
};

export const updateEntryRouteSchema = {
  body: updateEntrySchema,
};
