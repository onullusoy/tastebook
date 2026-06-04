import type { FastifyInstance } from "fastify";
import { EntriesService } from "./entries.service";
import { MediaService } from "../media/media.service";
import { FeedService } from "../feed/feed.service";
import { SocialService } from "../social/social.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { optionalAuthGuard } from "../../shared/middleware/optional-auth";
import { createEntrySchema, updateEntrySchema, createCommentSchema } from "@tastebook/shared/schemas/entries";
import { cursorPaginationSchema } from "./entries.schema";

export default async function entriesRoutes(fastify: FastifyInstance) {
  const mediaService = new MediaService(fastify.db, fastify.s3, fastify.config);
  const entriesService = new EntriesService(fastify.db, mediaService, fastify.config.GOOGLE_PLACES_API_KEY);
  const socialService = new SocialService(fastify.db);
  const feedService = new FeedService(fastify.db, fastify.redis, socialService, mediaService);

  fastify.post("/entries", { onRequest: [authGuard] }, async (request, reply) => {
    const body = createEntrySchema.parse(request.body);
    const entry = await entriesService.create(request.userId, body);
    await feedService.invalidateFollowerFeeds(request.userId);
    return reply.status(201).send({ data: entry });
  });

  fastify.get("/entries/:id", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await entriesService.getById(id, request.userId);
    return reply.status(200).send({ data: entry });
  });

  fastify.patch("/entries/:id", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateEntrySchema.parse(request.body);
    const entry = await entriesService.update(id, request.userId, body);
    await feedService.invalidateFollowerFeeds(request.userId);
    return reply.status(200).send({ data: entry });
  });

  fastify.delete("/entries/:id", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await entriesService.delete(id, request.userId);
    await feedService.invalidateFollowerFeeds(request.userId);
    return reply.status(204).send();
  });

  fastify.get("/users/:id/entries", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = cursorPaginationSchema.parse(request.query);
    const result = await entriesService.listByUser(id, request.userId, query.cursor, query.limit);
    return reply.status(200).send(result);
  });

  // Likes
  fastify.post("/entries/:id/like", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ownerId = await entriesService.like(request.userId, id);
    await feedService.invalidateFollowerFeeds(ownerId);
    return reply.status(200).send({ success: true });
  });

  fastify.delete("/entries/:id/like", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ownerId = await entriesService.unlike(request.userId, id);
    await feedService.invalidateFollowerFeeds(ownerId);
    return reply.status(200).send({ success: true });
  });

  // Comments
  fastify.get("/entries/:id/comments", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const comments = await entriesService.getComments(id, request.userId);
    return reply.status(200).send({ data: comments });
  });

  fastify.post("/entries/:id/comments", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createCommentSchema.parse(request.body);
    const { comment, ownerId } = await entriesService.addComment(request.userId, id, body.content);
    await feedService.invalidateFollowerFeeds(ownerId);
    return reply.status(201).send({ data: comment });
  });

  fastify.delete("/entries/:id/comments/:commentId", { onRequest: [authGuard] }, async (request, reply) => {
    const { id, commentId } = request.params as { id: string; commentId: string };
    const ownerId = await entriesService.deleteComment(request.userId, id, commentId);
    await feedService.invalidateFollowerFeeds(ownerId);
    return reply.status(200).send({ success: true });
  });

  // Counter Polling Endpoint
  fastify.get("/entries/:id/counters", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const stats = await entriesService.getCounters(id, request.userId);
    return reply.status(200).send(stats);
  });
}

// Trigger server reload
