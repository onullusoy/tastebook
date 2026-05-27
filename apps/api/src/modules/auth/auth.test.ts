import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, truncateTables, createTestUser } from "../../../test/helpers/setup";
import { refreshTokens } from "@tastebook/db";
import { createHash } from "node:crypto";

describe("Auth Module Integration Tests", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await truncateTables(app.db);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /auth/register", () => {
    it("should register a user with valid data", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          username: "alice",
          email: "alice@example.com",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveProperty("access_token");
      expect(body.data.user).toMatchObject({
        username: "alice",
      });
      expect(body.data.user).not.toHaveProperty("password_hash");
      expect(body.data.user).not.toHaveProperty("passwordHash");
      expect(res.cookies[0]).toBeDefined();
      expect(res.cookies[0].name).toBe("refreshToken");
    });

    it("should return 409 when email is already registered", async () => {
      await createTestUser(app, { email: "alice@example.com", username: "alice1" });

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          username: "alice2",
          email: "alice@example.com",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toBe("Email already registered");
    });

    it("should return 409 when username is already taken", async () => {
      await createTestUser(app, { email: "alice1@example.com", username: "alice" });

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          username: "alice",
          email: "alice2@example.com",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toBe("Username already taken");
    });

    it("should return 422 for invalid email format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          username: "alice",
          email: "notanemail",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 422 for password shorter than 8 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          username: "alice",
          email: "alice@example.com",
          password: "short",
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /auth/login", () => {
    beforeEach(async () => {
      await createTestUser(app, { email: "alice@example.com", username: "alice", password: "password123" });
    });

    it("should login with valid credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "alice@example.com",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveProperty("access_token");
      expect(body.data.user.username).toBe("alice");
      expect(res.cookies[0].name).toBe("refreshToken");
    });

    it("should return 401 for wrong password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "alice@example.com",
          password: "wrongpassword",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Invalid email or password");
    });

    it("should return 401 for nonexistent email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "nonexistent@example.com",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Invalid email or password");
    });
  });

  describe("POST /auth/refresh", () => {
    it("should refresh access token with valid cookie", async () => {
      const { cookie } = await createTestUser(app);

      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        cookies: {
          refreshToken: cookie.value,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveProperty("access_token");
      expect(res.cookies[0].name).toBe("refreshToken");
    });

    it("should return 401 for invalid refresh token cookie", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        cookies: {
          refreshToken: "invalid-token",
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("should return 401 for reused refresh token (after rotation)", async () => {
      const { cookie } = await createTestUser(app);

      const res1 = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        cookies: {
          refreshToken: cookie.value,
        },
      });
      expect(res1.statusCode).toBe(200);

      const res2 = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        cookies: {
          refreshToken: cookie.value,
        },
      });
      expect(res2.statusCode).toBe(401);
    });

    it("should return 401 for expired refresh token", async () => {
      const { user } = await createTestUser(app);

      const rawToken = "expiredrefreshtokenexpiredrefreshtokenexpiredrefreshtoken123456";
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");

      const expiredDate = new Date();
      expiredDate.setSeconds(expiredDate.getSeconds() - 10);

      await app.db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: expiredDate,
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        cookies: {
          refreshToken: rawToken,
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /auth/logout", () => {
    it("should log out and clear cookie", async () => {
      const { cookie } = await createTestUser(app);

      const res = await app.inject({
        method: "POST",
        url: "/auth/logout",
        cookies: {
          refreshToken: cookie.value,
        },
      });

      expect(res.statusCode).toBe(204);
      expect(res.cookies[0].value).toBe("");
    });
  });

  describe("GET /auth/me", () => {
    it("should return profile details for valid token", async () => {
      const { user, accessToken } = await createTestUser(app);

      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.username).toBe(user.username);
    });

    it("should return 401 when no token is provided", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
      });

      expect(res.statusCode).toBe(401);
    });

    it("should return 401 for expired access token", async () => {
      const { user } = await createTestUser(app);
      const expiredToken = app.jwt.sign({ sub: user.id, exp: Math.floor(Date.now() / 1000) - 100 });

      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: {
          Authorization: `Bearer ${expiredToken}`,
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("should return 401 for malformed token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: {
          Authorization: "Bearer malformedtoken123",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
