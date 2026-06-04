import type { FastifyInstance } from "fastify";
import { SearchService } from "./search.service";
import { SocialService } from "../social/social.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { z } from "zod";

const searchQuerySchema = z.object({
  q: z.string().default(""),
});

const restaurantSearchQuerySchema = z.object({
  q: z.string().default(""),
  limit: z.coerce.number().default(10),
});

export default async function searchRoutes(fastify: FastifyInstance) {
  const socialService = new SocialService(fastify.db);
  const searchService = new SearchService(fastify.db, socialService);

  fastify.get("/search", { onRequest: [authGuard] }, async (request, reply) => {
    const query = searchQuerySchema.parse(request.query);
    const result = await searchService.search(request.userId, query.q);
    return reply.status(200).send({ data: result });
  });

  fastify.get("/search/restaurants", { onRequest: [authGuard] }, async (request, reply) => {
    const query = restaurantSearchQuerySchema.parse(request.query);
    const result = await searchService.searchRestaurants(
      request.userId,
      query.q,
      fastify.config.GOOGLE_PLACES_API_KEY,
      query.limit
    );
    return reply.status(200).send({ data: result });
  });
}
