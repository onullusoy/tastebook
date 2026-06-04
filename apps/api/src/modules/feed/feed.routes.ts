import type { FastifyInstance } from "fastify";
import { FeedService } from "./feed.service";
import { SocialService } from "../social/social.service";
import { MediaService } from "../media/media.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { cursorPaginationSchema } from "../entries/entries.schema";
import { cityFeedQuerySchema } from "@tastebook/shared/schemas/entries";

export default async function feedRoutes(fastify: FastifyInstance) {
  const socialService = new SocialService(fastify.db);
  const mediaService = new MediaService(fastify.db, fastify.s3, fastify.config);
  const feedService = new FeedService(fastify.db, fastify.redis, socialService, mediaService);

  fastify.get("/feed", { onRequest: [authGuard] }, async (request, reply) => {
    const query = cursorPaginationSchema.parse(request.query);
    const result = await feedService.getFeed(request.userId, query.cursor, query.limit);
    return reply.status(200).send(result);
  });

  fastify.get("/feed/city/:cityName", { onRequest: [authGuard] }, async (request, reply) => {
    const { cityName } = request.params as { cityName: string };
    const query = cityFeedQuerySchema.parse(request.query);
    const result = await feedService.getCityFeed(
      request.userId,
      cityName,
      query.scope,
      query.cursor,
      query.limit
    );
    return reply.status(200).send(result);
  });
}

