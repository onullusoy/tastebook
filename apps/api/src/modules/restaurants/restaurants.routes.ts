import type { FastifyInstance } from "fastify";
import { RestaurantsService } from "./restaurants.service";
import { EntriesService } from "../entries/entries.service";
import { MediaService } from "../media/media.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { z } from "zod";

const paramsSchema = z.object({
  placeId: z.string(),
});

export default async function restaurantsRoutes(fastify: FastifyInstance) {
  const mediaService = new MediaService(fastify.db, fastify.s3, fastify.config);
  const entriesService = new EntriesService(fastify.db, mediaService, fastify.config.GOOGLE_PLACES_API_KEY);
  const restaurantsService = new RestaurantsService(fastify.db, entriesService, fastify.config.GOOGLE_PLACES_API_KEY);

  fastify.get("/restaurants/:placeId", { onRequest: [authGuard] }, async (request, reply) => {
    const { placeId } = paramsSchema.parse(request.params);
    const detail = await restaurantsService.getRestaurantDetail(placeId, request.userId);
    return reply.status(200).send({ data: detail });
  });
}
