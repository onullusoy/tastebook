import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { createTestApp, truncateTables } from "./helpers/setup";

describe("Tastebook MVP End-to-End Smoke Test", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    await truncateTables(app.db);
  });

  afterAll(async () => {
    await app.close();
  });

  it("should complete full workflow: register -> login -> create entry -> follow -> check feed", async () => {
    const registerAliceRes = await request(app.server)
      .post("/auth/register")
      .send({
        username: "alice",
        email: "alice@example.com",
        password: "password123",
      });

    expect(registerAliceRes.status).toBe(201);
    const aliceData = registerAliceRes.body.data;
    expect(aliceData.user.username).toBe("alice");
    const aliceToken = aliceData.access_token;
    const aliceId = aliceData.user.id;

    const loginAliceRes = await request(app.server)
      .post("/auth/login")
      .send({
        email: "alice@example.com",
        password: "password123",
      });

    expect(loginAliceRes.status).toBe(200);
    expect(loginAliceRes.body.data.access_token).toBeDefined();

    const createEntryRes = await request(app.server)
      .post("/entries")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({
        dish_name: "Delicious Carbonara",
        restaurant_name: "Roma Trattoria",
        city: "Rome",
        country: "Italy",
        price_level: 3,
        rating: 9,
        notes: "Absolute perfection!",
        visibility: "public",
        media_ids: [],
      });

    expect(createEntryRes.status).toBe(201);
    expect(createEntryRes.body.data.dish_name).toBe("Delicious Carbonara");

    const registerBobRes = await request(app.server)
      .post("/auth/register")
      .send({
        username: "bob",
        email: "bob@example.com",
        password: "password123",
      });

    expect(registerBobRes.status).toBe(201);
    const bobToken = registerBobRes.body.data.access_token;

    const followRes = await request(app.server)
      .post(`/users/${aliceId}/follow`)
      .set("Authorization", `Bearer ${bobToken}`);

    expect(followRes.status).toBe(204);

    const feedRes = await request(app.server)
      .get("/feed?limit=10")
      .set("Authorization", `Bearer ${bobToken}`);

    expect(feedRes.status).toBe(200);
    const feedEntries = feedRes.body.data;
    expect(feedEntries.length).toBeGreaterThanOrEqual(1);
    expect(feedEntries[0].dish_name).toBe("Delicious Carbonara");
    expect(feedEntries[0].user.username).toBe("alice");
  });
});
