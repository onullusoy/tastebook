import fp from "fastify-plugin";
import AdminJS from "adminjs";
import AdminJSFastify from "@adminjs/fastify";
import { Database, Resource } from "adminjs-drizzle/pg";

import {
  users,
  tasteEntries,
  restaurants,
  lists,
  entryComments,
  entryLikes,
  follows,
  listItems,
  listCollaborators,
  foodItems,
  entryMedia,
  commentLikes,
  refreshTokens,
} from "@tastebook/db";

// Register Drizzle adapter with AdminJS
AdminJS.registerAdapter({ Database, Resource });

export default fp(async (fastify) => {
  const sessionSecret = fastify.config.ADMIN_COOKIE_PASSWORD || fastify.config.JWT_SECRET;

  // Initialize AdminJS
  const adminJs = new AdminJS({
    resources: [
      {
        resource: { table: users, db: fastify.db },
        options: {
          navigation: { name: "Core Models", icon: "User" },
          properties: {
            passwordHash: {
              isVisible: {
                list: false,
                filter: false,
                show: false,
                edit: false,
              },
            },
          },
        },
      },
      {
        resource: { table: tasteEntries, db: fastify.db },
        options: {
          navigation: { name: "Core Models", icon: "BookOpen" },
        },
      },
      {
        resource: { table: restaurants, db: fastify.db },
        options: {
          navigation: { name: "Core Models", icon: "MapPin" },
        },
      },
      {
        resource: { table: lists, db: fastify.db },
        options: {
          navigation: { name: "Core Models", icon: "List" },
        },
      },
      {
        resource: { table: entryComments, db: fastify.db },
        options: {
          navigation: { name: "Social & Activity", icon: "MessageSquare" },
        },
      },
      {
        resource: { table: entryLikes, db: fastify.db },
        options: {
          navigation: { name: "Social & Activity", icon: "Heart" },
        },
      },
      {
        resource: { table: follows, db: fastify.db },
        options: {
          navigation: { name: "Social & Activity", icon: "Users" },
        },
      },
      {
        resource: { table: listItems, db: fastify.db },
        options: {
          navigation: { name: "Lists & Food", icon: "Grid" },
        },
      },
      {
        resource: { table: listCollaborators, db: fastify.db },
        options: {
          navigation: { name: "Lists & Food", icon: "Users" },
        },
      },
      {
        resource: { table: foodItems, db: fastify.db },
        options: {
          navigation: { name: "Lists & Food", icon: "Coffee" },
        },
      },
      {
        resource: { table: entryMedia, db: fastify.db },
        options: {
          navigation: { name: "Media & Logs", icon: "Image" },
        },
      },
      {
        resource: { table: commentLikes, db: fastify.db },
        options: {
          navigation: { name: "Social & Activity", icon: "ThumbsUp" },
        },
      },
      {
        resource: { table: refreshTokens, db: fastify.db },
        options: {
          navigation: { name: "Media & Logs", icon: "Key" },
        },
      },
    ],
    rootPath: "/admin",
    branding: {
      companyName: "Tastebook Admin",
      withMadeWithLove: false,
    },
  });

  // Build the authenticated router
  await AdminJSFastify.buildAuthenticatedRouter(
    adminJs,
    {
      authenticate: async (email, password) => {
        if (
          email === fastify.config.ADMIN_EMAIL &&
          password === fastify.config.ADMIN_PASSWORD
        ) {
          return { email };
        }
        return null;
      },
      cookiePassword: sessionSecret,
      cookieName: "adminjs_session",
    },
    fastify as any,
    {
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      },
    }
  );

  fastify.log.info("AdminJS dashboard registered successfully at /admin");
});
