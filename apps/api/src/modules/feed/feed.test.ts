import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, truncateTables, createTestUserWithAuth } from "../../../test/helpers/setup";
import { tasteEntries, follows, entryMedia } from "@tastebook/db";
import { eq } from "drizzle-orm";

describe("Feed Module Integration Tests", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await truncateTables(app.db);
    await app.redis.flushall();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createEntry(userId: string, data: Partial<typeof tasteEntries.$inferInsert>) {
    const [inserted] = await app.db
      .insert(tasteEntries)
      .values({
        userId,
        dishName: data.dishName ?? "Dish",
        restaurantName: data.restaurantName ?? "Restaurant",
        city: data.city ?? "City",
        country: data.country ?? "Country",
        rating: data.rating ?? 5,
        visibility: data.visibility ?? "public",
        createdAt: data.createdAt ?? new Date(),
      })
      .returning();
    return inserted;
  }

  async function establishFollow(followerId: string, followingId: string) {
    await app.db.insert(follows).values({ followerId, followingId });
  }

  it("1. GET /feed - unauthorized without token -> 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/feed",
    });
    expect(res.statusCode).toBe(401);
  });

  it("2. GET /feed - follows nobody fallback to public feed -> 200", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await createEntry(bob.user.id, { dishName: "Public Pasta", visibility: "public" });
    await createEntry(bob.user.id, { dishName: "Private Pasta", visibility: "private" });

    const res = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].dish_name).toBe("Public Pasta");
  });

  it("3. GET /feed - user follows somebody and receives own entries -> 200", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await establishFollow(alice.user.id, bob.user.id);
    await createEntry(alice.user.id, { dishName: "Own Burger", visibility: "private" });

    const res = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].dish_name).toBe("Own Burger");
  });

  it("4. GET /feed - receives public entries from followed users", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await establishFollow(alice.user.id, bob.user.id);
    await createEntry(bob.user.id, { dishName: "Bob Public", visibility: "public" });

    const res = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].dish_name).toBe("Bob Public");
  });

  it("5. GET /feed - receives friends entries from followed mutual friends", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await establishFollow(alice.user.id, bob.user.id);
    await establishFollow(bob.user.id, alice.user.id);

    await createEntry(bob.user.id, { dishName: "Bob Friends Only", visibility: "friends" });

    const res = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].dish_name).toBe("Bob Friends Only");
  });

  it("6. GET /feed - does NOT receive friends entries from non-mutual follow", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await establishFollow(alice.user.id, bob.user.id);

    await createEntry(bob.user.id, { dishName: "Bob Friends Only", visibility: "friends" });

    const res = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(0);
  });

  it("7. GET /feed - does NOT receive private entries from followed user", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await establishFollow(alice.user.id, bob.user.id);
    await establishFollow(bob.user.id, alice.user.id);

    await createEntry(bob.user.id, { dishName: "Bob Private", visibility: "private" });

    const res = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(0);
  });

  it("8. GET /feed - receives own private entries", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    await establishFollow(alice.user.id, bob.user.id);

    await createEntry(alice.user.id, { dishName: "My Secret", visibility: "private" });

    const res = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].dish_name).toBe("My Secret");
  });

  it("9. GET /feed - receives own friends entries", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    await establishFollow(alice.user.id, bob.user.id);

    await createEntry(alice.user.id, { dishName: "My Friends Info", visibility: "friends" });

    const res = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].dish_name).toBe("My Friends Info");
  });

  it("10. GET /feed - returns cached result on duplicate call", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    await establishFollow(alice.user.id, bob.user.id);

    await createEntry(bob.user.id, { dishName: "Delicious Soup", visibility: "public" });

    const firstRes = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });
    expect(firstRes.statusCode).toBe(200);

    await createEntry(bob.user.id, { dishName: "Sneaked In", visibility: "public" });

    const secondRes = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });
    expect(secondRes.statusCode).toBe(200);
    const body = JSON.parse(secondRes.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].dish_name).toBe("Delicious Soup");
  });

  it("11. GET /feed - caches result by version key and invalidates on update", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    await establishFollow(alice.user.id, bob.user.id);

    await createEntry(bob.user.id, { dishName: "Cached Item", visibility: "public" });

    const firstRes = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });
    expect(firstRes.statusCode).toBe(200);

    await createEntry(bob.user.id, { dishName: "New Fresh Item", visibility: "public" });

    await app.inject({
      method: "POST",
      url: `/users/${bob.user.id}/follow`,
      headers: alice.headers,
    });

    const versionKey = `feed_version:${alice.user.id}`;
    await app.redis.incr(versionKey);

    const secondRes = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });
    expect(secondRes.statusCode).toBe(200);
    const body = JSON.parse(secondRes.body);
    expect(body.data.length).toBe(2);
  });

  it("12. GET /feed - cursor pagination limit + 1 check", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    await establishFollow(alice.user.id, bob.user.id);

    for (let i = 1; i <= 5; i++) {
      await createEntry(bob.user.id, { dishName: `Dish ${i}`, visibility: "public", createdAt: new Date(Date.now() + i * 1000) });
    }

    const res = await app.inject({
      method: "GET",
      url: "/feed?limit=3",
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(3);
    expect(body.cursor).toBeDefined();
  });

  it("13. GET /feed - pagination with cursor works to fetch next page", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    await establishFollow(alice.user.id, bob.user.id);

    for (let i = 1; i <= 5; i++) {
      await createEntry(bob.user.id, { dishName: `Pasta ${i}`, visibility: "public", createdAt: new Date(Date.now() + i * 1000) });
    }

    const firstRes = await app.inject({
      method: "GET",
      url: "/feed?limit=3",
      headers: alice.headers,
    });
    const firstBody = JSON.parse(firstRes.body);
    const cursor = firstBody.cursor;

    const secondRes = await app.inject({
      method: "GET",
      url: `/feed?limit=3&cursor=${cursor}`,
      headers: alice.headers,
    });
    expect(secondRes.statusCode).toBe(200);
    const secondBody = JSON.parse(secondRes.body);
    expect(secondBody.data.length).toBe(2);
  });

  it("14. GET /feed - invalid cursor format returns 400 or 422 error", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const res = await app.inject({
      method: "GET",
      url: "/feed?cursor=invalid_base64_string",
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(422);
  });

  it("15. GET /feed - media files are populated and formatted correctly in response", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    await establishFollow(alice.user.id, bob.user.id);

    const entry = await createEntry(bob.user.id, { dishName: "Gourmet Pizza", visibility: "public" });

    await app.db.insert(entryMedia).values({
      entryId: entry.id,
      userId: bob.user.id,
      url: "media-file-url",
      mimeType: "image/jpeg",
      orderIndex: 0,
    });

    const res = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].media.length).toBe(1);
    expect(body.data[0].media[0].mime_type).toBe("image/jpeg");
  });

  it("16. GET /feed - public feed only returns public entries regardless of follow status", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await createEntry(bob.user.id, { dishName: "Public Steak", visibility: "public" });
    await createEntry(bob.user.id, { dishName: "Friends Steak", visibility: "friends" });

    const res = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].dish_name).toBe("Public Steak");
  });

  it("17. GET /feed - public feed caches response correctly with its own TTL", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await createEntry(bob.user.id, { dishName: "Cache 1", visibility: "public" });

    const firstRes = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });
    expect(firstRes.statusCode).toBe(200);

    await createEntry(bob.user.id, { dishName: "Cache 2", visibility: "public" });

    const secondRes = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });
    expect(secondRes.statusCode).toBe(200);
    const body = JSON.parse(secondRes.body);
    expect(body.data.length).toBe(1);
  });

  it("18. GET /feed - entries order is strictly descending by created_at then id", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    await establishFollow(alice.user.id, bob.user.id);

    const now = Date.now();
    const entry1 = await createEntry(bob.user.id, { dishName: "First", visibility: "public", createdAt: new Date(now) });
    const entry2 = await createEntry(bob.user.id, { dishName: "Second", visibility: "public", createdAt: new Date(now + 5000) });
    const entry3 = await createEntry(bob.user.id, { dishName: "Third", visibility: "public", createdAt: new Date(now + 10000) });

    const res = await app.inject({
      method: "GET",
      url: "/feed",
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].dish_name).toBe("Third");
    expect(body.data[1].dish_name).toBe("Second");
    expect(body.data[2].dish_name).toBe("First");
  });
});
