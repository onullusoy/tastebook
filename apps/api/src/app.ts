import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import formbody from "@fastify/formbody";
import configPlugin from "./shared/plugins/config";
import dbPlugin from "./shared/plugins/db";
import redisPlugin from "./shared/plugins/redis";
import s3Plugin from "./shared/plugins/s3";
import { errorHandler } from "./shared/middleware/error-handler";
import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/users/users.routes";
import mediaRoutes from "./modules/media/media.routes";
import entriesRoutes from "./modules/entries/entries.routes";
import socialRoutes from "./modules/social/social.routes";
import feedRoutes from "./modules/feed/feed.routes";
import listsRoutes from "./modules/lists/lists.routes";
import searchRoutes from "./modules/search/search.routes";
import placesRoutes from "./modules/places/places.routes";
import restaurantsRoutes from "./modules/restaurants/restaurants.routes";
import citiesRoutes from "./modules/cities/cities.routes";
import adminPlugin from "./shared/plugins/admin";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "test" ? "silent" : "info",
    },
    rewriteUrl: process.env.NODE_ENV === "test" ? (req) => {
      const url = req.url;
      if (url && !url.startsWith("/api") && !url.startsWith("/admin")) {
        return `/api${url}`;
      }
      return url || "/";
    } : undefined,
  });
  await app.register(configPlugin);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }

      const sanitize = (url: string) => url.replace(/\/$/, "").toLowerCase();
      const sanitizedOrigin = sanitize(origin);

      // Always allow localhost in non-production
      if (process.env.NODE_ENV !== "production" || sanitizedOrigin.startsWith("http://localhost:") || sanitizedOrigin.startsWith("http://127.0.0.1:")) {
        cb(null, true);
        return;
      }

      const rawOrigins = [
        app.config.WEB_URL,
        process.env.WEB_URL,
        "https://tastebook-web.vercel.app",
        "http://localhost:3000"
      ].filter(Boolean) as string[];

      const sanitizedAllowed = rawOrigins.map(sanitize);

      const isAllowed = sanitizedAllowed.includes(sanitizedOrigin) || 
                        sanitizedOrigin.endsWith(".vercel.app") ||
                        (sanitizedOrigin.includes("ngrok") && process.env.NODE_ENV !== "production");

      if (isAllowed) {
        cb(null, true);
      } else {
        app.log.warn(`CORS blocked for origin: ${origin}`);
        cb(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type", 
      "Authorization", 
      "Bypass-Tunnel-Reminder", 
      "ngrok-skip-browser-warning",
      "Origin",
      "Accept",
      "X-Requested-With"
    ],
  });
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(s3Plugin);

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });

  await app.register(formbody);

  if (!app.hasRequestDecorator("cookies")) {
    await app.register(cookie, {
      secret: [
        app.config.JWT_SECRET,
        app.config.ADMIN_COOKIE_PASSWORD,
      ].filter(Boolean) as string[],
    });
  }

  await app.register(jwt, {
    secret: app.config.JWT_SECRET,
  });

  await app.register(adminPlugin);

  app.setErrorHandler(errorHandler);

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(socialRoutes, { prefix: "/api/users" });
  await app.register(mediaRoutes, { prefix: "/api/media" });
  await app.register(entriesRoutes, { prefix: "/api" });
  await app.register(feedRoutes, { prefix: "/api" });
  await app.register(listsRoutes, { prefix: "/api" });
  await app.register(searchRoutes, { prefix: "/api" });
  await app.register(placesRoutes, { prefix: "/api" });
  await app.register(restaurantsRoutes, { prefix: "/api" });
  await app.register(citiesRoutes, { prefix: "/api" });

  return app;
}

