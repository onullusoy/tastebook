import type { FastifyInstance } from "fastify";
import { MediaService } from "./media.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { ValidationError } from "../../shared/errors";

export default async function mediaRoutes(fastify: FastifyInstance) {
  const mediaService = new MediaService(fastify.db, fastify.s3, fastify.config);

  fastify.post("/upload", { onRequest: [authGuard] }, async (request, reply) => {
    const part = await request.file();
    if (!part) {
      throw new ValidationError("No file uploaded");
    }
    const buffer = await part.toBuffer();
    const media = await mediaService.uploadImage(request.userId, buffer, part.mimetype);
    return reply.status(201).send({ data: media });
  });
}
