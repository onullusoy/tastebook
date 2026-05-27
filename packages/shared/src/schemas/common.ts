import { z } from "zod";

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});
