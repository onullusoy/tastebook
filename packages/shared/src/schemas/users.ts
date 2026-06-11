import { z } from "zod";

export const updateProfileSchema = z.object({
  display_name: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
