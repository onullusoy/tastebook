import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { createTestApp, truncateTables, createTestUserWithAuth } from "../../../test/helpers/setup";
import { entryMedia } from "@tastebook/db";
import { eq } from "drizzle-orm";
import { TINY_JPEG, TINY_PNG, TINY_WEBP } from "../../../test/helpers/fixtures";

describe("Media Upload Integration Tests", () => {
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

  it("POST /media/upload — valid JPEG → 201 with mediaId + url, accessible via URL", async () => {
    const alice = await createTestUserWithAuth(app);

    const res = await request(app.server)
      .post("/media/upload")
      .set("Authorization", alice.headers.Authorization)
      .attach("file", TINY_JPEG, { filename: "test.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.url).toBeDefined();
    expect(res.body.data.mime_type).toBe("image/webp");
    expect(res.body.data.order_index).toBe(0);

    // Use app.inject() instead of fetch() since test app doesn't listen on a TCP port
    const mediaUrl = new URL(res.body.data.url);
    const downloadRes = await app.inject({
      method: "GET",
      url: mediaUrl.pathname.replace(/^\/api/, ""),
    });
    expect(downloadRes.statusCode).toBe(200);
    const buf = Buffer.from(downloadRes.rawPayload);
    // WebP files start with "RIFF" and have "WEBP" at offset 8
    expect(buf.subarray(0, 4).toString()).toBe("RIFF");
    expect(buf.subarray(8, 12).toString()).toBe("WEBP");
  });

  it("POST /media/upload — valid JPG (image/jpg) → 201", async () => {
    const alice = await createTestUserWithAuth(app);

    const res = await request(app.server)
      .post("/media/upload")
      .set("Authorization", alice.headers.Authorization)
      .attach("file", TINY_JPEG, { filename: "test.jpg", contentType: "image/jpg" });

    expect(res.status).toBe(201);
    expect(res.body.data.mime_type).toBe("image/webp");
  });

  it("POST /media/upload — valid PNG → 201", async () => {
    const alice = await createTestUserWithAuth(app);

    const res = await request(app.server)
      .post("/media/upload")
      .set("Authorization", alice.headers.Authorization)
      .attach("file", TINY_PNG, { filename: "test.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.data.mime_type).toBe("image/webp");
  });

  it("POST /media/upload — valid WebP → 201", async () => {
    const alice = await createTestUserWithAuth(app);

    const res = await request(app.server)
      .post("/media/upload")
      .set("Authorization", alice.headers.Authorization)
      .attach("file", TINY_WEBP, { filename: "test.webp", contentType: "image/webp" });

    expect(res.status).toBe(201);
    expect(res.body.data.mime_type).toBe("image/webp");
  });

  it("POST /media/upload — too large (>10MB) → 422", async () => {
    const alice = await createTestUserWithAuth(app);
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 10);
    largeBuffer[0] = 0xFF;
    largeBuffer[1] = 0xD8;
    largeBuffer[2] = 0xFF;

    const res = await request(app.server)
      .post("/media/upload")
      .set("Authorization", alice.headers.Authorization)
      .attach("file", largeBuffer, { filename: "too_large.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(422);
  });

  it("POST /media/upload — unsupported type (text/plain) → 422", async () => {
    const alice = await createTestUserWithAuth(app);
    const textBuffer = Buffer.from("plain text content");

    const res = await request(app.server)
      .post("/media/upload")
      .set("Authorization", alice.headers.Authorization)
      .attach("file", textBuffer, { filename: "test.txt", contentType: "text/plain" });

    expect(res.status).toBe(422);
  });

  it("POST /media/upload — MIME says JPEG but content is PNG (magic byte mismatch) → 422", async () => {
    const alice = await createTestUserWithAuth(app);

    const res = await request(app.server)
      .post("/media/upload")
      .set("Authorization", alice.headers.Authorization)
      .attach("file", TINY_PNG, { filename: "mismatch.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(422);
  });

  it("POST /media/upload — no auth → 401", async () => {
    const res = await request(app.server)
      .post("/media/upload")
      .attach("file", TINY_JPEG, { filename: "test.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(401);
  });

  it("uploaded file accessible via returned URL (curl the URL → 200, WebP format)", async () => {
    const alice = await createTestUserWithAuth(app);

    const res = await request(app.server)
      .post("/media/upload")
      .set("Authorization", alice.headers.Authorization)
      .attach("file", TINY_JPEG, { filename: "test.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(201);
    const fileUrl = res.body.data.url;

    // Use app.inject() instead of fetch() since test app doesn't listen on a TCP port
    const mediaUrl = new URL(fileUrl);
    const downloadRes = await app.inject({
      method: "GET",
      url: mediaUrl.pathname.replace(/^\/api/, ""),
    });
    expect(downloadRes.statusCode).toBe(200);
    const downloadedBuf = Buffer.from(downloadRes.rawPayload);
    expect(downloadedBuf.subarray(0, 4).toString()).toBe("RIFF");
    expect(downloadedBuf.subarray(8, 12).toString()).toBe("WEBP");
  });

  it("media row has entry_id = null after upload (verify in DB)", async () => {
    const alice = await createTestUserWithAuth(app);

    const res = await request(app.server)
      .post("/media/upload")
      .set("Authorization", alice.headers.Authorization)
      .attach("file", TINY_JPEG, { filename: "test.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(201);
    const mediaId = res.body.data.id;

    const [row] = await app.db
      .select()
      .from(entryMedia)
      .where(eq(entryMedia.id, mediaId));

    expect(row).toBeDefined();
    expect(row.entryId).toBeNull();
    expect(row.userId).toBe(alice.user.id);
  });
});
