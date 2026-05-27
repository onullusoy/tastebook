import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, truncateTables, createTestUserWithAuth } from "../../../test/helpers/setup";
import { follows, users } from "@tastebook/db";
import { eq } from "drizzle-orm";

describe("Social Module Integration Tests", () => {
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

  it("POST /users/:id/follow — alice follows bob → 204", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    const res = await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(204);
  });

  it("POST /users/:id/follow — follow again → 409", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    const res = await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(409);
  });

  it("POST /users/:id/follow — follow self → 422", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });

    const res = await app.inject({
      method: "POST",
      url: `/users/${alice.user.id}/follow`,
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(422);
  });

  it("POST /users/:id/follow — follow nonexistent user → 404", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const nonexistentId = "00000000-0000-0000-0000-000000000000";

    const res = await app.inject({
      method: "POST",
      url: `/users/${nonexistentId}/follow`,
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(404);
  });

  it("POST /users/:id/follow — no auth → 401", async () => {
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    const res = await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
    });

    expect(res.statusCode).toBe(401);
  });

  it("DELETE /users/:id/follow — alice unfollows bob (was following) → 204", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(204);
  });

  it("DELETE /users/:id/follow — unfollow when not following → 404", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    const res = await app.inject({
      method: "DELETE",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(404);
  });

  it("Friend detection — alice follows bob → bob's profile shows is_following:true, is_friend:false", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    const res = await app.inject({
      method: "GET",
      url: `/users/${bob.user.id}`,
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.is_following).toBe(true);
    expect(body.data.is_friend).toBe(false);
  });

  it("Friend detection — bob follows alice back → alice's profile shows is_following:true, is_friend:true", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    await app.inject({
      method: "POST",
      url: `/users/${alice.user.id}/follow`,
      headers: bob.headers,
    });

    const res = await app.inject({
      method: "GET",
      url: `/users/${alice.user.id}`,
      headers: bob.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.is_following).toBe(true);
    expect(body.data.is_friend).toBe(true);
  });

  it("Friend detection — alice unfollows bob → bob's profile shows is_following:false, is_friend:false", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    await app.inject({
      method: "POST",
      url: `/users/${alice.user.id}/follow`,
      headers: bob.headers,
    });

    await app.inject({
      method: "DELETE",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    const res = await app.inject({
      method: "GET",
      url: `/users/${bob.user.id}`,
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.is_following).toBe(false);
    expect(body.data.is_friend).toBe(false);
  });

  it("Lists — GET /users/:id/followers → returns paginated list", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    const res = await app.inject({
      method: "GET",
      url: `/users/${bob.user.id}/followers`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(alice.user.id);
  });

  it("Lists — GET /users/:id/following → returns paginated list", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    const res = await app.inject({
      method: "GET",
      url: `/users/${alice.user.id}/following`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(bob.user.id);
  });

  it("Lists — GET /users/:id/friends → returns only mutual follows", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const carol = await createTestUserWithAuth(app, { username: "carol", email: "carol@example.com" });

    await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });
    await app.inject({
      method: "POST",
      url: `/users/${carol.user.id}/follow`,
      headers: alice.headers,
    });

    await app.inject({
      method: "POST",
      url: `/users/${alice.user.id}/follow`,
      headers: bob.headers,
    });

    const res = await app.inject({
      method: "GET",
      url: `/users/${alice.user.id}/friends`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(bob.user.id);
  });

  it("Lists — cursor pagination works on follower list", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const carol = await createTestUserWithAuth(app, { username: "carol", email: "carol@example.com" });

    await app.inject({
      method: "POST",
      url: `/users/${alice.user.id}/follow`,
      headers: bob.headers,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await app.inject({
      method: "POST",
      url: `/users/${alice.user.id}/follow`,
      headers: carol.headers,
    });

    const resPage1 = await app.inject({
      method: "GET",
      url: `/users/${alice.user.id}/followers?limit=1`,
    });

    expect(resPage1.statusCode).toBe(200);
    const body1 = JSON.parse(resPage1.body);
    expect(body1.data.length).toBe(1);
    expect(body1.cursor).toBeDefined();

    const resPage2 = await app.inject({
      method: "GET",
      url: `/users/${alice.user.id}/followers?limit=1&cursor=${body1.cursor}`,
    });

    expect(resPage2.statusCode).toBe(200);
    const body2 = JSON.parse(resPage2.body);
    expect(body2.data.length).toBe(1);
  });

  it("Edge cases — unfollow after follow → counts correct", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    const resProfile1 = await app.inject({
      method: "GET",
      url: `/users/${bob.user.id}`,
    });
    const profile1 = JSON.parse(resProfile1.body).data;
    expect(profile1.follower_count).toBe(1);

    await app.inject({
      method: "DELETE",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    const resProfile2 = await app.inject({
      method: "GET",
      url: `/users/${bob.user.id}`,
    });
    const profile2 = JSON.parse(resProfile2.body).data;
    expect(profile2.follower_count).toBe(0);
  });

  it("Edge cases — cascading delete of user removes follow relationships", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    const beforeCount = await app.db.select().from(follows);
    expect(beforeCount.length).toBe(1);

    await app.db.delete(users).where(eq(users.id, alice.user.id));

    const afterCount = await app.db.select().from(follows);
    expect(afterCount.length).toBe(0);
  });
});
