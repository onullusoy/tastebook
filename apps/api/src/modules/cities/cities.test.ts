import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, truncateTables, createTestUserWithAuth } from "../../../test/helpers/setup";
import { tasteEntries, follows, restaurants } from "@tastebook/db";
import { sql } from "drizzle-orm";

describe("Cities Module Integration Tests", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await truncateTables(app.db);
    await app.db.execute(sql.raw("TRUNCATE TABLE restaurants CASCADE"));
  });

  afterAll(async () => {
    await app.close();
  });

  async function createRestaurant(placeId: string, name: string, city: string, country: string, countryCode: string) {
    await app.db.insert(restaurants).values({
      googlePlaceId: placeId,
      name,
      city,
      country,
      countryCode,
    }).onConflictDoNothing();
  }

  async function createEntry(userId: string, placeId: string, city: string, rating: number, visibility: "public" | "friends" | "private" = "public") {
    await app.db.insert(tasteEntries).values({
      userId,
      googlePlaceId: placeId,
      restaurantName: "Place Name",
      city,
      country: "France",
      priceLevel: 2,
      rating,
      visibility,
    });
  }

  it("1. GET /api/cities/:cityName/stats - returns stats correctly", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    
    await createRestaurant("p1", "Pizza", "Paris", "France", "FR");
    await createRestaurant("p2", "Sushi", "Paris", "France", "FR");

    await createEntry(alice.user.id, "p1", "Paris", 8, "public");
    await createEntry(alice.user.id, "p2", "Paris", 9, "public");

    const res = await app.inject({
      method: "GET",
      url: `/api/cities/Paris/stats`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total_restaurants).toBe(2);
    expect(body.total_reviews).toBe(2);
    expect(body.country_code).toBe("FR");
  });

  it("2. GET /api/cities/:cityName/rankings/restaurants - returns restaurant sorting correctly", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await createRestaurant("p1", "Pizza", "Paris", "France", "FR");
    await createRestaurant("p2", "Sushi", "Paris", "France", "FR");

    // Sushi: 2 reviews, avg rating = 7
    await createEntry(alice.user.id, "p2", "Paris", 6, "public");
    await createEntry(bob.user.id, "p2", "Paris", 8, "public");

    // Pizza: 1 review, avg rating = 10
    await createEntry(alice.user.id, "p1", "Paris", 10, "public");

    // Popularity sort
    const resPop = await app.inject({
      method: "GET",
      url: `/api/cities/Paris/rankings/restaurants?sortBy=popularity`,
    });
    expect(resPop.statusCode).toBe(200);
    const bodyPop = JSON.parse(resPop.body);
    expect(bodyPop.data[0].google_place_id).toBe("p2"); // more reviews

    // Rating sort
    const resRating = await app.inject({
      method: "GET",
      url: `/api/cities/Paris/rankings/restaurants?sortBy=rating`,
    });
    expect(resRating.statusCode).toBe(200);
    const bodyRating = JSON.parse(resRating.body);
    expect(bodyRating.data[0].google_place_id).toBe("p1"); // higher avg rating
  });

  it("3. GET /api/cities/:cityName/rankings/gourmets - returns public & friends gourmets correctly", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const charlie = await createTestUserWithAuth(app, { username: "charlie", email: "charlie@example.com" });

    // Establish mutual follow between Alice and Bob
    await app.db.insert(follows).values({ followerId: alice.user.id, followingId: bob.user.id });
    await app.db.insert(follows).values({ followerId: bob.user.id, followingId: alice.user.id });

    // Charlie has single follow only (not mutual)
    await app.db.insert(follows).values({ followerId: alice.user.id, followingId: charlie.user.id });

    await createRestaurant("p1", "Pizza", "Paris", "France", "FR");

    // Entries:
    // Alice = 2 public
    await createEntry(alice.user.id, "p1", "Paris", 8, "public");
    await createEntry(alice.user.id, "p1", "Paris", 9, "public");

    // Bob = 3 (2 public, 1 private) -> active count = 2
    await createEntry(bob.user.id, "p1", "Paris", 8, "public");
    await createEntry(bob.user.id, "p1", "Paris", 8, "friends");
    await createEntry(bob.user.id, "p1", "Paris", 9, "private"); // private excluded

    // Charlie = 1 public
    await createEntry(charlie.user.id, "p1", "Paris", 8, "public");

    // Public list
    const resPublic = await app.inject({
      method: "GET",
      url: `/api/cities/Paris/rankings/gourmets?scope=public`,
    });
    expect(resPublic.statusCode).toBe(200);
    const bodyPublic = JSON.parse(resPublic.body);
    // Should contain Alice, Bob, and Charlie
    expect(bodyPublic.data.length).toBe(3);

    // Friends list (requires auth, scoped to mutual follows)
    const resFriends = await app.inject({
      method: "GET",
      url: `/api/cities/Paris/rankings/gourmets?scope=friends`,
      headers: alice.headers,
    });
    expect(resFriends.statusCode).toBe(200);
    const bodyFriends = JSON.parse(resFriends.body);
    // Should ONLY contain Bob (Charlie is not a mutual follower)
    expect(bodyFriends.data.length).toBe(1);
    expect(bodyFriends.data[0].username).toBe("bob");
    expect(bodyFriends.data[0].review_count).toBe(2);
  });
});
