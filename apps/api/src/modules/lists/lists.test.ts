import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, truncateTables, createTestUserWithAuth } from "../../../test/helpers/setup";
import { follows, lists, listItems, restaurants, listLikes } from "@tastebook/db";
import { eq } from "drizzle-orm";
import { normalizeCityName } from "@tastebook/shared";

describe("Lists Module Integration Tests", () => {
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

  async function establishFollow(followerId: string, followingId: string) {
    await app.db.insert(follows).values({ followerId, followingId });
  }

  async function makeMutualFollow(userAId: string, userBId: string) {
    await establishFollow(userAId, userBId);
    await establishFollow(userBId, userAId);
  }

  async function createRestaurant(placeId: string, name: string) {
    const [inserted] = await app.db
      .insert(restaurants)
      .values({
        googlePlaceId: placeId,
        name,
        city: "City",
        country: "Country",
        ratingAvg: "4.5",
        ratingCount: 10,
        priceLevelAvg: "2.0",
        atmosphereTags: ["casual"],
        metadata: {},
      })
      .returning();
    return inserted;
  }

  it("1. POST /lists - unauthorized -> 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/lists",
      payload: { title: "My List" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("2. POST /lists - valid public list -> 201", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const res = await app.inject({
      method: "POST",
      url: "/lists",
      headers: alice.headers,
      payload: {
        title: "Top Burgers",
        description: "Best burgers in town",
        visibility: "public",
        metadata: { cities: ["Izmir", "Kiel"] }
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.title).toBe("Top Burgers");
    expect(body.data.visibility).toBe("public");
    expect(body.data.user.id).toBe(alice.user.id);
    expect(body.data.metadata.cities).toEqual(["Izmir", "Kiel"]);
  });

  it("3. POST /lists - validation failure (empty title) -> 422", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const res = await app.inject({
      method: "POST",
      url: "/lists",
      headers: alice.headers,
      payload: {
        title: "",
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it("4. POST /lists - limit 50 lists per user -> 422 (ValidationError)", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const listsToInsert = Array.from({ length: 50 }, (_, i) => ({
      userId: alice.user.id,
      title: `List ${i}`,
      visibility: "public" as const,
    }));
    await app.db.insert(lists).values(listsToInsert);

    const res = await app.inject({
      method: "POST",
      url: "/lists",
      headers: alice.headers,
      payload: {
        title: "Fifty First List",
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it("5. GET /lists/:id - view own private list -> 200", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "My Secrets",
      visibility: "private",
    }).returning();

    const res = await app.inject({
      method: "GET",
      url: `/lists/${list.id}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.title).toBe("My Secrets");
  });

  it("6. GET /lists/:id - stranger viewing private list -> 404 (NotFoundError)", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Bob Secrets",
      visibility: "private",
    }).returning();

    const res = await app.inject({
      method: "GET",
      url: `/lists/${list.id}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it("7. GET /lists/:id - stranger viewing public list -> 200", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Bob Public",
      visibility: "public",
    }).returning();

    const res = await app.inject({
      method: "GET",
      url: `/lists/${list.id}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.title).toBe("Bob Public");
  });

  it("8. GET /lists/:id - non-friend viewing friends list -> 404", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Bob Friends",
      visibility: "friends",
    }).returning();

    const res = await app.inject({
      method: "GET",
      url: `/lists/${list.id}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it("9. GET /lists/:id - mutual friend viewing friends list -> 200", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    await makeMutualFollow(alice.user.id, bob.user.id);

    const [list] = await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Bob Friends",
      visibility: "friends",
    }).returning();

    const res = await app.inject({
      method: "GET",
      url: `/lists/${list.id}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.title).toBe("Bob Friends");
  });

  it("10. GET /lists/:id - list not found -> 404", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const res = await app.inject({
      method: "GET",
      url: "/lists/00000000-0000-0000-0000-000000000000",
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it("11. PATCH /lists/:id - unauthorized -> 401", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/lists/00000000-0000-0000-0000-000000000000",
      payload: { title: "New" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("12. PATCH /lists/:id - update own list (title and visibility) -> 200", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "Old Title",
      visibility: "public",
    }).returning();

    const res = await app.inject({
      method: "PATCH",
      url: `/lists/${list.id}`,
      headers: alice.headers,
      payload: {
        title: "New Title",
        visibility: "friends",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.title).toBe("New Title");
    expect(body.data.visibility).toBe("friends");
  });

  it("13. PATCH /lists/:id - update someone else's list -> 403 (ForbiddenError)", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Bob's list",
      visibility: "public",
    }).returning();

    const res = await app.inject({
      method: "PATCH",
      url: `/lists/${list.id}`,
      headers: alice.headers,
      payload: {
        title: "Stolen",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("14. DELETE /lists/:id - unauthorized -> 401", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/lists/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(401);
  });

  it("15. DELETE /lists/:id - delete own list -> 204", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "To Delete",
      visibility: "public",
    }).returning();

    const res = await app.inject({
      method: "DELETE",
      url: `/lists/${list.id}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(204);
  });

  it("16. DELETE /lists/:id - delete someone else's list -> 403", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Bob's",
      visibility: "public",
    }).returning();

    const res = await app.inject({
      method: "DELETE",
      url: `/lists/${list.id}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(403);
  });

  // ===== Restaurant List Item Tests =====

  it("17. POST /lists/:id/items - unauthorized -> 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/lists/00000000-0000-0000-0000-000000000000/items",
      payload: { restaurant_id: "place123" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("18. POST /lists/:id/items - add restaurant to own list -> 201", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "My Favourites",
      visibility: "public",
    }).returning();

    const restaurant = await createRestaurant("place123", "Tacos");

    const res = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      headers: alice.headers,
      payload: {
        restaurant_id: restaurant.googlePlaceId,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("19. POST /lists/:id/items - add restaurant to someone else's list -> 403", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Bob Favourites",
      visibility: "public",
    }).returning();

    const restaurant = await createRestaurant("place123", "Tacos");

    const res = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      headers: alice.headers,
      payload: {
        restaurant_id: restaurant.googlePlaceId,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("20. POST /lists/:id/items - add same restaurant again -> 409 (ConflictError)", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "Unique List",
      visibility: "public",
    }).returning();

    const restaurant = await createRestaurant("place123", "Sushi");

    await app.db.insert(listItems).values({
      listId: list.id,
      restaurantId: restaurant.googlePlaceId,
      orderIndex: 0,
    });

    const res = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      headers: alice.headers,
      payload: {
        restaurant_id: restaurant.googlePlaceId,
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("21. POST /lists/:id/items - max 100 items limit -> 422 (ValidationError)", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "Cap List",
      visibility: "public",
    }).returning();

    for (let i = 0; i < 100; i++) {
      const rest = await createRestaurant(`place_${i}`, `Dish ${i}`);
      await app.db.insert(listItems).values({
        listId: list.id,
        restaurantId: rest.googlePlaceId,
        orderIndex: i,
      });
    }

    const finalRestaurant = await createRestaurant("place_excess", "Excess");
    const res = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      headers: alice.headers,
      payload: {
        restaurant_id: finalRestaurant.googlePlaceId,
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it("22. DELETE /lists/:id/items/:restaurantId - remove item from own list -> 204", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "Removable",
      visibility: "public",
    }).returning();

    const restaurant = await createRestaurant("place123", "Soup");
    await app.db.insert(listItems).values({
      listId: list.id,
      restaurantId: restaurant.googlePlaceId,
      orderIndex: 0,
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/lists/${list.id}/items/${restaurant.googlePlaceId}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(204);
  });

  it("23. DELETE /lists/:id/items/:restaurantId - remove item from someone else's list -> 403", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Bob List",
      visibility: "public",
    }).returning();

    const restaurant = await createRestaurant("place123", "Soup");
    await app.db.insert(listItems).values({
      listId: list.id,
      restaurantId: restaurant.googlePlaceId,
      orderIndex: 0,
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/lists/${list.id}/items/${restaurant.googlePlaceId}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(403);
  });

  it("24. DELETE /lists/:id/items/:restaurantId - remove non-existent item -> 404", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "Empty",
      visibility: "public",
    }).returning();

    const res = await app.inject({
      method: "DELETE",
      url: `/lists/${list.id}/items/place_not_exist`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it("25. PATCH /lists/:id/items/reorder - reorder items correctly -> 200", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "Ordering List",
      visibility: "public",
    }).returning();

    const r1 = await createRestaurant("place_a", "Item A");
    const r2 = await createRestaurant("place_b", "Item B");

    await app.db.insert(listItems).values({ listId: list.id, restaurantId: r1.googlePlaceId, orderIndex: 0 });
    await app.db.insert(listItems).values({ listId: list.id, restaurantId: r2.googlePlaceId, orderIndex: 1 });

    const res = await app.inject({
      method: "PATCH",
      url: `/lists/${list.id}/items/reorder`,
      headers: alice.headers,
      payload: {
        item_ids: [r2.googlePlaceId, r1.googlePlaceId],
      },
    });
    expect(res.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: `/lists/${list.id}`,
      headers: alice.headers,
    });
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.items[0].google_place_id).toBe(r2.googlePlaceId);
    expect(getBody.data.items[1].google_place_id).toBe(r1.googlePlaceId);
  });

  it("26. PATCH /lists/:id/items/reorder - reorder mismatch ids -> 422", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "Ordering List 2",
      visibility: "public",
    }).returning();

    const r1 = await createRestaurant("place_a", "Item A");
    await app.db.insert(listItems).values({ listId: list.id, restaurantId: r1.googlePlaceId, orderIndex: 0 });

    const res = await app.inject({
      method: "PATCH",
      url: `/lists/${list.id}/items/reorder`,
      headers: alice.headers,
      payload: {
        item_ids: ["place_not_exist"],
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it("27. GET /users/:id/lists - list lists for a user filtered by visibility -> 200", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await app.db.insert(lists).values({ userId: bob.user.id, title: "Bob Pub", visibility: "public" });
    await app.db.insert(lists).values({ userId: bob.user.id, title: "Bob Priv", visibility: "private" });

    const res = await app.inject({
      method: "GET",
      url: `/users/${bob.user.id}/lists`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].title).toBe("Bob Pub");
  });

  // ===== Social Layer & Likes integration tests =====

  it("28. POST /lists/:id/like & DELETE /lists/:id/like -> success", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    const [list] = await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Bob Public List",
      visibility: "public",
    }).returning();

    // Like
    const likeRes = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/like`,
      headers: alice.headers,
    });
    expect(likeRes.statusCode).toBe(200);

    // Get detail and verify liked & count
    const getRes1 = await app.inject({
      method: "GET",
      url: `/lists/${list.id}`,
      headers: alice.headers,
    });
    const body1 = JSON.parse(getRes1.body);
    expect(body1.data.likes_count).toBe(1);
    expect(body1.data.is_liked).toBe(true);

    // Unlike
    const unlikeRes = await app.inject({
      method: "DELETE",
      url: `/lists/${list.id}/like`,
      headers: alice.headers,
    });
    expect(unlikeRes.statusCode).toBe(200);

    // Verify again
    const getRes2 = await app.inject({
      method: "GET",
      url: `/lists/${list.id}`,
      headers: alice.headers,
    });
    const body2 = JSON.parse(getRes2.body);
    expect(body2.data.likes_count).toBe(0);
    expect(body2.data.is_liked).toBe(false);
  });

  // ===== Global retrieval & Filtering integration tests =====

  it("29. GET /lists - type=public & filtering by city -> 200", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

    await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Izmir Pizza Curations",
      visibility: "public",
      metadata: { cities: ["Izmir", "Cesme"] }
    });

    await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Istanbul Kebab Curations",
      visibility: "public",
      metadata: { cities: ["Istanbul"] }
    });

    // Public list retrieval
    const res1 = await app.inject({
      method: "GET",
      url: "/lists?type=public",
      headers: alice.headers,
    });
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.data.length).toBe(2);

    // Filter by city
    const res2 = await app.inject({
      method: "GET",
      url: "/lists?type=public&city=Izmir",
      headers: alice.headers,
    });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.data.length).toBe(1);
    expect(body2.data[0].title).toBe("Izmir Pizza Curations");
  });

  // ===== City Name Normalization Tests =====

  it("30. normalizeCityName - Turkish characters capitalization check", () => {
    expect(normalizeCityName("istanbul")).toBe("İstanbul");
    expect(normalizeCityName("İSTANBUL")).toBe("İstanbul");
    expect(normalizeCityName("ısparta")).toBe("Isparta");
    expect(normalizeCityName("ISPARTA")).toBe("Isparta");
    expect(normalizeCityName("izmir")).toBe("İzmir");
    expect(normalizeCityName("İZMİR")).toBe("İzmir");
    expect(normalizeCityName("afyonkarahisar")).toBe("Afyonkarahisar");
    expect(normalizeCityName("ŞANLIURFA")).toBe("Şanlıurfa");
    expect(normalizeCityName("  muğla   bodrum  ")).toBe("Muğla Bodrum");
  });
});
