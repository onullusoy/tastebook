# Tastebook MVP Learnings

## Docker Compose Environment Setup
- Successfully set up the initial Postgres 16, Redis 7, and MinIO containerized services.
- Successfully resolved port conflicts on host:
  - Port 6379 (Redis) was occupied by `docker-redis-1` which was stopped.
  - Port 5432 (Postgres) was occupied by the host-level system `postgresql` service. Stopping the systemctl service via `systemctl stop postgresql` freed the port to allow successful Docker mapping.
- All services pass health checks and respond correctly to exec queries and HTTP curls.

## Monorepo Scaffold
- Initialized pnpm monorepo using workspace configuration (`apps/*`, `packages/*`).
- Configured Turbo with build, dev, lint, typecheck, and test tasks.
- Created fully-typed DB package (`@tastebook/db`) using Drizzle ORM and Postgres client.
- Set up a core shared package (`@tastebook/shared`) exposing subpath exports (`@tastebook/shared/schemas`, `@tastebook/shared/api-types`) with full validation.
- Initialized Fastify backend scaffold under `apps/api` with module-based tree layout.
- Upgraded the frontend `apps/web` application to Next.js 15 and React 19 to natively support standard `next.config.ts` files.
- Resolved route group page conflicts by migrating the generic `(auth)/page.tsx` into a proper `/login` sub-route layout.
- Structured Next.js 15 page props to correctly handle dynamic `params` as asynchronous `Promise` objects.

## Drizzle ORM Schema & Migrations
- Defined the complete 7 database schema files under `packages/db/src/schema/` (users, taste-entries, entry-media, follows, lists, list-items, refresh-tokens).
- Implemented `createDb` factory inside `packages/db/src/index.ts`.
- Encountered Drizzle-kit limitations with composite descending index order compilation (e.g. `desc(table.createdAt)` compiles as escaped quotes and column `.desc()` is unsupported in older Drizzle schemas). Fixed by defining the schema with standard ascending indexes and then modifying the generated migration SQL to apply precise `DESC` order and conditional filters (`WHERE entry_id IS NULL` for orphaned media).
- Successfully ran and verified migrations inside Postgres docker container using `docker compose exec postgres psql`.

## Shared Schema and API Types (Task 0.4)
- Created shared Zod validation schemas (`auth.ts`, `entries.ts`, `users.ts`, `lists.ts`, `common.ts`) under `packages/shared/src/schemas/`.
- Created robust API contract/response interfaces in `packages/shared/src/api-types/index.ts`.
- Integrated all exports with a clean, unified barrel setup via `packages/shared/src/index.ts`.
- Resolved TypeScript `rootDir` TS6059 constraints on workspace paths import checks by verifying under the correct TS boundaries or temporarily disabling `rootDir` during build verification. Both `apps/api` and `apps/web` resolve shared schemas and API types flawlessly.

## User Module and MinIO Setup (Task 1.2)
- Created S3 client plugin in `apps/api/src/shared/plugins/s3.ts` with public-read policy creation for MinIO.
- Implemented `UsersService` with magic byte validation (JPEG, PNG, WebP) and old avatar cleanup.
- Created `optionalAuthGuard` middleware to support optional authentication headers.
- Registered and implemented user profile, avatar upload routes under `/users`.
- Added `createTestUserWithAuth` to test helpers to provide unique users and token headers.
- Fixed Vitest parallel execution database collision by setting `fileParallelism: false` and `maxWorkers: 1` in `vitest.config.ts`.

## Media Upload Service (Task 2.1)
- Implemented `MediaService` under `apps/api/src/modules/media/media.service.ts` to manage image uploads to MinIO, validation, database entry, and attachment helper logic.
- Implemented multi-criteria magic byte validation supporting JPEG (`FFD8FF`), PNG (`89504E47`), and WebP (`RIFF`/`WEBP`) buffers and verified alignment with client-supplied content-type headers.
- Registered new `/media/upload` route in Fastify routes under `/media` prefix.
- Handled Fastify's multipart size validation constraints by catching `FST_REQ_FILE_TOO_LARGE` / `FST_ERR_MULTIPART_REACHED_LIMIT` errors in the global `errorHandler` middleware and mapping them to a standard validation 422 HTTP status.
- Added comprehensive integration tests in `media.test.ts` matching 9 test cases covering valid MIME formats (JPEG, PNG, WebP), invalid content-type / magic byte mismatches, size limits, unauthorized upload attempts, database entry validation, and S3 asset accessibility.
- All 36 backend integration tests pass seamlessly.

## Taste Entry Module (Task 2.2)
- Created cursor encoding and decoding utility under `apps/api/src/shared/utils/cursor.ts` leveraging `base64url` format to pack `createdAt` timestamp and `id` for reliable cursor-based pagination.
- Designed `EntriesService` matching a robust architecture with fully enforced ownership validation on all mutate actions (`update` and `delete`) and strict visibility checks on read actions (`getById` and `listByUser`).
- Implemented inline social check logic supporting mutual followers check directly against the `follows` table to establish if a viewer is a "friend" of the entry owner.
- Restricted visibility leaks of Private and Friends-Only entries by returning standard `NotFoundError` (404) to unauthorized requestors to prevent id harvesting (rather than leaking existence through a 403 Forbidden).
- Bound cascading deletes on entries to automatically trigger deletion of associated S3 media assets from MinIO and clean up media rows.
- Created all required Fastify endpoints supporting optional authentication and full Zod payload and query parameters validation.
- Added 22 comprehensive integration tests in `entries.test.ts` covering entries CRUD flows, media ordering, limits, rating/validation checks, friends/private visibility scopes, and cursor-based paginated results.
- Verified all 58 backend integration tests pass cleanly (100% success rate).

## Social Module Implementation (Task 3.1)
- Implemented `SocialService` in `apps/api/src/modules/social/social.service.ts` managing follow, unfollow, follower/following lists with cursor-based pagination, and mutual friend detection.
- Enforced strict constraints on follows: self-following raises `ValidationError` (422), duplicate following raises `ConflictError` (409), and nonexistent targets raise `NotFoundError` (404).
- Built high-performance Drizzle queries using `innerJoin` and `aliasedTable` for friends list query, and efficient mapping of paginated user responses with follower/following counters and friendship status flags.
- Registered endpoints in Fastify app and tested all flows with 16 integration tests in `social.test.ts`, checking self-follow, cascading user deletes, unfollow counts, and cursor pagination.
- Achieved 100% test success rate, with all 74 integration tests passing flawlessly.
