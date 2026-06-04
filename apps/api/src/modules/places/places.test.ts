import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, truncateTables, createTestUserWithAuth } from "../../../test/helpers/setup";

describe("Places Module Integration Tests", () => {
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

  it("GET /places/autocomplete — unauthorized request → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/places/autocomplete",
      query: { input: "test" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("GET /places/autocomplete — missing query input → 422", async () => {
    const authUser = await createTestUserWithAuth(app);

    const res = await app.inject({
      method: "GET",
      url: "/places/autocomplete",
      headers: authUser.headers,
    });

    expect(res.statusCode).toBe(422);
  });

  it("GET /places/autocomplete — valid input with API key missing → 400 key warning", async () => {
    const authUser = await createTestUserWithAuth(app);

    // Temporarily unset key in config
    const originalKey = app.config.GOOGLE_PLACES_API_KEY;
    app.config.GOOGLE_PLACES_API_KEY = "";

    const res = await app.inject({
      method: "GET",
      url: "/places/autocomplete",
      query: { input: "Modena" },
      headers: authUser.headers,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Google Places API Key is not configured");

    // Restore original key
    app.config.GOOGLE_PLACES_API_KEY = originalKey;
  });
});
