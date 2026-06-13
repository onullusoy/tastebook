import type { FastifyInstance } from "fastify";
import { MediaService } from "./media.service";
import { authGuard } from "../../shared/middleware/auth-guard";
import { ValidationError } from "../../shared/errors";

export default async function mediaRoutes(fastify: FastifyInstance) {
  const mediaService = new MediaService(fastify.db, fastify.s3, fastify.config);

  fastify.post("/upload", { onRequest: [authGuard] }, async (request, reply) => {
    let buffer: Buffer;
    let mimetype: string;

    // Support both attachFieldsToBody: true (which places the parsed multipart file object on request.body)
    // and standard stream-based request.file() parsing.
    if (request.body && typeof request.body === "object" && "file" in request.body) {
      const fileField = (request.body as any).file;
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

    const media = await mediaService.uploadImage(request.userId, buffer, mimetype);
    return reply.status(201).send({ data: media });
  });

  fastify.get("/file/*", async (request, reply) => {
    const objectKey = (request.params as any)["*"];
    if (!objectKey) {
      return reply.status(400).send({ error: "Missing file key" });
    }
    try {
      const response = await mediaService.getMediaStream(objectKey);
      if (response.ContentType) {
        reply.header("Content-Type", response.ContentType);
      }
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      return reply.send(response.Body);
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return reply.status(404).send({ error: "File not found" });
      }
      throw err;
    }
  });
}
