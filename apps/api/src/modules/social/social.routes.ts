import type { FastifyInstance } from "fastify";
import { SocialService } from "./social.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { optionalAuthGuard } from "../../shared/middleware/optional-auth";
import { cursorPaginationSchema } from "../entries/entries.schema";

export default async function socialRoutes(fastify: FastifyInstance) {
  const socialService = new SocialService(fastify.db);

  fastify.post("/:id/follow", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await socialService.follow(request.userId, id);
    return reply.status(204).send();
  });

  fastify.delete("/:id/follow", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await socialService.unfollow(request.userId, id);
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
