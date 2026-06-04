import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { createTestApp, truncateTables, createTestUserWithAuth } from "../../../test/helpers/setup";
import { follows, entryMedia, tasteEntries } from "@tastebook/db";
import { eq } from "drizzle-orm";
import { TINY_JPEG } from "../../../test/helpers/fixtures";

/** Helper: build a valid entry payload with sensible defaults */
function entryPayload(overrides: Record<string, any> = {}) {
  return {
    restaurant_name: "Test Restaurant",
    city: "Istanbul",
    country: "Turkey",
    price_level: 3,
    rating: 8,
    food_items: [{ name: "Test Dish" }],
    visibility: "public",
    ...overrides,
  };
}

describe("Taste Entries Integration Tests", () => {
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

  async function makeMutualFollow(userAId: string, userBId: string) {
    await app.db.insert(follows).values({
      followerId: userAId,
      followingId: userBId,
    });
    await app.db.insert(follows).values({
      followerId: userBId,
      followingId: userAId,
    });
  }

  async function uploadMedia(userHeaders: any): Promise<string> {
    const res = await request(app.server)
      .post("/media/upload")
      .set("Authorization", userHeaders.Authorization)
      .attach("file", TINY_JPEG, { filename: "test.jpg", contentType: "image/jpeg" });
    return res.body.data.id;
  }

  describe("Create Taste Entry (8 cases)", () => {
    it("✓ valid with food_items, no media → 201", async () => {
      const alice = await createTestUserWithAuth(app);
      const res = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({
          restaurant_name: "El Primo",
          city: "Austin",
          country: "USA",
          price_level: 2,
          rating: 9,
          food_items: [
            { name: "Street Tacos", notes: "Amazing corn tortillas" },
            { name: "Elote" },
          ],
          atmosphere_tags: ["local", "casual"],
          notes: "Amazing street food!",
        }));

      expect(res.status).toBe(201);
      expect(res.body.data.restaurant_name).toBe("El Primo");
      expect(res.body.data.city).toBe("Austin");
      expect(res.body.data.price_level).toBe(2);
      expect(res.body.data.rating).toBe(9);
      expect(res.body.data.food_items.length).toBe(2);
      expect(res.body.data.food_items[0].name).toBe("Street Tacos");
      expect(res.body.data.food_items[0].notes).toBe("Amazing corn tortillas");
      expect(res.body.data.food_items[1].name).toBe("Elote");
      expect(res.body.data.atmosphere_tags).toEqual(["local", "casual"]);
      expect(res.body.data.user.id).toBe(alice.user.id);
      expect(res.body.data.media).toEqual([]);
    });

    it("✓ valid with sub-ratings → 201", async () => {
      const alice = await createTestUserWithAuth(app);
      const res = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({
          rating: 9,
          rating_ambience: 8,
          rating_taste: 10,
          rating_service: 7,
          rating_value: 6,
        }));

      expect(res.status).toBe(201);
      expect(res.body.data.rating).toBe(9);
      expect(res.body.data.rating_ambience).toBe(8);
      expect(res.body.data.rating_taste).toBe(10);
      expect(res.body.data.rating_service).toBe(7);
      expect(res.body.data.rating_value).toBe(6);
    });

    it("✓ valid with 3 media_ids → 201, media attached in order", async () => {
      const alice = await createTestUserWithAuth(app);
      const m1 = await uploadMedia(alice.headers);
      const m2 = await uploadMedia(alice.headers);
      const m3 = await uploadMedia(alice.headers);

      const res = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({
          media_ids: [m1, m2, m3],
        }));

      expect(res.status).toBe(201);
      expect(res.body.data.media.length).toBe(3);
      expect(res.body.data.media[0].id).toBe(m1);
      expect(res.body.data.media[1].id).toBe(m2);
      expect(res.body.data.media[2].id).toBe(m3);
    });

    it("✓ >5 media_ids → 422", async () => {
      const alice = await createTestUserWithAuth(app);
      const res = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({
          media_ids: [
            "00000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-0000-000000000002",
            "00000000-0000-0000-0000-000000000003",
            "00000000-0000-0000-0000-000000000004",
            "00000000-0000-0000-0000-000000000005",
            "00000000-0000-0000-0000-000000000006",
          ],
        }));

      expect(res.status).toBe(422);
    });

    it("✓ invalid media_id (not owned) → 422", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
      const bobMedia = await uploadMedia(bob.headers);

      const res = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({
          media_ids: [bobMedia],
        }));

      expect(res.status).toBe(422);
    });

    it("✓ missing required fields → 422", async () => {
      const alice = await createTestUserWithAuth(app);
      const res = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({
          rating: 8,
        });

      expect(res.status).toBe(422);
    });

    it("✓ rating out of range (11) → 422", async () => {
      const alice = await createTestUserWithAuth(app);
      const res = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ rating: 11 }));

      expect(res.status).toBe(422);
    });

    it("✓ no auth → 401", async () => {
      const res = await request(app.server)
        .post("/entries")
        .send(entryPayload());

      expect(res.status).toBe(401);
    });
  });

  describe("Read Taste Entry (7 cases)", () => {
    it("✓ public entry, no auth → 200", async () => {
      const alice = await createTestUserWithAuth(app);
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ visibility: "public" }));

      const res = await request(app.server).get(`/entries/${entryRes.body.data.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.restaurant_name).toBe("Test Restaurant");
      expect(res.body.data.food_items.length).toBeGreaterThan(0);
    });

    it("✓ public entry, authenticated → 200", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ visibility: "public" }));

      const res = await request(app.server)
        .get(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", bob.headers.Authorization);

      expect(res.status).toBe(200);
    });

    it("✓ friends-only, viewer is friend → 200", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
      await makeMutualFollow(alice.user.id, bob.user.id);

      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ visibility: "friends" }));

      const res = await request(app.server)
        .get(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", bob.headers.Authorization);

      expect(res.status).toBe(200);
    });

    it("✓ friends-only, viewer is not friend → 404", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ visibility: "friends" }));

      const res = await request(app.server)
        .get(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", bob.headers.Authorization);

      expect(res.status).toBe(404);
    });

    it("✓ private, viewer is owner → 200", async () => {
      const alice = await createTestUserWithAuth(app);
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ visibility: "private" }));

      const res = await request(app.server)
        .get(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", alice.headers.Authorization);

      expect(res.status).toBe(200);
    });

    it("✓ private, viewer is not owner → 404", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ visibility: "private" }));

      const res = await request(app.server)
        .get(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", bob.headers.Authorization);

      expect(res.status).toBe(404);
    });

    it("✓ nonexistent ID → 404", async () => {
      const res = await request(app.server).get("/entries/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });
  });

  describe("Update Taste Entry (3 cases)", () => {
    it("✓ owner updates rating and food_items → 200", async () => {
      const alice = await createTestUserWithAuth(app);
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({
          food_items: [{ name: "Old Dish" }],
          rating: 5,
        }));

      const res = await request(app.server)
        .patch(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", alice.headers.Authorization)
        .send({
          food_items: [{ name: "New Dish" }, { name: "Another Dish" }],
          rating: 7,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.food_items.length).toBe(2);
      expect(res.body.data.food_items[0].name).toBe("New Dish");
      expect(res.body.data.food_items[1].name).toBe("Another Dish");
      expect(res.body.data.rating).toBe(7);
    });

    it("✓ non-owner → 403", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload());

      const res = await request(app.server)
        .patch(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", bob.headers.Authorization)
        .send({ rating: 1 });

      expect(res.status).toBe(403);
    });

    it("✓ change visibility public to private → 200", async () => {
      const alice = await createTestUserWithAuth(app);
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ visibility: "public" }));

      const res = await request(app.server)
        .patch(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", alice.headers.Authorization)
        .send({ visibility: "private" });

      expect(res.status).toBe(200);
      expect(res.body.data.visibility).toBe("private");
    });
  });

  describe("Delete Taste Entry (2 cases)", () => {
    it("✓ owner → 204, entry gone", async () => {
      const alice = await createTestUserWithAuth(app);
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload());

      const res = await request(app.server)
        .delete(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", alice.headers.Authorization);

      expect(res.status).toBe(204);

      const checkRes = await request(app.server)
        .get(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", alice.headers.Authorization);
      expect(checkRes.status).toBe(404);
    });

    it("✓ non-owner → 403", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload());

      const res = await request(app.server)
        .delete(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", bob.headers.Authorization);

      expect(res.status).toBe(403);
    });
  });

  describe("List by User (3 cases)", () => {
    it("✓ returns paginated entries with food_items", async () => {
      const alice = await createTestUserWithAuth(app);

      await request(app.server).post("/entries").set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ food_items: [{ name: "Dish E1" }], rating: 5 }));
      await request(app.server).post("/entries").set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ food_items: [{ name: "Dish E2" }], rating: 6 }));
      await request(app.server).post("/entries").set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ food_items: [{ name: "Dish E3" }], rating: 7 }));

      const res = await request(app.server).get(`/users/${alice.user.id}/entries`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
      expect(res.body.data[0].food_items[0].name).toBe("Dish E3");
    });

    it("✓ cursor pagination works", async () => {
      const alice = await createTestUserWithAuth(app);

      await request(app.server).post("/entries").set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ food_items: [{ name: "E1" }], rating: 5 }));
      await request(app.server).post("/entries").set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ food_items: [{ name: "E2" }], rating: 6 }));
      await request(app.server).post("/entries").set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ food_items: [{ name: "E3" }], rating: 7 }));

      const resPage1 = await request(app.server)
        .get(`/users/${alice.user.id}/entries`)
        .query({ limit: 2 });

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.data.length).toBe(2);
      expect(resPage1.body.data[0].food_items[0].name).toBe("E3");
      expect(resPage1.body.data[1].food_items[0].name).toBe("E2");
      expect(resPage1.body.cursor).toBeDefined();

      const resPage2 = await request(app.server)
        .get(`/users/${alice.user.id}/entries`)
        .query({ limit: 2, cursor: resPage1.body.cursor });

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data.length).toBe(1);
      expect(resPage2.body.data[0].food_items[0].name).toBe("E1");
      expect(resPage2.body.cursor).toBeUndefined();
    });

    it("✓ visibility filtering (non-friend sees only public)", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

      await request(app.server).post("/entries").set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ food_items: [{ name: "Public Entry" }], rating: 5, visibility: "public" }));
      await request(app.server).post("/entries").set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ food_items: [{ name: "Friends Entry" }], rating: 6, visibility: "friends" }));
      await request(app.server).post("/entries").set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ food_items: [{ name: "Private Entry" }], rating: 7, visibility: "private" }));

      const resBob = await request(app.server)
        .get(`/users/${alice.user.id}/entries`)
        .set("Authorization", bob.headers.Authorization);

      expect(resBob.status).toBe(200);
      expect(resBob.body.data.length).toBe(1);
      expect(resBob.body.data[0].food_items[0].name).toBe("Public Entry");

      await makeMutualFollow(alice.user.id, bob.user.id);

      const resBobFriend = await request(app.server)
        .get(`/users/${alice.user.id}/entries`)
        .set("Authorization", bob.headers.Authorization);

      expect(resBobFriend.status).toBe(200);
      expect(resBobFriend.body.data.length).toBe(2);
      expect(resBobFriend.body.data[0].food_items[0].name).toBe("Friends Entry");
      expect(resBobFriend.body.data[1].food_items[0].name).toBe("Public Entry");
    });
  });

  describe("Social Interactions (Likes & Comments)", () => {
    it("✓ toggles like correctly, updates count and polling endpoint", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

      // Alice creates a public entry
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ visibility: "public" }));
      const entryId = entryRes.body.data.id;

      // Bob checks counters initially
      let countRes = await request(app.server)
        .get(`/entries/${entryId}/counters`)
        .set("Authorization", bob.headers.Authorization);
      expect(countRes.status).toBe(200);
      expect(countRes.body.likes_count).toBe(0);
      expect(countRes.body.is_liked).toBe(false);

      // Bob likes the entry
      const likeRes = await request(app.server)
        .post(`/entries/${entryId}/like`)
        .set("Authorization", bob.headers.Authorization);
      expect(likeRes.status).toBe(200);

      // Bob checks counters again
      countRes = await request(app.server)
        .get(`/entries/${entryId}/counters`)
        .set("Authorization", bob.headers.Authorization);
      expect(countRes.status).toBe(200);
      expect(countRes.body.likes_count).toBe(1);
      expect(countRes.body.is_liked).toBe(true);

      // Bob unlikes the entry
      const unlikeRes = await request(app.server)
        .delete(`/entries/${entryId}/like`)
        .set("Authorization", bob.headers.Authorization);
      expect(unlikeRes.status).toBe(200);

      // Bob checks counters after unlike
      countRes = await request(app.server)
        .get(`/entries/${entryId}/counters`)
        .set("Authorization", bob.headers.Authorization);
      expect(countRes.status).toBe(200);
      expect(countRes.body.likes_count).toBe(0);
      expect(countRes.body.is_liked).toBe(false);
    });

    it("✓ adds and lists comments correctly, updates comment count", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

      // Alice creates public entry
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send(entryPayload({ visibility: "public" }));
      const entryId = entryRes.body.data.id;

      // Bob checks counters
      let countRes = await request(app.server)
        .get(`/entries/${entryId}/counters`)
        .set("Authorization", bob.headers.Authorization);
      expect(countRes.body.comments_count).toBe(0);

      // Bob posts a comment
      const commentRes = await request(app.server)
        .post(`/entries/${entryId}/comments`)
        .set("Authorization", bob.headers.Authorization)
        .send({ content: "This is a great place!" });
      expect(commentRes.status).toBe(201);
      expect(commentRes.body.data.content).toBe("This is a great place!");
      expect(commentRes.body.data.user.username).toBe("bob");

      // Bob checks counters after comment
      countRes = await request(app.server)
        .get(`/entries/${entryId}/counters`)
        .set("Authorization", bob.headers.Authorization);
      expect(countRes.body.comments_count).toBe(1);

      // Fetch comments list
      const commentsRes = await request(app.server)
        .get(`/entries/${entryId}/comments`)
        .set("Authorization", bob.headers.Authorization);
      expect(commentsRes.status).toBe(200);
      expect(commentsRes.body.data.length).toBe(1);
      expect(commentsRes.body.data[0].content).toBe("This is a great place!");
      expect(commentsRes.body.data[0].user.username).toBe("bob");
      const commentId = commentsRes.body.data[0].id;

      // Bob deletes his own comment
      const deleteRes = await request(app.server)
        .delete(`/entries/${entryId}/comments/${commentId}`)
        .set("Authorization", bob.headers.Authorization);
      expect(deleteRes.status).toBe(200);

      // Verify comment count decr
      countRes = await request(app.server)
        .get(`/entries/${entryId}/counters`)
        .set("Authorization", bob.headers.Authorization);
      expect(countRes.body.comments_count).toBe(0);

      // Charlie posts comment, Bob tries to delete it (fails), Alice (post owner) deletes it (succeeds)
      const charlie = await createTestUserWithAuth(app, { username: "charlie", email: "charlie@example.com" });
      const commentRes2 = await request(app.server)
        .post(`/entries/${entryId}/comments`)
        .set("Authorization", charlie.headers.Authorization)
        .send({ content: "Charlie's comment" });
      const commentId2 = commentRes2.body.data.id;

      const deleteFailRes = await request(app.server)
        .delete(`/entries/${entryId}/comments/${commentId2}`)
        .set("Authorization", bob.headers.Authorization);
      expect(deleteFailRes.status).toBe(403);

      const deleteSuccessRes = await request(app.server)
        .delete(`/entries/${entryId}/comments/${commentId2}`)
        .set("Authorization", alice.headers.Authorization);
      expect(deleteSuccessRes.status).toBe(200);
    });
  });
});

