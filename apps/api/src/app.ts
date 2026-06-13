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

  // Prevent duplicate plugin registrations (e.g. from AdminJS)
  const registeredPlugins = new Set<string>();
  const originalRegister = app.register;
  (app as any).register = function (plugin: any, opts: any) {
    const pluginName = plugin[Symbol.for("fastify.display-name")] || plugin.name;
    if (pluginName && registeredPlugins.has(pluginName)) {
      app.log.info(`Skipping duplicate registration of plugin: ${pluginName}`);
      return this;
    }
    if (pluginName) {
      registeredPlugins.add(pluginName);
    }
    return originalRegister.call(this, plugin, opts);
  };

  await app.register(configPlugin);

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow all origins in dev, or specific WEB_URL
      if (!origin || process.env.NODE_ENV !== "production") {
        cb(null, true);
        return;
      }

      const allowedOrigins = [
        app.config.WEB_URL,
        "https://tastebook-web.vercel.app",
      ];

      if (allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
        cb(null, true);
        return;
      }

      cb(null, false);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Bypass-Tunnel-Reminder", "ngrok-skip-browser-warning"],
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

