import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, truncateTables, createTestUserWithAuth } from "../../../test/helpers/setup";
import { tasteEntries, follows, lists, listItems } from "@tastebook/db";
import { eq } from "drizzle-orm";

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

  async function createEntry(userId: string, name: string) {
    const [inserted] = await app.db
      .insert(tasteEntries)
      .values({
        userId,
        dishName: name,
        restaurantName: "Place",
        city: "City",
        country: "Country",
        rating: 5,
        visibility: "public",
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
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.title).toBe("Top Burgers");
    expect(body.data.visibility).toBe("public");
    expect(body.data.user.id).toBe(alice.user.id);
  });

  it("3. POST /lists - validation failure (empty title) -> 400 or 422", async () => {
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
    for (let i = 0; i < 50; i++) {
      await app.db.insert(lists).values({
        userId: alice.user.id,
        title: `List ${i}`,
        visibility: "public",
      });
    }

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

  it("17. POST /lists/:id/items - unauthorized -> 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/lists/00000000-0000-0000-0000-000000000000/items",
      payload: { entry_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("18. POST /lists/:id/items - add entry to own list -> 201", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "My Favourites",
      visibility: "public",
    }).returning();

    const entry = await createEntry(alice.user.id, "Tacos");

    const res = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      headers: alice.headers,
      payload: {
        entry_id: entry.id,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("19. POST /lists/:id/items - add entry to someone else's list -> 403", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Bob Favourites",
      visibility: "public",
    }).returning();

    const entry = await createEntry(alice.user.id, "Tacos");

    const res = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      headers: alice.headers,
      payload: {
        entry_id: entry.id,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("20. POST /lists/:id/items - add same entry again -> 409 (ConflictError)", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "Unique List",
      visibility: "public",
    }).returning();

    const entry = await createEntry(alice.user.id, "Sushi");

    await app.db.insert(listItems).values({
      listId: list.id,
      entryId: entry.id,
      orderIndex: 0,
    });

    const res = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      headers: alice.headers,
      payload: {
        entry_id: entry.id,
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
      const entry = await createEntry(alice.user.id, `Dish ${i}`);
      await app.db.insert(listItems).values({
        listId: list.id,
        entryId: entry.id,
        orderIndex: i,
      });
    }

    const finalEntry = await createEntry(alice.user.id, "Excess");
    const res = await app.inject({
      method: "POST",
      url: `/lists/${list.id}/items`,
      headers: alice.headers,
      payload: {
        entry_id: finalEntry.id,
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it("22. DELETE /lists/:id/items/:entryId - remove item from own list -> 204", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "Removable",
      visibility: "public",
    }).returning();

    const entry = await createEntry(alice.user.id, "Soup");
    await app.db.insert(listItems).values({
      listId: list.id,
      entryId: entry.id,
      orderIndex: 0,
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/lists/${list.id}/items/${entry.id}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(204);
  });

  it("23. DELETE /lists/:id/items/:entryId - remove item from someone else's list -> 403", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const bob = await createTestUserWithAuth(app, { username: "bob", email: "bob@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: bob.user.id,
      title: "Bob List",
      visibility: "public",
    }).returning();

    const entry = await createEntry(bob.user.id, "Soup");
    await app.db.insert(listItems).values({
      listId: list.id,
      entryId: entry.id,
      orderIndex: 0,
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/lists/${list.id}/items/${entry.id}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(403);
  });

  it("24. DELETE /lists/:id/items/:entryId - remove non-existent item -> 404", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "Empty",
      visibility: "public",
    }).returning();

    const res = await app.inject({
      method: "DELETE",
      url: `/lists/${list.id}/items/00000000-0000-0000-0000-000000000000`,
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

    const entry1 = await createEntry(alice.user.id, "Item A");
    const entry2 = await createEntry(alice.user.id, "Item B");

    await app.db.insert(listItems).values({ listId: list.id, entryId: entry1.id, orderIndex: 0 });
    await app.db.insert(listItems).values({ listId: list.id, entryId: entry2.id, orderIndex: 1 });

    const res = await app.inject({
      method: "PATCH",
      url: `/lists/${list.id}/items/reorder`,
      headers: alice.headers,
      payload: {
        item_ids: [entry2.id, entry1.id],
      },
    });
    expect(res.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: `/lists/${list.id}`,
      headers: alice.headers,
    });
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.items[0].id).toBe(entry2.id);
    expect(getBody.data.items[1].id).toBe(entry1.id);
  });

  it("26. PATCH /lists/:id/items/reorder - reorder mismatch entry ids -> 422", async () => {
    const alice = await createTestUserWithAuth(app, { username: "alice", email: "alice@example.com" });
    const [list] = await app.db.insert(lists).values({
      userId: alice.user.id,
      title: "Ordering List 2",
      visibility: "public",
    }).returning();

    const entry1 = await createEntry(alice.user.id, "Item A");
    await app.db.insert(listItems).values({ listId: list.id, entryId: entry1.id, orderIndex: 0 });

    const res = await app.inject({
      method: "PATCH",
      url: `/lists/${list.id}/items/reorder`,
      headers: alice.headers,
      payload: {
        item_ids: ["00000000-0000-0000-0000-000000000000"],
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
});
