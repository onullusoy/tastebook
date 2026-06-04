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
    log.warn({ validationErrors: error.errors }, "Validation Error");
    return reply.status(422).send({
      error: {
        code: "VALIDATION_ERROR",
        message: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
      },
    });
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 400 && error.statusCode < 500) {
      log.warn({ code: error.code, message: error.message }, `App Client Error [${error.code}]: ${error.message}`);
    } else {
      log.warn({ err: error }, `App Server Error [${error.code}]: ${error.message}`);
    }
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  if (error.code === "FST_ERR_MULTIPART_REACHED_LIMIT" || error.code === "FST_REQ_FILE_TOO_LARGE") {
    log.warn({ err: error }, "File size limit exceeded");
    return reply.status(422).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "File size exceeds 10MB limit.",
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

  if (process.env.NODE_ENV === "test") {
    console.error("Unhandled Internal Server Error:", error);
  }
  log.error({ err: error }, "Unhandled Internal Server Error");
  return reply.status(500).send({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
}
