import "fastify";
import "@fastify/jwt";
import "@fastify/cookie";
import "@fastify/multipart";
import type { Config } from "../shared/plugins/config";
import type { createDb } from "@tastebook/db";
import type Redis from "ioredis";
import type { S3Client } from "@aws-sdk/client-s3";

declare module "fastify" {
  interface FastifyInstance {
    config: Config;
    db: ReturnType<typeof createDb>;
    redis: Redis;
    s3: S3Client;
  }
  interface FastifyRequest {
    userId: string;
  }
}
