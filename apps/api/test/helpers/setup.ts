import { buildApp } from "../../src/app";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import type { RegisterRequest } from "@tastebook/shared/schemas/auth";
import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";

vi.mock("argon2", () => ({
  default: {
    hash: async (password: string) => `mocked_hash_${password}`,
    verify: async (hash: string, password: string) => hash === `mocked_hash_${password}`,
  },
}));

try {
  const envTestPath = path.resolve(__dirname, "../../../../.env.test");
  const envDevPath = path.resolve(__dirname, "../../../../.env");
  const envPath = fs.existsSync(envTestPath) ? envTestPath : envDevPath;
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
        if (envPath === envTestPath) {
          process.env[key] = value;
        } else if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
} catch (e) {}

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  console.log("=== REGISTERED ROUTES ===");
  console.log(app.printRoutes());
  console.log("=========================");
  return app;
}

export async function truncateTables(db: any) {
  const dbUrl = process.env.DATABASE_URL || "";
  const isTestDb = dbUrl.toLowerCase().includes("test");
  if (!isTestDb) {
    throw new Error(
      `DANGER: Attempted to run integration tests and truncate tables on a non-test database: "${dbUrl}".\n` +
      `To protect your development and production data from being deleted, tests will only execute if the database name in DATABASE_URL contains "test" (e.g. "tastebook_test").`
    );
  }

  const tables = [
    "list_items",
    "list_collaborators",
    "food_items",
    "lists",
    "entry_media",
    "follows",
    "refresh_tokens",
    "taste_entries",
    "users",
  ];
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables.join(", ")} CASCADE`));
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

  if (!data) {
    console.error(`[createTestUser] Registration failed! Status: ${res.statusCode}, Body: ${res.body}`);
  }

  return {
    user: data?.user,
    accessToken: data?.access_token,
    cookie: res.cookies[0],
  };
}

export async function createTestUserWithAuth(
  app: FastifyInstance,
  overrides?: Partial<RegisterRequest>
) {
  const { user, accessToken, cookie } = await createTestUser(app, overrides);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (cookie) {
    headers.Cookie = `${cookie.name}=${cookie.value}`;
  }
  return {
    user,
    accessToken,
    cookie,
    headers,
  };
}
