import type { FastifyInstance } from "fastify";
import { ListsService } from "./lists.service";
import { MediaService } from "../media/media.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { optionalAuthGuard } from "../../shared/middleware/optional-auth";
import { createListRouteSchema, updateListRouteSchema, reorderItemsRouteSchema, addListItemSchema, addCollaboratorRouteSchema } from "./lists.schema";
import { z } from "zod";
import { ValidationError } from "../../shared/errors";
import { FeedService } from "../feed/feed.service";
import { SocialService } from "../social/social.service";

const getListsQuerySchema = z.object({
  type: z.enum(["my", "public", "friends"]).default("my"),
  city: z.string().optional(),
});

export default async function listsRoutes(fastify: FastifyInstance) {
  const mediaService = new MediaService(fastify.db, fastify.s3, fastify.config);
  const listsService = new ListsService(fastify.db, mediaService);
  const socialService = new SocialService(fastify.db);
  const feedService = new FeedService(fastify.db, fastify.redis, socialService, mediaService);

  fastify.get("/lists", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const query = getListsQuerySchema.parse(request.query);
    if (query.type !== "public" && !request.userId) {
      throw new ValidationError("Authentication required for this list type.");
    }
    const list = await listsService.listAll(query.type, request.userId || "", query.city);
    return reply.status(200).send({ data: list });
  });

  fastify.post("/lists", { onRequest: [authGuard] }, async (request, reply) => {
    const body = createListRouteSchema.body.parse(request.body);
    const list = await listsService.create(request.userId, body);
    return reply.status(201).send({ data: list });
  });

  fastify.get("/lists/:id", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const list = await listsService.getById(id, request.userId);
    return reply.status(200).send({ data: list });
  });

  fastify.patch("/lists/:id", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateListRouteSchema.body.parse(request.body);
    const list = await listsService.update(id, request.userId, body);
    return reply.status(200).send({ data: list });
  });

  fastify.delete("/lists/:id", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await listsService.delete(id, request.userId);
    return reply.status(204).send();
  });

  // ===== List Item Routes (Restaurants) =====

  fastify.post("/lists/:id/items", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = addListItemSchema.parse(request.body);
    await listsService.addItem(id, request.userId, body.restaurant_id, {
      name: body.name,
      city: body.city,
      country: body.country,
    });
    return reply.status(201).send({ data: { success: true } });
  });

  fastify.delete("/lists/:id/items/:restaurantId", { onRequest: [authGuard] }, async (request, reply) => {
    const { id, restaurantId } = request.params as { id: string; restaurantId: string };
    await listsService.removeItem(id, request.userId, restaurantId);
    return reply.status(204).send();
  });

  fastify.patch("/lists/:id/items/reorder", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = reorderItemsRouteSchema.body.parse(request.body);
    await listsService.reorderItems(id, request.userId, body.item_ids);
    return reply.status(200).send({ data: { success: true } });
  });

  // ===== Social Layer (Likes Only) =====

  fastify.post("/lists/:id/like", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ownerId = await listsService.like(request.userId, id);
    await feedService.invalidateFollowerFeeds(ownerId);
    return reply.status(200).send({ success: true });
  });

  fastify.delete("/lists/:id/like", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ownerId = await listsService.unlike(request.userId, id);
    await feedService.invalidateFollowerFeeds(ownerId);
    return reply.status(200).send({ success: true });
  });

  // ===== Collaborator Routes =====

  fastify.post("/lists/:id/collaborators", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = addCollaboratorRouteSchema.body.parse(request.body);
    await listsService.addCollaborator(id, request.userId, body.user_id, body.role ?? "contributor");
    return reply.status(201).send({ data: { success: true } });
  });

  fastify.delete("/lists/:id/collaborators/:userId", { onRequest: [authGuard] }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    await listsService.removeCollaborator(id, request.userId, userId);
    return reply.status(204).send();
  });

  fastify.get("/users/:id/lists", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await listsService.listByUser(id, request.userId);
    return reply.status(200).send({ data: result });
  });
}
