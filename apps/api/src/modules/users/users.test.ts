import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createTestApp, truncateTables, createTestUserWithAuth } from "../../../test/helpers/setup";
import { follows } from "@tastebook/db";
import { TINY_JPEG } from "../../../test/helpers/fixtures";

describe("Users Module Integration Tests", () => {
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

  it("GET /users/:id — existing user → 200, no password_hash in response", async () => {
    const { user } = await createTestUserWithAuth(app);

    const res = await app.inject({
      method: "GET",
      url: `/users/${user.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(user.id);
    expect(body.data.username).toBe(user.username);
    expect(body.data).not.toHaveProperty("passwordHash");
    expect(body.data).not.toHaveProperty("password_hash");
  });

  it("GET /users/:id — nonexistent user → 404", async () => {
    const nonexistentId = "00000000-0000-0000-0000-000000000000";
    const res = await app.inject({
      method: "GET",
      url: `/users/${nonexistentId}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it("GET /users/:id — authenticated viewer → includes is_following, is_friend fields", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    const res1 = await app.inject({
      method: "GET",
      url: `/users/${bob.user.id}`,
      headers: alice.headers,
    });
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.data.is_following).toBe(false);
    expect(body1.data.is_friend).toBe(false);

    await app.db.insert(follows).values({
      followerId: alice.user.id,
      followingId: bob.user.id,
    });

    const res2 = await app.inject({
      method: "GET",
      url: `/users/${bob.user.id}`,
      headers: alice.headers,
    });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.data.is_following).toBe(true);
    expect(body2.data.is_friend).toBe(false);

    await app.db.insert(follows).values({
      followerId: bob.user.id,
      followingId: alice.user.id,
    });

    const res3 = await app.inject({
      method: "GET",
      url: `/users/${bob.user.id}`,
      headers: alice.headers,
    });
    expect(res3.statusCode).toBe(200);
    const body3 = JSON.parse(res3.body);
    expect(body3.data.is_following).toBe(true);
    expect(body3.data.is_friend).toBe(true);
  });

  it("PATCH /users/me — update display_name → 200, field updated", async () => {
    const alice = await createTestUserWithAuth(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: alice.headers,
      payload: {
        display_name: "Alice Smith",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.display_name).toBe("Alice Smith");
  });

  it("PATCH /users/me — update bio → 200, field updated", async () => {
    const alice = await createTestUserWithAuth(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: alice.headers,
      payload: {
        bio: "This is my cool bio",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.bio).toBe("This is my cool bio");
  });

  it("PATCH /users/me — no auth → 401", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      payload: {
        bio: "Unauthorized edit",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST /users/me/avatar — valid JPEG upload → 200, avatar_url set, accessible via URL", async () => {
    const alice = await createTestUserWithAuth(app);

    const res = await request(app.server)
      .post("/users/me/avatar")
      .set("Authorization", alice.headers.Authorization)
      .attach("avatar", TINY_JPEG, { filename: "avatar.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("avatar_url");
    expect(res.body.data.avatar_url).toContain(`/${app.config.MINIO_BUCKET}/`);
  });

  it("POST /users/me/avatar — file too large (>5MB) → 422", async () => {
    const alice = await createTestUserWithAuth(app);
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 10);
    largeBuffer.write("FFD8FF", "hex");

    const res = await request(app.server)
      .post("/users/me/avatar")
      .set("Authorization", alice.headers.Authorization)
      .attach("avatar", largeBuffer, { filename: "huge.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(422);
  });

  it("POST /users/me/avatar — invalid file type → 422", async () => {
    const alice = await createTestUserWithAuth(app);
    const textBuffer = Buffer.from("hello world this is text");

    const res = await request(app.server)
      .post("/users/me/avatar")
      .set("Authorization", alice.headers.Authorization)
      .attach("avatar", textBuffer, { filename: "test.txt", contentType: "text/plain" });

    expect(res.status).toBe(422);
  });

  it("POST /users/me/avatar — replaces previous avatar (upload 2x, verify old deleted)", async () => {
    const alice = await createTestUserWithAuth(app);

    const res1 = await request(app.server)
      .post("/users/me/avatar")
      .set("Authorization", alice.headers.Authorization)
      .attach("avatar", TINY_JPEG, { filename: "avatar1.jpg", contentType: "image/jpeg" });

    expect(res1.status).toBe(200);
    const firstUrl = res1.body.data.avatar_url;

    const res2 = await request(app.server)
      .post("/users/me/avatar")
      .set("Authorization", alice.headers.Authorization)
      .attach("avatar", TINY_JPEG, { filename: "avatar2.jpg", contentType: "image/jpeg" });

    expect(res2.status).toBe(200);
    const secondUrl = res2.body.data.avatar_url;
    expect(secondUrl).not.toBe(firstUrl);

    const bucketInUrl = `/${app.config.MINIO_BUCKET}/`;
    const index = firstUrl.indexOf(bucketInUrl);
    const oldKey = firstUrl.substring(index + bucketInUrl.length);

    await expect(
      app.s3.send(
        new HeadObjectCommand({
          Bucket: app.config.MINIO_BUCKET,
          Key: oldKey,
        })
      )
    ).rejects.toThrow();
  });
});
