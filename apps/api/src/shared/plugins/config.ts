import fp from "fastify-plugin";
import { z } from "zod";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Dynamically load environment variables in order (root -> local -> local overrides)
const envFiles = [
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), ".env.local"),
];

for (const file of envFiles) {
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch (e) {
      // Ignore missing or malformed file errors
    }
  }
}

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.preprocess((val) => Number(val), z.number()),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET: z.string(),
  MINIO_USE_SSL: z.preprocess((val) => val === "true" || val === true, z.boolean()),
  API_PORT: z.preprocess((val) => Number(val || 3001), z.number()),
  API_HOST: z.string().default("::"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_COOKIE_PASSWORD: z.string().min(32).optional(),
});

export type Config = z.infer<typeof configSchema>;

export default fp(async (fastify) => {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const errorMsg = `Invalid environment variables: ${result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ")}`;
    fastify.log.error(errorMsg);
    throw new Error(errorMsg);
  }
  fastify.decorate("config", result.data);
});
