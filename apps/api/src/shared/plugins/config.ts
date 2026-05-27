import fp from "fastify-plugin";
import { z } from "zod";

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
  API_HOST: z.string().default("0.0.0.0"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
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
