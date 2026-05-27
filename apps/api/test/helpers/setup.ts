import { buildApp } from "../../src/app";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import type { RegisterRequest } from "@tastebook/shared/schemas/auth";
import fs from "node:fs";
import path from "node:path";

try {
  const envPath = path.resolve(process.cwd(), "../../.env");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    for (const line of envConfig.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
} catch (e) {}

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

export async function truncateTables(db: any) {
  const tables = [
    "list_items",
    "lists",
    "entry_media",
    "follows",
    "refresh_tokens",
    "taste_entries",
    "users",
  ];
  for (const t of tables) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${t} CASCADE`));
  }
}

export async function createTestUser(
  app: FastifyInstance,
  overrides?: Partial<RegisterRequest>
) {
  const payload = {
    username: "testuser",
    email: "test@example.com",
    password: "password123",
    ...overrides,
  };

  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload,
  });

  const parsed = JSON.parse(res.body);
  const data = parsed.data;

  return {
    user: data.user,
    accessToken: data.access_token,
    cookie: res.cookies[0],
  };
}
