import type { FastifyInstance } from "fastify";
import { ListsService } from "./lists.service";
import { MediaService } from "../media/media.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { optionalAuthGuard } from "../../shared/middleware/optional-auth";
import { createListRouteSchema, updateListRouteSchema, reorderItemsRouteSchema, addListItemSchema, addCollaboratorRouteSchema } from "./lists.schema";

export default async function listsRoutes(fastify: FastifyInstance) {
  const mediaService = new MediaService(fastify.db, fastify.s3, fastify.config);
  const listsService = new ListsService(fastify.db, mediaService);

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

  fastify.post("/lists/:id/items", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = addListItemSchema.parse(request.body);
    await listsService.addItem(id, request.userId, body.entry_id);
    return reply.status(201).send({ data: { success: true } });
  });

  fastify.delete("/lists/:id/items/:entryId", { onRequest: [authGuard] }, async (request, reply) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    await listsService.removeItem(id, request.userId, entryId);
    return reply.status(204).send();
  });

  fastify.patch("/lists/:id/items/reorder", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = reorderItemsRouteSchema.body.parse(request.body);
    await listsService.reorderItems(id, request.userId, body.item_ids);
    return reply.status(200).send({ data: { success: true } });
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
