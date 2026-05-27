import type { FastifyInstance } from "fastify";
import { EntriesService } from "./entries.service";
import { MediaService } from "../media/media.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { optionalAuthGuard } from "../../shared/middleware/optional-auth";
import { createEntrySchema, updateEntrySchema } from "@tastebook/shared/schemas/entries";
import { cursorPaginationSchema } from "./entries.schema";

export default async function entriesRoutes(fastify: FastifyInstance) {
  const mediaService = new MediaService(fastify.db, fastify.s3, fastify.config);
  const entriesService = new EntriesService(fastify.db, mediaService);

  fastify.post("/entries", { onRequest: [authGuard] }, async (request, reply) => {
    const body = createEntrySchema.parse(request.body);
    const entry = await entriesService.create(request.userId, body);
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
    return reply.status(200).send({ data: entry });
  });

  fastify.delete("/entries/:id", { onRequest: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await entriesService.delete(id, request.userId);
    return reply.status(204).send();
  });

  fastify.get("/users/:id/entries", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = cursorPaginationSchema.parse(request.query);
    const result = await entriesService.listByUser(id, request.userId, query.cursor, query.limit);
    return reply.status(200).send(result);
  });
}
