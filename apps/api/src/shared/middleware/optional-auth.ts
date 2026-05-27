import type { FastifyReply, FastifyRequest } from "fastify";

export async function optionalAuthGuard(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = await request.server.jwt.verify<{ sub: string }>(token);
      if (decoded && decoded.sub) {
        request.userId = decoded.sub;
      }
    }
  } catch (error) {
  }
}
