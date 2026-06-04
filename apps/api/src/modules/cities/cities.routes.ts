import type { FastifyInstance, FastifyRequest } from "fastify";
import { CitiesService } from "./cities.service";
import { z } from "zod";

const paramsSchema = z.object({
  cityName: z.string(),
});

const restaurantQuerySchema = z.object({
  sortBy: z.enum(["popularity", "rating"]).default("popularity"),
});

const gourmetQuerySchema = z.object({
  scope: z.enum(["public", "friends"]).default("public"),
});

async function optionalAuth(request: FastifyRequest) {
  if (process.env.NODE_ENV === "development" && request.headers["x-dev-user-id"]) {
    request.userId = request.headers["x-dev-user-id"] as string;
    return;
  }

  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.substring(7);
      const decoded = await request.server.jwt.verify<{ sub: string }>(token);
      if (decoded && decoded.sub) {
        request.userId = decoded.sub;
      }
    } catch (e) {
      // Ignore error for optional auth
    }
  }
}

export default async function citiesRoutes(fastify: FastifyInstance) {
  const citiesService = new CitiesService(fastify.db);

  fastify.get("/cities/:cityName/stats", { preHandler: [optionalAuth] }, async (request, reply) => {
    const { cityName } = paramsSchema.parse(request.params);
    const decodedCityName = decodeURIComponent(cityName);
    const stats = await citiesService.getCityStats(decodedCityName);
    return reply.status(200).send(stats);
  });

  fastify.get("/cities/:cityName/rankings/restaurants", { preHandler: [optionalAuth] }, async (request, reply) => {
    const { cityName } = paramsSchema.parse(request.params);
    const decodedCityName = decodeURIComponent(cityName);
    const query = restaurantQuerySchema.parse(request.query);
    const data = await citiesService.getTopRestaurants(decodedCityName, query.sortBy);
    return reply.status(200).send({ data });
  });

  fastify.get("/cities/:cityName/rankings/gourmets", { preHandler: [optionalAuth] }, async (request, reply) => {
    const { cityName } = paramsSchema.parse(request.params);
    const decodedCityName = decodeURIComponent(cityName);
    const query = gourmetQuerySchema.parse(request.query);
    const data = await citiesService.getTopGourmets(decodedCityName, request.userId, query.scope);
    return reply.status(200).send({ data });
  });
}
