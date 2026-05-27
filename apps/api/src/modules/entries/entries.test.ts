import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { createTestApp, truncateTables, createTestUserWithAuth } from "../../../test/helpers/setup";
import { follows, entryMedia, tasteEntries } from "@tastebook/db";
import { eq } from "drizzle-orm";
import { TINY_JPEG } from "../../../test/helpers/fixtures";

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

  describe("Create Taste Entry (7 cases)", () => {
    it("✓ valid without media → 201", async () => {
      const alice = await createTestUserWithAuth(app);
      const res = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({
          dish_name: "Tacos",
          restaurant_name: "El Primo",
          city: "Austin",
          country: "USA",
          price_level: 2,
          rating: 9,
          notes: "Amazing street tacos!",
          visibility: "public",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.dish_name).toBe("Tacos");
      expect(res.body.data.rating).toBe(9);
      expect(res.body.data.user.id).toBe(alice.user.id);
      expect(res.body.data.media).toEqual([]);
    });

    it("✓ valid with 3 media_ids → 201, media attached in order", async () => {
      const alice = await createTestUserWithAuth(app);
      const m1 = await uploadMedia(alice.headers);
      const m2 = await uploadMedia(alice.headers);
      const m3 = await uploadMedia(alice.headers);

      const res = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({
          dish_name: "Burger",
          restaurant_name: "Hopdoddy",
          city: "Austin",
          country: "USA",
          rating: 8,
          media_ids: [m1, m2, m3],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.media.length).toBe(3);
      expect(res.body.data.media[0].id).toBe(m1);
      expect(res.body.data.media[1].id).toBe(m2);
      expect(res.body.data.media[2].id).toBe(m3);
      expect(res.body.data.media[0].order_index).toBe(0);
      expect(res.body.data.media[1].order_index).toBe(1);
      expect(res.body.data.media[2].order_index).toBe(2);
    });

    it("✓ >5 media_ids → 422", async () => {
      const alice = await createTestUserWithAuth(app);
      const res = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({
          dish_name: "Pizza",
          rating: 8,
          media_ids: [
            "00000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-0000-000000000002",
            "00000000-0000-0000-0000-000000000003",
            "00000000-0000-0000-0000-000000000004",
            "00000000-0000-0000-0000-000000000005",
            "00000000-0000-0000-0000-000000000006",
          ],
        });

      expect(res.status).toBe(422);
    });

    it("✓ invalid media_id (not owned) → 422", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
      const bobMedia = await uploadMedia(bob.headers);

      const res = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({
          dish_name: "Pizza",
          rating: 8,
          media_ids: [bobMedia],
        });

      expect(res.status).toBe(422);
    });

    it("✓ missing dish_name → 422", async () => {
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
        .send({
          dish_name: "Sushi",
          rating: 11,
        });

      expect(res.status).toBe(422);
    });

    it("✓ no auth → 401", async () => {
      const res = await request(app.server)
        .post("/entries")
        .send({
          dish_name: "Sushi",
          rating: 8,
        });

      expect(res.status).toBe(401);
    });
  });

  describe("Read Taste Entry (7 cases)", () => {
    it("✓ public entry, no auth → 200", async () => {
      const alice = await createTestUserWithAuth(app);
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "Tacos", rating: 9, visibility: "public" });

      const res = await request(app.server).get(`/entries/${entryRes.body.data.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.dish_name).toBe("Tacos");
    });

    it("✓ public entry, authenticated → 200", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "Tacos", rating: 9, visibility: "public" });

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
        .send({ dish_name: "Friends Burger", rating: 10, visibility: "friends" });

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
        .send({ dish_name: "Friends Burger", rating: 10, visibility: "friends" });

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
        .send({ dish_name: "Secret Recipe", rating: 10, visibility: "private" });

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
        .send({ dish_name: "Secret Recipe", rating: 10, visibility: "private" });

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
    it("✓ owner updates dish_name → 200", async () => {
      const alice = await createTestUserWithAuth(app);
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "Old Name", rating: 5 });

      const res = await request(app.server)
        .patch(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "New Name", rating: 7 });

      expect(res.status).toBe(200);
      expect(res.body.data.dish_name).toBe("New Name");
      expect(res.body.data.rating).toBe(7);
    });

    it("✓ non-owner → 403", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "Alice Entry", rating: 5 });

      const res = await request(app.server)
        .patch(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", bob.headers.Authorization)
        .send({ dish_name: "Steal Entry" });

      expect(res.status).toBe(403);
    });

    it("✓ change visibility public to private → 200", async () => {
      const alice = await createTestUserWithAuth(app);
      const entryRes = await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "Public Post", rating: 5, visibility: "public" });

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
        .send({ dish_name: "Delete Me", rating: 5 });

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
        .send({ dish_name: "Safe Entry", rating: 5 });

      const res = await request(app.server)
        .delete(`/entries/${entryRes.body.data.id}`)
        .set("Authorization", bob.headers.Authorization);

      expect(res.status).toBe(403);
    });
  });

  describe("List by User (3 cases)", () => {
    it("✓ returns paginated entries", async () => {
      const alice = await createTestUserWithAuth(app);

      await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "E1", rating: 5 });
      await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "E2", rating: 6 });
      await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "E3", rating: 7 });

      const res = await request(app.server).get(`/users/${alice.user.id}/entries`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
      expect(res.body.data[0].dish_name).toBe("E3");
    });

    it("✓ cursor pagination works", async () => {
      const alice = await createTestUserWithAuth(app);

      await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "E1", rating: 5 });
      await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "E2", rating: 6 });
      await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "E3", rating: 7 });

      const resPage1 = await request(app.server)
        .get(`/users/${alice.user.id}/entries`)
        .query({ limit: 2 });

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.data.length).toBe(2);
      expect(resPage1.body.data[0].dish_name).toBe("E3");
      expect(resPage1.body.data[1].dish_name).toBe("E2");
      expect(resPage1.body.cursor).toBeDefined();

      const resPage2 = await request(app.server)
        .get(`/users/${alice.user.id}/entries`)
        .query({ limit: 2, cursor: resPage1.body.cursor });

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data.length).toBe(1);
      expect(resPage2.body.data[0].dish_name).toBe("E1");
      expect(resPage2.body.cursor).toBeUndefined();
    });

    it("✓ visibility filtering (non-friend sees only public)", async () => {
      const alice = await createTestUserWithAuth(app);
      const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });

      await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "Public Entry", rating: 5, visibility: "public" });
      await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "Friends Entry", rating: 6, visibility: "friends" });
      await request(app.server)
        .post("/entries")
        .set("Authorization", alice.headers.Authorization)
        .send({ dish_name: "Private Entry", rating: 7, visibility: "private" });

      const resBob = await request(app.server)
        .get(`/users/${alice.user.id}/entries`)
        .set("Authorization", bob.headers.Authorization);

      expect(resBob.status).toBe(200);
      expect(resBob.body.data.length).toBe(1);
      expect(resBob.body.data[0].dish_name).toBe("Public Entry");

      await makeMutualFollow(alice.user.id, bob.user.id);

      const resBobFriend = await request(app.server)
        .get(`/users/${alice.user.id}/entries`)
        .set("Authorization", bob.headers.Authorization);

      expect(resBobFriend.status).toBe(200);
      expect(resBobFriend.body.data.length).toBe(2);
      expect(resBobFriend.body.data[0].dish_name).toBe("Friends Entry");
      expect(resBobFriend.body.data[1].dish_name).toBe("Public Entry");
    });
  });
});
