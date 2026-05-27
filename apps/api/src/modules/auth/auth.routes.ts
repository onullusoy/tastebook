import type { FastifyInstance } from "fastify";
import { AuthService } from "./auth.service";
import { registerSchema, loginSchema } from "@tastebook/shared/schemas/auth";
import { authGuard } from "../../shared/middleware/auth-guard";
import { UnauthorizedError } from "../../shared/errors";
import { users } from "@tastebook/db";
import { eq } from "drizzle-orm";

export default async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService(fastify.db, fastify.jwt);

  fastify.post("/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const { user, accessToken, refreshToken } = await authService.register(body);

    reply.setCookie("refreshToken", refreshToken, {
      httpOnly: true,
      path: "/auth",
      sameSite: "lax",
      secure: false,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return reply.status(201).send({
      data: {
        access_token: accessToken,
        user,
      },
    });
  });

  fastify.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const { user, accessToken, refreshToken } = await authService.login(body);

    reply.setCookie("refreshToken", refreshToken, {
      httpOnly: true,
      path: "/auth",
      sameSite: "lax",
      secure: false,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return reply.status(200).send({
      data: {
        access_token: accessToken,
        user,
      },
    });
  });

  fastify.post("/refresh", async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedError("No refresh token provided");
    }

    const { accessToken, refreshToken: newRefreshToken } = await authService.refresh(refreshToken);

    reply.setCookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      path: "/auth",
      sameSite: "lax",
      secure: false,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return reply.status(200).send({
      data: {
        access_token: accessToken,
      },
    });
  });

  fastify.post("/logout", async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    reply.clearCookie("refreshToken", {
      path: "/auth",
    });

    return reply.status(204).send();
  });

  fastify.get("/me", { onRequest: [authGuard] }, async (request, reply) => {
    const user = await fastify.db.query.users.findFirst({
      where: eq(users.id, request.userId),
    });

    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    return reply.status(200).send({
      data: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
        bio: user.bio,
        created_at: user.createdAt.toISOString(),
      },
    });
  });
}
