#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const composeArgs = ["compose", "-f", "docker-compose.yml"];
const rawArgs = process.argv.slice(2).filter((argument) => argument !== "--");
const onlyLocal = rawArgs.includes("--only-local");
const turboArgs = rawArgs.filter((argument) => argument !== "--only-local");

function printHelp() {
  console.log(`Usage: pnpm dev [--only-local] [turbo options]

Options:
  --only-local  Start local PostgreSQL, Redis, and MinIO, migrate the local
                database, then run the API and web apps against localhost.
  --help        Show this help message.

Shortcut: pnpm dev:local`);
}

function run(
  command,
  args,
  { env = process.env, quiet = false, acceptInterrupt = false } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env,
      stdio: quiet ? "ignore" : "inherit",
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (
        code === 0 ||
        (acceptInterrupt && (signal === "SIGINT" || signal === "SIGTERM"))
      ) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${command} ${args.join(" ")} failed with ${reason}`));
    });
  });
}

async function waitUntilReady(name, probe, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await probe()) {
        console.log(`[local] ${name} is ready.`);
        return;
      }
    } catch {
      // The service may reject connections while its container is starting.
    }

    await delay(1_000);
  }

  throw new Error(`${name} did not become ready within ${timeoutMs / 1_000} seconds.`);
}

async function commandSucceeds(command, args) {
  try {
    await run(command, args, { quiet: true });
    return true;
  } catch {
    return false;
  }
}

async function minioIsReady() {
  try {
    const response = await fetch("http://127.0.0.1:19000/minio/health/live", {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function buildLocalEnvironment() {
  const rootEnvFile = join(repositoryRoot, ".env");
  if (existsSync(rootEnvFile)) {
    process.loadEnvFile(rootEnvFile);
  }

  return {
    ...process.env,
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://tastebook:tastebook_dev_pass@127.0.0.1:15440/tastebook_dev",
    REDIS_URL: "redis://127.0.0.1:16380",
    JWT_SECRET:
      process.env.JWT_SECRET || "tastebook-local-jwt-secret-development-only",
    MINIO_ENDPOINT: "127.0.0.1",
    MINIO_PORT: "19000",
    MINIO_ACCESS_KEY: "minioadmin",
    MINIO_SECRET_KEY: "minioadmin123",
    MINIO_BUCKET: "tastebook",
    MINIO_USE_SSL: "false",
    API_PORT: "3001",
    API_HOST: "127.0.0.1",
    WEB_URL: "http://localhost:3000",
    NEXT_PUBLIC_API_URL: "http://127.0.0.1:3001/api",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || "admin@tastebook.local",
    ADMIN_PASSWORD:
      process.env.ADMIN_PASSWORD || "tastebook-local-admin",
    ADMIN_COOKIE_PASSWORD:
      process.env.ADMIN_COOKIE_PASSWORD ||
      "tastebook-local-admin-cookie-secret-development-only",
  };
}

async function startLocalDevelopment() {
  const localEnvironment = buildLocalEnvironment();

  console.log("[local] Starting PostgreSQL, Redis, and MinIO...");
  await run("docker", [...composeArgs, "up", "-d"]);

  await Promise.all([
    waitUntilReady("PostgreSQL", () =>
      commandSucceeds("docker", [
        ...composeArgs,
        "exec",
        "-T",
        "postgres",
        "pg_isready",
        "-U",
        "tastebook",
        "-d",
        "tastebook_dev",
      ]),
    ),
    waitUntilReady("Redis", () =>
      commandSucceeds("docker", [
        ...composeArgs,
        "exec",
        "-T",
        "redis",
        "redis-cli",
        "ping",
      ]),
    ),
    waitUntilReady("MinIO", minioIsReady),
  ]);

  console.log("[local] Applying database migrations...");
  await run("pnpm", ["db:migrate"], { env: localEnvironment });

  console.log("[local] Starting the API and web app on this computer...");
  console.log("[local] Web: http://localhost:3000");
  console.log("[local] API: http://127.0.0.1:3001/api");
  await run("pnpm", ["exec", "turbo", "dev", "--env-mode=loose", ...turboArgs], {
    env: localEnvironment,
    acceptInterrupt: true,
  });
}

async function main() {
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
    printHelp();
    return;
  }

  if (onlyLocal) {
    await startLocalDevelopment();
    return;
  }

  await run("pnpm", ["exec", "turbo", "dev", ...turboArgs], {
    acceptInterrupt: true,
  });
}

main().catch((error) => {
  console.error(`\nDevelopment startup failed: ${error.message}`);
  process.exitCode = 1;
});
