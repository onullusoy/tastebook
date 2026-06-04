import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, truncateTables, createTestUserWithAuth } from "../../../test/helpers/setup";
import { tasteEntries, follows, users } from "@tastebook/db";
import { eq } from "drizzle-orm";

describe("Search Module Integration Tests", () => {
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

  async function createEntry(userId: string, city: string, visibility: "public" | "friends" | "private" = "public") {
    await app.db.insert(tasteEntries).values({
      userId,
      restaurantName: "Some Restaurant",
      city,
      country: "Test Country",
      priceLevel: 3,
      rating: 8,
      visibility,
    });
  }

  it("1. GET /search - unauthorized without token -> 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/search?q=Paris",
    });
    expect(res.statusCode).toBe(401);
  });

  it("2. GET /search - returns matching cities and users -> 200", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    await app.db.update(users).set({ displayName: "Bobby" }).where(eq(users.id, bob.user.id));

    await createEntry(bob.user.id, "Paris", "public");
    await createEntry(bob.user.id, "Paris", "private"); // private shouldn't be counted in city search count
    await createEntry(bob.user.id, "Berlin", "public");

    // Search for "par" (case-insensitive test)
    const res = await app.inject({
      method: "GET",
      url: "/search?q=par",
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // Verify cities
    expect(body.data.cities.length).toBe(1);
    expect(body.data.cities[0].city).toBe("Paris");
    expect(body.data.cities[0].count).toBe(1);

    // Search for "bob"
    const resUser = await app.inject({
      method: "GET",
      url: "/search?q=bob",
      headers: alice.headers,
    });

    expect(resUser.statusCode).toBe(200);
    const bodyUser = JSON.parse(resUser.body);
    expect(bodyUser.data.users.length).toBe(1);
    expect(bodyUser.data.users[0].username).toBe("bob");
    expect(bodyUser.data.users[0].display_name).toBe("Bobby");
  });

  it("3. GET /search - populates following and friend flags relative to viewer", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    // Establish follow alice -> bob (so following = true, friend = false)
    await app.db.insert(follows).values({ followerId: alice.user.id, followingId: bob.user.id });

    const res = await app.inject({
      method: "GET",
      url: "/search?q=bob",
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.users[0].is_following).toBe(true);
    expect(body.data.users[0].is_friend).toBe(false);

    // Make mutual (bob -> alice), so friend = true
    await app.db.insert(follows).values({ followerId: bob.user.id, followingId: alice.user.id });

    const resMutual = await app.inject({
      method: "GET",
      url: "/search?q=bob",
      headers: alice.headers,
    });

    expect(resMutual.statusCode).toBe(200);
    const bodyMutual = JSON.parse(resMutual.body);
    expect(bodyMutual.data.users[0].is_following).toBe(true);
    expect(bodyMutual.data.users[0].is_friend).toBe(true);
  });
});
