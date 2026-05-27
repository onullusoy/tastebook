import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../errors";

export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Invalid or expired token");
    }

    const token = authHeader.substring(7);
    const decoded = await request.server.jwt.verify<{ sub: string }>(token);

    if (!decoded || !decoded.sub) {
      throw new UnauthorizedError("Invalid or expired token");
    }

    request.userId = decoded.sub;
  } catch (error) {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
