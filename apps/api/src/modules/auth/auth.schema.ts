import { registerSchema, loginSchema } from "@tastebook/shared/schemas/auth";

export const registerRouteSchema = {
  body: registerSchema,
};

export const loginRouteSchema = {
  body: loginSchema,
};
