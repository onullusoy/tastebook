import type { FastifyInstance } from "fastify";
import { UsersService } from "./users.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { optionalAuthGuard } from "../../shared/middleware/optional-auth";
import { updateProfileSchema } from "@tastebook/shared/schemas/users";
import { ValidationError } from "../../shared/errors";

export default async function userRoutes(fastify: FastifyInstance) {
  const usersService = new UsersService(fastify.db, fastify.s3, fastify.config);

  fastify.get("/me", { onRequest: [authGuard] }, async (request, reply) => {
    const profile = await usersService.getProfile(request.userId, request.userId);
    return reply.status(200).send({ data: profile });
  });

  fastify.get("/:id", { onRequest: [optionalAuthGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const profile = await usersService.getProfile(id, request.userId);
    return reply.status(200).send({ data: profile });
  });

  fastify.patch("/me", { onRequest: [authGuard] }, async (request, reply) => {
    const body = updateProfileSchema.parse(request.body);
    const profile = await usersService.updateProfile(request.userId, body);
    return reply.status(200).send({ data: profile });
  });

  fastify.post("/me/avatar", { onRequest: [authGuard] }, async (request, reply) => {
    let buffer: Buffer;
    let mimetype: string;

    // Support both attachFieldsToBody: true (which places the parsed multipart file object on request.body)
    // and standard stream-based request.file() parsing.
    if (request.body && typeof request.body === "object" && "avatar" in request.body) {
      const fileField = (request.body as any).avatar;
      if (fileField && typeof fileField === "object" && typeof fileField.toBuffer === "function") {
        mimetype = fileField.mimetype;
        buffer = await fileField.toBuffer();
      } else {
        throw new ValidationError("No file uploaded");
      }
    } else {
      const part = await request.file();
      if (!part) {
        throw new ValidationError("No file uploaded");
      }
      buffer = await part.toBuffer();
      mimetype = part.mimetype;
    }

    const avatarUrl = await usersService.uploadAvatar(request.userId, buffer, mimetype);
    return reply.status(200).send({ data: { avatar_url: avatarUrl } });
  });
}
