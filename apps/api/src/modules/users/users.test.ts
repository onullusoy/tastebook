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

  describe("Gourmet Points (GP) Integration Tests", () => {
    it("should calculate and update GP correctly on follow, like, comment, and delete cascade", async () => {
      const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

      // 1. Initial GP is 0
      const resProfileInit = await app.inject({
        method: "GET",
        url: `/users/${bob.user.id}`,
      });
      expect(resProfileInit.statusCode).toBe(200);
      expect(JSON.parse(resProfileInit.body).data.gourme_points).toBe(0);

      // 2. Alice follows Bob -> Bob gets follower points
      // 1 follower = round(15 * sqrt(1)) = 15 GP
      const followRes = await app.inject({
        method: "POST",
        url: `/users/${bob.user.id}/follow`,
        headers: alice.headers,
      });
      expect(followRes.statusCode).toBe(204);

      const resProfileFollow = await app.inject({
        method: "GET",
        url: `/users/${bob.user.id}`,
      });
      expect(JSON.parse(resProfileFollow.body).data.gourme_points).toBe(15);

      // 3. Bob posts a review
      // Base review = 5 GP
      // Optional ratings = 4 GP (Ambience, Taste, Service, Value)
      // Notes length > 100 = 2 GP
      // Total post points = 5 + 4 + 2 = 11 GP
      // Global GP = 15 (follower) + 11 (post) = 26 GP
      const longNotes = "This is a super detailed review that is definitely going to be longer than 100 characters so that I can earn the completeness bonus for my Gourmet Points!".repeat(2);
      const entryRes = await app.inject({
        method: "POST",
        url: "/entries",
        headers: bob.headers,
        payload: {
          restaurant_name: "Deluxe Burger",
          city: "Paris",
          country: "France",
          price_level: 3,
          rating: 9,
          rating_ambience: 8,
          rating_taste: 9,
          rating_service: 8,
          rating_value: 9,
          notes: longNotes,
          visibility: "public",
          food_items: [],
        },
      });
      expect(entryRes.statusCode).toBe(201);
      const entry = JSON.parse(entryRes.body).data;

      const resProfilePost = await app.inject({
        method: "GET",
        url: `/users/${bob.user.id}`,
      });
      expect(JSON.parse(resProfilePost.body).data.gourme_points).toBe(26);

      // 4. Alice likes Bob's review -> Bob gets +1 GP (26 + 1 = 27 GP)
      const likeRes = await app.inject({
        method: "POST",
        url: `/entries/${entry.id}/like`,
        headers: alice.headers,
      });
      expect(likeRes.statusCode).toBe(200);

      const resProfileLike = await app.inject({
        method: "GET",
        url: `/users/${bob.user.id}`,
      });
      expect(JSON.parse(resProfileLike.body).data.gourme_points).toBe(27);

      // 5. Alice comments on Bob's review -> Bob gets +2 GP (27 + 2 = 29 GP)
      const commentRes = await app.inject({
        method: "POST",
        url: `/entries/${entry.id}/comments`,
        headers: alice.headers,
        payload: {
          content: "Wow, delicious burgers!",
        },
      });
      expect(commentRes.statusCode).toBe(201);
      const comment = JSON.parse(commentRes.body).data;

      const resProfileComment = await app.inject({
        method: "GET",
        url: `/users/${bob.user.id}`,
      });
      expect(JSON.parse(resProfileComment.body).data.gourme_points).toBe(29);

      // 6. Delete comment -> Bob's GP goes back to 27
      const deleteCommentRes = await app.inject({
        method: "DELETE",
        url: `/entries/${entry.id}/comments/${comment.id}`,
        headers: alice.headers,
      });
      expect(deleteCommentRes.statusCode).toBe(200);

      const resProfileDelComment = await app.inject({
        method: "GET",
        url: `/users/${bob.user.id}`,
      });
      expect(JSON.parse(resProfileDelComment.body).data.gourme_points).toBe(27);

      // 7. Delete Bob's review -> all likes, comments are deleted, review is deleted
      // Bob's GP should revert back to 15 (follower only)
      const deleteEntryRes = await app.inject({
        method: "DELETE",
        url: `/entries/${entry.id}`,
        headers: bob.headers,
      });
      expect(deleteEntryRes.statusCode).toBe(204);

      const resProfileDelEntry = await app.inject({
        method: "GET",
        url: `/users/${bob.user.id}`,
      });
      expect(JSON.parse(resProfileDelEntry.body).data.gourme_points).toBe(15);

      // 8. Alice unfollows Bob -> Bob's GP reverts to 0
      const unfollowRes = await app.inject({
        method: "DELETE",
        url: `/users/${bob.user.id}/follow`,
        headers: alice.headers,
      });
      expect(unfollowRes.statusCode).toBe(204);

      const resProfileFinal = await app.inject({
        method: "GET",
        url: `/users/${bob.user.id}`,
      });
      expect(JSON.parse(resProfileFinal.body).data.gourme_points).toBe(0);
    });
  });
});
