import type { FastifyInstance } from "fastify";
import { SocialService } from "./social.service";
import { FeedService } from "../feed/feed.service";
import { MediaService } from "../media/media.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { optionalAuthGuard } from "../../shared/middleware/optional-auth";
import { cursorPaginationSchema } from "../entries/entries.schema";

export default async function socialRoutes(fastify: FastifyInstance) {
  const socialService = new SocialService(fastify.db);
  const mediaService = new MediaService(fastify.db, fastify.s3, fastify.config);
  const feedService = new FeedService(fastify.db, fastify.redis, socialService, mediaService);

  fastify.post("/:id/follow", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await socialService.follow(request.userId, id);
    await feedService.invalidateUserFeed(request.userId);
    return reply.status(204).send();
  });

  fastify.delete("/:id/follow", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await socialService.unfollow(request.userId, id);
    await feedService.invalidateUserFeed(request.userId);
    return reply.status(204).send();
  });

  fastify.get("/:id/followers", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = cursorPaginationSchema.parse(request.query);
    const result = await socialService.getFollowers(id, query.cursor, query.limit, request.userId);
    return reply.status(200).send(result);
  });

  fastify.get("/:id/following", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = cursorPaginationSchema.parse(request.query);
    const result = await socialService.getFollowing(id, query.cursor, query.limit, request.userId);
    return reply.status(200).send(result);
  });

  fastify.get("/:id/friends", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = cursorPaginationSchema.parse(request.query);
    const result = await socialService.getFriends(id, query.cursor, query.limit, request.userId);
    return reply.status(200).send(result);
  });
}
