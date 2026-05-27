import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import configPlugin from "./shared/plugins/config";
import dbPlugin from "./shared/plugins/db";
import redisPlugin from "./shared/plugins/redis";
import { errorHandler } from "./shared/middleware/error-handler";
import authRoutes from "./modules/auth/auth.routes";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "test" ? "silent" : "info",
    },
  });

  await app.register(configPlugin);

  await app.register(cors, {
    origin: app.config.WEB_URL,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: app.config.JWT_SECRET,
  });
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });

  await app.register(dbPlugin);
  await app.register(redisPlugin);

  app.setErrorHandler(errorHandler);

  await app.register(authRoutes, { prefix: "/auth" });

  return app;
}
