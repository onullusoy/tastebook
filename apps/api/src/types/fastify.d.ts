import "fastify";
import type { Config } from "../shared/plugins/config";
import type { createDb } from "@tastebook/db";
import type Redis from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    config: Config;
    db: ReturnType<typeof createDb>;
    redis: Redis;
  }
  interface FastifyRequest {
    userId: string;
  }
}
