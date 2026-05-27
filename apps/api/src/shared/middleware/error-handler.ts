import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../errors";

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const log = request.log;

  if (error instanceof ZodError) {
    log.warn({ err: error }, "Validation Error");
    return reply.status(422).send({
      error: {
        code: "VALIDATION_ERROR",
        message: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
      },
    });
  }

  if (error instanceof AppError) {
    log.warn({ err: error }, `App Error [${error.code}]: ${error.message}`);
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  if (error.validation) {
    log.warn({ err: error }, "Fastify Validation Error");
    return reply.status(422).send({
      error: {
        code: "VALIDATION_ERROR",
        message: error.message,
      },
    });
  }

  log.error({ err: error }, "Unhandled Internal Server Error");
  return reply.status(500).send({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
}
