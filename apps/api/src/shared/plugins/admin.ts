import fp from "fastify-plugin";
import AdminJS from "adminjs";
import AdminJSFastify from "@adminjs/fastify";
import { Database, Resource } from "adminjs-drizzle/pg";
import { eq, inArray } from "drizzle-orm";
import { recalculateUserGP } from "../utils/gourme-points";

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
          actions: {
            delete: {
              after: async (response: any, request: any, context: any) => {
                const record = (context as any).record;
                if (record && record.params) {
                  const userId = record.params.userId || record.params.user_id;
                  if (userId) {
                    await recalculateUserGP(fastify.db, userId);
                  }
                }
                return response;
              }
            },
            bulkDelete: {
              after: async (response: any, request: any, context: any) => {
                const records = (context as any).records;
                if (records && Array.isArray(records)) {
                  const userIds = new Set(
                    records
                      .map((r) => r?.params?.userId || r?.params?.user_id)
                      .filter(Boolean)
                  );
                  for (const userId of userIds) {
                    await recalculateUserGP(fastify.db, userId as string);
                  }
                }
                return response;
              }
            },
            edit: {
              after: async (response: any, request: any, context: any) => {
                const record = (context as any).record;
                if (record && record.params) {
                  const userId = record.params.userId || record.params.user_id;
                  if (userId) {
                    await recalculateUserGP(fastify.db, userId);
                  }
                }
                return response;
              }
            }
          }
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
          actions: {
            delete: {
              after: async (response: any, request: any, context: any) => {
                const record = (context as any).record;
                if (record && record.params) {
                  const entryId = record.params.entryId || record.params.entry_id;
                  if (entryId) {
                    const entry = await fastify.db.query.tasteEntries.findFirst({
                      where: eq(tasteEntries.id, entryId),
                    });
                    if (entry) {
                      await recalculateUserGP(fastify.db, entry.userId);
                    }
                  }
                }
                return response;
              }
            },
            bulkDelete: {
              after: async (response: any, request: any, context: any) => {
                const records = (context as any).records;
                if (records && Array.isArray(records)) {
                  const entryIds = records.map((r) => r?.params?.entryId || r?.params?.entry_id).filter(Boolean);
                  if (entryIds.length > 0) {
                    const entries = await fastify.db.query.tasteEntries.findMany({
                      where: inArray(tasteEntries.id, entryIds),
                    });
                    const userIds = new Set(entries.map((e) => e.userId));
                    for (const userId of userIds) {
                      await recalculateUserGP(fastify.db, userId);
                    }
                  }
                }
                return response;
              }
            }
          }
        },
      },
      {
        resource: { table: entryLikes, db: fastify.db },
        options: {
          navigation: { name: "Social & Activity", icon: "Heart" },
          actions: {
            delete: {
              after: async (response: any, request: any, context: any) => {
                const record = (context as any).record;
                if (record && record.params) {
                  const entryId = record.params.entryId || record.params.entry_id;
                  if (entryId) {
                    const entry = await fastify.db.query.tasteEntries.findFirst({
                      where: eq(tasteEntries.id, entryId),
                    });
                    if (entry) {
                      await recalculateUserGP(fastify.db, entry.userId);
                    }
                  }
                }
                return response;
              }
            },
            bulkDelete: {
              after: async (response: any, request: any, context: any) => {
                const records = (context as any).records;
                if (records && Array.isArray(records)) {
                  const entryIds = records.map((r) => r?.params?.entryId || r?.params?.entry_id).filter(Boolean);
                  if (entryIds.length > 0) {
                    const entries = await fastify.db.query.tasteEntries.findMany({
                      where: inArray(tasteEntries.id, entryIds),
                    });
                    const userIds = new Set(entries.map((e) => e.userId));
                    for (const userId of userIds) {
                      await recalculateUserGP(fastify.db, userId);
                    }
                  }
                }
                return response;
              }
            }
          }
        },
      },
      {
        resource: { table: follows, db: fastify.db },
        options: {
          navigation: { name: "Social & Activity", icon: "Users" },
          actions: {
            delete: {
              after: async (response: any, request: any, context: any) => {
                const record = (context as any).record;
                if (record && record.params) {
                  const followingId = record.params.followingId || record.params.following_id;
                  if (followingId) {
                    await recalculateUserGP(fastify.db, followingId);
                  }
                }
                return response;
              }
            },
            bulkDelete: {
              after: async (response: any, request: any, context: any) => {
                const records = (context as any).records;
                if (records && Array.isArray(records)) {
                  const followingIds = new Set(
                    records
                      .map((r) => r?.params?.followingId || r?.params?.following_id)
                      .filter(Boolean)
                  );
                  for (const followingId of followingIds) {
                    await recalculateUserGP(fastify.db, followingId as string);
                  }
                }
                return response;
              }
            }
          }
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
