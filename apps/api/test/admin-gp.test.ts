import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { createTestApp, truncateTables, createTestUserWithAuth } from "./helpers/setup";

describe("AdminJS Gourmet Points Recalculation Tests", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should recalculate and deduct GP when an admin deletes a user's post", async () => {
    await truncateTables(app.db);

    // 1. Create Alice user
    const alice = await createTestUserWithAuth(app, {
      username: "alice",
      email: "alice@example.com",
      password: "password123",
    });

    // 2. Alice creates a public post
    const entryRes = await request(app.server)
      .post("/entries")
      .set("Authorization", alice.headers.Authorization)
      .send({
        restaurant_name: "Admin Gourmet Corner",
        city: "Berlin",
        country: "Germany",
        price_level: 2,
        rating: 8,
        notes: "Very delicious review that earns Alice 5 GP.",
        visibility: "public",
        food_items: [],
      });

    expect(entryRes.status).toBe(201);
    const entryId = entryRes.body.data.id;

    // Verify Alice has 5 GP (base review)
    let aliceProfileRes = await request(app.server)
      .get(`/users/${alice.user.id}`)
      .set("Authorization", alice.headers.Authorization);
    expect(aliceProfileRes.status).toBe(200);
    expect(aliceProfileRes.body.data.gourme_points).toBe(5);

    // 3. Log in as admin using supertest agent
    const agent = request.agent(app.server);
    const loginRes = await agent
      .post("/admin/login")
      .type("form")
      .send({
        email: "admin@tastebook.app",
        password: "tastebook_admin_secure_pass_2026",
      });

    expect(loginRes.status).toBe(302); // Redirects after login

    // 4. Delete Alice's post via AdminJS delete action API using the authenticated agent
    const deleteRes = await agent
      .post(`/admin/api/resources/taste_entries/records/${entryId}/delete`)
      .send();

    expect([200, 302, 303]).toContain(deleteRes.status);

    // 5. Verify Alice's post is deleted and her GP drops to 0
    const checkEntryRes = await request(app.server)
      .get(`/entries/${entryId}`)
      .set("Authorization", alice.headers.Authorization);
    expect(checkEntryRes.status).toBe(404);

    aliceProfileRes = await request(app.server)
      .get(`/users/${alice.user.id}`)
      .set("Authorization", alice.headers.Authorization);
    expect(aliceProfileRes.status).toBe(200);
    expect(aliceProfileRes.body.data.gourme_points).toBe(0);
  });
});
