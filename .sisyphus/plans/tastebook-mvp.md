# Tastebook MVP — Work Plan

## Meta
- **Created**: 2026-05-27
- **Status**: Ready for execution
- **Plan type**: Full-stack greenfield MVP
- **Executor**: Solo developer, no hard deadline
- **Total tasks**: 19
- **Phases**: 8 (0–7)

## Goal & Success Criteria

Build a deployable MVP of Tastebook — a social food platform where users log dish-centric food experiences, follow each other, browse a chronological social feed, and curate lists.

**Done when ALL are true:**
1. `docker compose up` starts all services (Postgres, Redis, MinIO, API, Web) — all healthy
2. User can register, login, refresh tokens, and manage their profile with avatar
3. User can create Taste Entries with up to 5 images uploaded to MinIO
4. User can follow/unfollow other users; mutual follow detected as "friends"
5. User can browse a cursor-paginated feed showing entries from followed users with visibility enforcement
6. User can create and manage lists of Taste Entries (add, remove, reorder)
7. All API endpoints have passing integration tests via `pnpm test`
8. Frontend is functional: auth flow → feed with infinite scroll → entry creation → profile → lists
9. `pnpm lint` and `pnpm typecheck` pass with zero errors

## Scope

### IN (MVP)
- JWT authentication (register, login, refresh, logout)
- User profiles (username, display name, avatar, bio)
- Taste Entries CRUD (dish_name, restaurant_name, city, country, price_level, rating 0–10, notes, visibility)
- Entry media (up to 5 images per entry, max 10MB each, stored in MinIO)
- Follow/unfollow with friend detection (mutual follow)
- Social feed (chronological, cursor-based, visibility-filtered, Redis-cached)
- Basic lists (single-owner, ordered items, add/remove/reorder)
- Docker Compose deployment (Postgres + Redis + MinIO + API + Web)
- Integration tests for all API modules

### OUT (explicitly excluded — do NOT implement)
- Image processing (no resize, thumbnails, compression — store originals only)
- Search (no full-text search, no search endpoint, no search UI)
- Notifications (no push, no in-app, no email notifications)
- Likes, comments, or reactions (tables exist in spec but excluded from MVP)
- Badges or achievements
- Food Passport analytics
- Collaborative lists
- Admin dashboard or moderation tools
- Password reset or email verification
- Rate limiting
- Dark mode / theming
- PWA manifest / service workers / offline support
- Internationalization
- Analytics or tracking

## Tech Stack

| Layer | Technology | Pin Version |
|-------|-----------|-------------|
| Runtime | Node.js | 22 LTS |
| Language | TypeScript | ~5.7 |
| Backend Framework | Fastify | ~5.x |
| ORM | Drizzle ORM + drizzle-kit | latest stable |
| PG Driver | postgres (porsager/postgres) | latest |
| Database | PostgreSQL | 16 |
| Cache | Redis (via ioredis) | 7 |
| Object Storage | MinIO (via @aws-sdk/client-s3) | latest |
| Frontend Framework | Next.js (App Router) | ~15.x |
| Data Fetching | @tanstack/react-query | ~5.x |
| Client State | zustand | ~5.x |
| Forms | react-hook-form + @hookform/resolvers | latest |
| Validation | zod | ~3.x |
| Styling | Tailwind CSS | ~4.x |
| Package Manager | pnpm | ~9.x |
| Testing | vitest + supertest | latest |
| Password Hashing | argon2 | latest |
| Linting | ESLint + Prettier | latest |

## Architecture

### Monorepo Structure

```
tastebook/
├── apps/
│   ├── api/                          # Fastify REST API
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/             # register, login, refresh, middleware
│   │   │   │   ├── users/            # profile CRUD, avatar upload
│   │   │   │   ├── entries/          # Taste Entry CRUD + media attachment
│   │   │   │   ├── media/            # MinIO upload service
│   │   │   │   ├── social/           # follow/unfollow, friend detection
│   │   │   │   ├── feed/             # feed assembly, caching
│   │   │   │   └── lists/            # list CRUD, item management
│   │   │   ├── shared/
│   │   │   │   ├── plugins/          # Fastify plugins (db, redis, s3)
│   │   │   │   ├── middleware/       # error handler, auth guard
│   │   │   │   └── utils/            # cursor encoding, pagination
│   │   │   ├── app.ts                # Fastify app factory
│   │   │   └── server.ts             # Entry point
│   │   ├── test/
│   │   │   └── helpers/              # Test setup, DB seeding
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                          # Next.js frontend
│       ├── src/
│       │   ├── app/                  # App Router pages
│       │   │   ├── (auth)/           # Login, Register (no nav)
│       │   │   ├── (main)/           # Feed, Profile, Lists (with nav)
│       │   │   ├── layout.tsx
│       │   │   └── page.tsx          # Redirect to /feed or /login
│       │   ├── components/           # Shared UI components
│       │   ├── lib/                  # API client, auth helpers
│       │   ├── hooks/                # Custom React hooks
│       │   └── stores/               # Zustand stores
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── db/                           # Drizzle schema + migrations
│   │   ├── src/
│   │   │   ├── schema/               # Table definitions
│   │   │   └── migrations/           # Generated SQL migrations
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   └── shared/                       # Shared types + Zod schemas
│       ├── src/
│       │   ├── api-types/            # Request/response type contracts
│       │   └── schemas/              # Shared Zod schemas
│       └── package.json
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .nvmrc
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

### Module Pattern (each API module)

```
modules/{name}/
├── {name}.routes.ts    — Fastify route registration. Thin handlers: parse → call service → respond.
├── {name}.service.ts   — Business logic. Receives validated data, returns domain objects.
├── {name}.schema.ts    — Zod schemas for request validation (used by Fastify schema).
└── {name}.test.ts      — Integration tests against real Postgres/Redis/MinIO in Docker.
```

### Key Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Fan-out-on-read** for feed | Simpler for MVP. Query entries from followed users at request time. Sufficient at early scale (<10K users). |
| 2 | **Cursor = (created_at, id)** | Composite cursor for deterministic ordering. Both DESC. Base64-encoded JSON. Tie-breaking on UUID prevents cursor collision. |
| 3 | **Separate upload endpoint** | `POST /media/upload` returns `mediaId`. Entry creation accepts `mediaIds[]`. Decouples upload from entry creation. Supports upload progress UX. |
| 4 | **Visibility at query layer** | Every query that returns entries MUST filter by visibility. Private → owner only. Friends-only → mutual follows + owner. Public → all authenticated users. |
| 5 | **Access token (15min) + Refresh token (30d)** | Access token in memory (frontend). Refresh token in HTTP-only cookie. Refresh tokens stored in DB for revocation. |
| 6 | **Hard deletes** | No soft deletes for MVP. Simpler. Cascade deletes via foreign keys. |
| 7 | **Own entries in feed** | User sees their own entries in the feed. |
| 8 | **Empty feed → discovery** | New users with no follows see recent public entries. |
| 9 | **Login wall for feed** | Feed requires auth. Individual public entries accessible without auth (for link sharing). |
| 10 | **Version-key cache invalidation** | On events that change feed content (new entry, delete, visibility change, follow/unfollow), increment user's feed version in Redis. Old cached pages expire via TTL. |

### Security Conventions

- Return **404** (not 403) for private entries — don't leak existence
- Return **401** (not 404) for nonexistent users on login — don't leak registration
- Use `ON CONFLICT DO NOTHING` for follow creation — idempotent
- Validate image **magic bytes**, not just file extension
- All mutations require **ownership verification** via auth middleware
- Never expose `password_hash` in any API response
- Sanitize all text inputs (notes, bio, titles)

## Conventions

### API Response Envelope

```jsonc
// Success — single item
{ "data": { "id": "...", ... } }

// Success — paginated list
{ "data": [...], "cursor": "base64..." }
// No "cursor" field when there are no more results

// Error
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No content (delete, follow, unfollow) |
| 400 | Bad request |
| 401 | Unauthorized (also for wrong credentials) |
| 404 | Not found (also for forbidden private resources) |
| 409 | Conflict (duplicate email, already following, entry already in list) |
| 422 | Validation error (Zod parse failure) |
| 500 | Internal server error |

### Application Constants

```typescript
export const LIMITS = {
  MAX_IMAGES_PER_ENTRY: 5,
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_LISTS_PER_USER: 50,
  MAX_ITEMS_PER_LIST: 100,
  FEED_PAGE_SIZE: 20,
  FEED_CACHE_TTL_SECONDS: 60,
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: 30,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  MAX_USERNAME_LENGTH: 30,
  MAX_BIO_LENGTH: 500,
  MAX_DISH_NAME_LENGTH: 200,
  MAX_NOTES_LENGTH: 2000,
} as const;
```

### File Naming

- `kebab-case` for directories
- `{module-name}.routes.ts`, `.service.ts`, `.schema.ts`, `.test.ts` for module files
- `.tsx` for React components, `.ts` for everything else
- Components: `PascalCase.tsx` (e.g., `EntryCard.tsx`, `FeedList.tsx`)

---

## Phase 0: Infrastructure Foundation

_These tasks set up the development environment, monorepo scaffold, database schema, and shared types. All subsequent phases depend on this._

### Task 0.1: Docker Compose Development Environment ✅

**Goal**: Create a `docker-compose.yml` that starts Postgres 16, Redis 7, and MinIO with health checks and persistent volumes. All subsequent development depends on these services.

**File**: `docker-compose.yml` (project root)

**Services to define:**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: tastebook_dev
      POSTGRES_USER: tastebook
      POSTGRES_PASSWORD: tastebook_dev_pass
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tastebook"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redisdata:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    volumes: [miniodata:/data]
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
  redisdata:
  miniodata:
```

**Also create:**
- `.env.example` with all env vars (DB connection string, Redis URL, MinIO endpoint/credentials, JWT secrets, API port, web port). Use placeholder values.
- `.env` (gitignored, copy of `.env.example` with dev defaults filled in)
- `.gitignore` — ignore `node_modules/`, `.env`, `dist/`, `.next/`, `*.tsbuildinfo`
- `.nvmrc` — contents: `22`

**QA:**
- `docker compose up -d` → all 3 services healthy within 30 seconds
- `docker compose exec postgres psql -U tastebook -d tastebook_dev -c "SELECT 1"` → returns 1
- `docker compose exec redis redis-cli PING` → returns PONG
- `curl http://localhost:9000/minio/health/live` → returns 200

### Task 0.2: Monorepo Scaffold ✅

**Goal**: Initialize pnpm workspace monorepo with 4 packages: `apps/api`, `apps/web`, `packages/db`, `packages/shared`. All TypeScript configured with project references.

**Steps:**

1. **Root `package.json`:**
   ```json
   {
     "name": "tastebook",
     "private": true,
     "scripts": {
       "dev": "turbo dev",
       "build": "turbo build",
       "lint": "turbo lint",
       "typecheck": "turbo typecheck",
       "test": "turbo test",
       "db:generate": "pnpm --filter @tastebook/db generate",
       "db:migrate": "pnpm --filter @tastebook/db migrate",
       "db:push": "pnpm --filter @tastebook/db push"
     },
     "devDependencies": {
       "turbo": "latest",
       "typescript": "~5.7.0"
     },
     "packageManager": "pnpm@9.15.0"
   }
   ```

2. **`pnpm-workspace.yaml`:**
   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
   ```

3. **`tsconfig.base.json`** (root):
   - `strict: true`, `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "bundler"`
   - `skipLibCheck: true`, `esModuleInterop: true`, `resolveJsonModule: true`
   - Each sub-package extends this with its own `tsconfig.json`

4. **`packages/db/package.json`**: name `@tastebook/db`. Dependencies: `drizzle-orm`, `postgres`. DevDeps: `drizzle-kit`, `typescript`.

5. **`packages/shared/package.json`**: name `@tastebook/shared`. Dependencies: `zod`. Exports `./api-types` and `./schemas`.

6. **`apps/api/package.json`**: name `@tastebook/api`. Dependencies: `fastify`, `@fastify/jwt`, `@fastify/cookie`, `@fastify/cors`, `@fastify/multipart`, `argon2`, `ioredis`, `@aws-sdk/client-s3`, `zod`, `@tastebook/db`, `@tastebook/shared`. DevDeps: `vitest`, `supertest`, `@types/supertest`, `tsx`.

7. **`apps/web/package.json`**: name `@tastebook/web`. Dependencies: `next`, `react`, `react-dom`, `@tanstack/react-query`, `zustand`, `react-hook-form`, `@hookform/resolvers`, `zod`, `@tastebook/shared`. DevDeps: `tailwindcss`, `@tailwindcss/postcss`, `typescript`, `@types/react`, `@types/react-dom`.

8. **Create initial `src/` directory structure** per the Architecture section above. Create only directories and placeholder `index.ts` barrel files — no business logic yet.

9. **`turbo.json`** at root:
   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "tasks": {
       "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
       "dev": { "cache": false, "persistent": true },
       "lint": { "dependsOn": ["^build"] },
       "typecheck": { "dependsOn": ["^build"] },
       "test": { "dependsOn": ["^build"] }
     }
   }
   ```

**QA:**
- `pnpm install` → exits 0, no peer dependency errors
- `pnpm typecheck` → exits 0 (only placeholder files, should compile clean)
- Each package can import from its workspace dependencies (test with a simple import)

### Task 0.3: Database Schema & Migrations ✅

**Goal**: Define the complete Drizzle ORM schema in `packages/db` and generate the initial migration. This is the single source of truth for all database tables.

**File**: `packages/db/src/schema/index.ts` (re-exports all tables)

**Tables to define** (one file per table in `packages/db/src/schema/`):

1. **`users.ts`** — `users` table:
   ```typescript
   id: uuid().primaryKey().defaultRandom()
   username: varchar(30).notNull().unique()
   email: varchar(255).notNull().unique()
   password_hash: text().notNull()
   display_name: varchar(100)
   avatar_url: text()
   bio: varchar(500)
   created_at: timestamp({ withTimezone: true }).notNull().defaultNow()
   updated_at: timestamp({ withTimezone: true }).notNull().defaultNow()
   ```

2. **`taste-entries.ts`** — `taste_entries` table:
   ```typescript
   id: uuid().primaryKey().defaultRandom()
   user_id: uuid().notNull().references(() => users.id, { onDelete: 'cascade' })
   dish_name: varchar(200).notNull()
   restaurant_name: varchar(200)
   city: varchar(100)
   country: varchar(100)
   price_level: integer()  // 1-5, nullable
   rating: integer().notNull()  // 0-10
   notes: varchar(2000)
   visibility: varchar(20).notNull().default('public')  // 'public' | 'friends' | 'private'
   created_at: timestamp({ withTimezone: true }).notNull().defaultNow()
   updated_at: timestamp({ withTimezone: true }).notNull().defaultNow()
   ```

3. **`entry-media.ts`** — `entry_media` table:
   ```typescript
   id: uuid().primaryKey().defaultRandom()
   entry_id: uuid().references(() => tasteEntries.id, { onDelete: 'cascade' })  // nullable until attached
   user_id: uuid().notNull().references(() => users.id, { onDelete: 'cascade' })  // uploader, for orphan cleanup
   url: text().notNull()  // MinIO object key (not full URL)
   mime_type: varchar(50).notNull()
   size_bytes: integer().notNull()
   order_index: integer().notNull().default(0)
   created_at: timestamp({ withTimezone: true }).notNull().defaultNow()
   ```
   - `entry_id` is nullable because media is uploaded first, then attached to an entry.

4. **`follows.ts`** — `follows` table:
   ```typescript
   follower_id: uuid().notNull().references(() => users.id, { onDelete: 'cascade' })
   following_id: uuid().notNull().references(() => users.id, { onDelete: 'cascade' })
   created_at: timestamp({ withTimezone: true }).notNull().defaultNow()
   // Composite primary key: (follower_id, following_id)
   ```
   - Add check constraint: `follower_id != following_id` (prevent self-follow)

5. **`lists.ts`** — `lists` table:
   ```typescript
   id: uuid().primaryKey().defaultRandom()
   user_id: uuid().notNull().references(() => users.id, { onDelete: 'cascade' })
   title: varchar(200).notNull()
   description: varchar(1000)
   visibility: varchar(20).notNull().default('public')  // 'public' | 'friends' | 'private'
   cover_image_url: text()
   created_at: timestamp({ withTimezone: true }).notNull().defaultNow()
   updated_at: timestamp({ withTimezone: true }).notNull().defaultNow()
   ```

6. **`list-items.ts`** — `list_items` table:
   ```typescript
   id: uuid().primaryKey().defaultRandom()
   list_id: uuid().notNull().references(() => lists.id, { onDelete: 'cascade' })
   entry_id: uuid().notNull().references(() => tasteEntries.id, { onDelete: 'cascade' })
   order_index: integer().notNull().default(0)
   created_at: timestamp({ withTimezone: true }).notNull().defaultNow()
   // Unique constraint: (list_id, entry_id) — an entry can appear in a list only once
   ```

7. **`refresh-tokens.ts`** — `refresh_tokens` table:
   ```typescript
   id: uuid().primaryKey().defaultRandom()
   user_id: uuid().notNull().references(() => users.id, { onDelete: 'cascade' })
   token_hash: text().notNull().unique()  // hashed refresh token
   expires_at: timestamp({ withTimezone: true }).notNull()
   created_at: timestamp({ withTimezone: true }).notNull().defaultNow()
   ```

**Indexes** (define in the same schema files using Drizzle's `index()` or `uniqueIndex()`):

```sql
-- Feed queries: entries by author ordered by time
CREATE INDEX idx_entries_user_created ON taste_entries (user_id, created_at DESC, id DESC);

-- Public/explore feed: recent entries by time
CREATE INDEX idx_entries_created ON taste_entries (created_at DESC, id DESC);

-- Visibility filtering on feed
CREATE INDEX idx_entries_visibility ON taste_entries (visibility, created_at DESC);

-- Follow graph lookups (both directions)
CREATE INDEX idx_follows_follower ON follows (follower_id, following_id);
CREATE INDEX idx_follows_following ON follows (following_id, follower_id);

-- Media by entry (for entry detail page)
CREATE INDEX idx_media_entry ON entry_media (entry_id, order_index);

-- Orphaned media cleanup (uploaded but never attached)
CREATE INDEX idx_media_orphan ON entry_media (user_id, created_at) WHERE entry_id IS NULL;

-- List items ordering
CREATE INDEX idx_list_items_list ON list_items (list_id, order_index);

-- User lists
CREATE INDEX idx_lists_user ON lists (user_id, created_at DESC);

-- Refresh token lookup
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

-- Refresh token expiry cleanup
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens (expires_at);
```

**Also create:**
- `packages/db/src/index.ts` — exports `createDb()` factory function using `postgres` driver + `drizzle()` wrapper. Accepts connection string parameter.
- `packages/db/drizzle.config.ts` — reads `DATABASE_URL` from env, points to `src/schema/`.

**Steps to generate migration:**
```bash
cd packages/db
pnpm drizzle-kit generate  # generates SQL migration file
pnpm drizzle-kit migrate   # applies to running Postgres
```

**QA:**
- `pnpm drizzle-kit generate` → creates migration file in `packages/db/src/migrations/` with zero errors
- `pnpm drizzle-kit migrate` → applies migration to Postgres in Docker Compose → all tables exist
- Connect to Postgres and verify: `\dt` shows all 7 tables, `\di` shows all indexes
- `pnpm typecheck` passes — all schema types resolve

### Task 0.4: Shared Types & Zod Schemas Package ✅

**Goal**: Define API contract types and shared Zod validation schemas in `packages/shared`. Both `apps/api` (request validation) and `apps/web` (form validation) consume these.

**Files to create:**

1. **`packages/shared/src/schemas/auth.ts`**:
   ```typescript
   export const registerSchema = z.object({
     username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
     email: z.string().email().max(255),
     password: z.string().min(8).max(128),
   });
   export const loginSchema = z.object({
     email: z.string().email(),
     password: z.string(),
   });
   ```

2. **`packages/shared/src/schemas/entries.ts`**:
   ```typescript
   export const createEntrySchema = z.object({
     dish_name: z.string().min(1).max(200),
     restaurant_name: z.string().max(200).optional(),
     city: z.string().max(100).optional(),
     country: z.string().max(100).optional(),
     price_level: z.number().int().min(1).max(5).optional(),
     rating: z.number().int().min(0).max(10),
     notes: z.string().max(2000).optional(),
     visibility: z.enum(['public', 'friends', 'private']).default('public'),
     media_ids: z.array(z.string().uuid()).max(5).default([]),
   });
   export const updateEntrySchema = createEntrySchema.partial().omit({ media_ids: true });
   ```

3. **`packages/shared/src/schemas/users.ts`**:
   ```typescript
   export const updateProfileSchema = z.object({
     display_name: z.string().max(100).optional(),
     bio: z.string().max(500).optional(),
   });
   ```

4. **`packages/shared/src/schemas/lists.ts`**:
   ```typescript
   export const createListSchema = z.object({
     title: z.string().min(1).max(200),
     description: z.string().max(1000).optional(),
     visibility: z.enum(['public', 'friends', 'private']).default('public'),
   });
   export const updateListSchema = createListSchema.partial();
   export const reorderItemsSchema = z.object({
     item_ids: z.array(z.string().uuid()).min(1),  // ordered array — new order
   });
   ```

5. **`packages/shared/src/schemas/common.ts`**:
   ```typescript
   export const cursorPaginationSchema = z.object({
     cursor: z.string().optional(),
     limit: z.coerce.number().int().min(1).max(50).default(20),
   });
   export const uuidParamSchema = z.object({
     id: z.string().uuid(),
   });
   ```

6. **`packages/shared/src/api-types/index.ts`** — TypeScript types inferred from Zod schemas:
   ```typescript
   // Infer request types from schemas
   export type RegisterRequest = z.infer<typeof registerSchema>;
   export type LoginRequest = z.infer<typeof loginSchema>;
   export type CreateEntryRequest = z.infer<typeof createEntrySchema>;
   // ... etc

   // Response types (manually defined — these are API contracts)
   export interface UserResponse {
     id: string;
     username: string;
     display_name: string | null;
     avatar_url: string | null;
     bio: string | null;
     created_at: string;
     follower_count?: number;
     following_count?: number;
     is_following?: boolean;
     is_friend?: boolean;
   }

   export interface EntryResponse {
     id: string;
     user: Pick<UserResponse, 'id' | 'username' | 'display_name' | 'avatar_url'>;
     dish_name: string;
     restaurant_name: string | null;
     city: string | null;
     country: string | null;
     price_level: number | null;
     rating: number;
     notes: string | null;
     visibility: 'public' | 'friends' | 'private';
     media: MediaResponse[];
     created_at: string;
   }

   export interface MediaResponse {
     id: string;
     url: string;  // full URL to MinIO object
     mime_type: string;
     order_index: number;
   }

   export interface ListResponse {
     id: string;
     user: Pick<UserResponse, 'id' | 'username' | 'display_name' | 'avatar_url'>;
     title: string;
     description: string | null;
     visibility: 'public' | 'friends' | 'private';
     cover_image_url: string | null;
     item_count: number;
     created_at: string;
   }

   export interface AuthTokensResponse {
     access_token: string;
     user: UserResponse;
   }
   // Note: refresh token is set as HTTP-only cookie, not in response body

   export interface PaginatedResponse<T> {
     data: T[];
     cursor?: string;
   }
   ```

7. **`packages/shared/src/index.ts`** — barrel re-export of all schemas and types.

**QA:**
- `pnpm typecheck` passes in `packages/shared`
- `apps/api` can `import { createEntrySchema } from '@tastebook/shared/schemas'` — resolves without error
- `apps/web` can `import { EntryResponse } from '@tastebook/shared/api-types'` — resolves without error

---

## Phase 1: Auth & Identity

_Depends on: Phase 0 complete._

### Task 1.1: Auth Module (Register, Login, Refresh, Middleware) ✅

**Goal**: Implement JWT-based authentication with access/refresh token flow. This is the security foundation — every subsequent module depends on the auth middleware.

**Files to create:**

1. **`apps/api/src/shared/plugins/db.ts`** — Fastify plugin that decorates the app with a Drizzle DB instance. Reads `DATABASE_URL` from env. Registers shutdown hook to close connection pool.

2. **`apps/api/src/shared/plugins/redis.ts`** — Fastify plugin that decorates the app with an ioredis instance. Reads `REDIS_URL` from env. Registers shutdown hook.

3. **`apps/api/src/shared/plugins/config.ts`** — Fastify plugin that reads and validates all env vars using Zod. Schema:
   ```typescript
   const envSchema = z.object({
     DATABASE_URL: z.string().url(),
     REDIS_URL: z.string().url(),
     JWT_SECRET: z.string().min(32),
     MINIO_ENDPOINT: z.string(),
     MINIO_PORT: z.coerce.number().default(9000),
     MINIO_ACCESS_KEY: z.string(),
     MINIO_SECRET_KEY: z.string(),
     MINIO_BUCKET: z.string().default('tastebook'),
     MINIO_USE_SSL: z.coerce.boolean().default(false),
     API_PORT: z.coerce.number().default(3001),
     API_HOST: z.string().default('0.0.0.0'),
     WEB_URL: z.string().default('http://localhost:3000'),
   });
   ```
   Throws on invalid env with clear error message listing missing/invalid vars.

4. **`apps/api/src/shared/middleware/auth-guard.ts`** — Fastify `onRequest` hook that:
   - Extracts `Authorization: Bearer <token>` header
   - Verifies JWT using `@fastify/jwt`
   - Decodes payload: `{ sub: userId, iat, exp }`
   - Decorates `request.userId` (string UUID)
   - Returns 401 with `{ error: { code: "UNAUTHORIZED", message: "..." } }` on missing/invalid/expired token

5. **`apps/api/src/shared/middleware/error-handler.ts`** — Fastify `setErrorHandler` that:
   - Catches Zod validation errors → 422 with structured field errors
   - Catches known app errors (custom error classes) → appropriate status code
   - Catches everything else → 500 with generic message (no stack trace in response)
   - Logs full error details server-side

6. **`apps/api/src/modules/auth/auth.service.ts`**:
   ```typescript
   class AuthService {
     async register(data: RegisterRequest): Promise<{ user, accessToken, refreshToken }>
       // 1. Check if email or username already exists → throw 409 ConflictError
       // 2. Hash password with argon2 (argon2id variant, default params)
       // 3. Insert user into DB
       // 4. Generate access token (JWT, 15min TTL, payload: { sub: user.id })
       // 5. Generate refresh token (random 64-byte hex string)
       // 6. Hash refresh token with SHA-256, store hash in refresh_tokens table with 30-day expiry
       // 7. Return user (without password_hash), access token, refresh token

     async login(data: LoginRequest): Promise<{ user, accessToken, refreshToken }>
       // 1. Find user by email → if not found, throw 401 (NOT 404)
       // 2. Verify password with argon2 → if wrong, throw 401
       // 3. Generate tokens (same as register steps 4-6)
       // 4. Return user, tokens

     async refresh(rawRefreshToken: string): Promise<{ accessToken, refreshToken }>
       // 1. Hash the incoming refresh token with SHA-256
       // 2. Look up hash in refresh_tokens table
       // 3. If not found or expired → throw 401
       // 4. Delete the used refresh token (one-time use / rotation)
       // 5. Generate new access + refresh token pair
       // 6. Store new refresh token hash
       // 7. Return new tokens

     async logout(rawRefreshToken: string): Promise<void>
       // 1. Hash the refresh token
       // 2. Delete from refresh_tokens table (idempotent — no error if not found)
   }
   ```

7. **`apps/api/src/modules/auth/auth.routes.ts`**:
   ```
   POST /auth/register  — body: registerSchema → 201 { data: { access_token, user } } + Set-Cookie: refreshToken (httpOnly, path=/auth, sameSite=lax)
   POST /auth/login     — body: loginSchema → 200 { data: { access_token, user } } + Set-Cookie: refreshToken
   POST /auth/refresh   — reads refreshToken from cookie → 200 { data: { access_token } } + new Set-Cookie
   POST /auth/logout    — reads refreshToken from cookie → 204 + clear cookie
   GET  /auth/me        — auth required → 200 { data: user }
   ```

8. **`apps/api/src/modules/auth/auth.schema.ts`** — re-exports and wraps the shared Zod schemas for Fastify route schema integration.

9. **`apps/api/src/app.ts`** — Fastify app factory:
   - Register plugins: `@fastify/cors` (origin: WEB_URL), `@fastify/cookie`, `@fastify/jwt` (secret from env), `@fastify/multipart` (10MB limit)
   - Register custom plugins: config, db, redis
   - Register error handler
   - Register auth routes at `/auth`
   - Export `buildApp()` function for both server.ts and tests

10. **`apps/api/src/server.ts`** — calls `buildApp()`, then `app.listen({ port, host })`.

11. **`apps/api/src/modules/auth/auth.test.ts`** — Integration tests:
    ```
    Setup: buildApp() with real Postgres (Docker), truncate tables before each test.

    Tests:
    ✓ POST /auth/register — valid data → 201, returns user + access_token, sets cookie
    ✓ POST /auth/register — duplicate email → 409
    ✓ POST /auth/register — duplicate username → 409
    ✓ POST /auth/register — invalid email → 422 with field errors
    ✓ POST /auth/register — password too short → 422
    ✓ POST /auth/login — valid credentials → 200, returns user + access_token
    ✓ POST /auth/login — wrong password → 401, generic message (no "wrong password")
    ✓ POST /auth/login — nonexistent email → 401, same generic message
    ✓ POST /auth/refresh — valid cookie → 200 with new access_token, new cookie
    ✓ POST /auth/refresh — expired token → 401
    ✓ POST /auth/refresh — reused token (after rotation) → 401
    ✓ POST /auth/logout — valid cookie → 204, cookie cleared
    ✓ GET /auth/me — valid access_token → 200, returns user
    ✓ GET /auth/me — no token → 401
    ✓ GET /auth/me — expired access_token → 401
    ✓ GET /auth/me — malformed token → 401
    ```

**Test setup helper** (`apps/api/test/helpers/setup.ts`):
- Builds app with real Docker Postgres connection
- Before each test: truncate all tables in reverse FK order
- After all tests: close app and DB connections
- Export `createTestUser(overrides?)` helper — registers a user and returns `{ user, accessToken, cookie }` for use in other tests

**QA:**
- All 16 tests pass via `pnpm --filter @tastebook/api test`
- `pnpm typecheck` passes
- Manual: `curl -X POST localhost:3001/auth/register -H "Content-Type: application/json" -d '{"username":"alice","email":"alice@test.com","password":"password123"}' → 201`

### Task 1.2: User Module (Profile CRUD, Avatar Upload) ✅

**Goal**: Users can view and update their profile, and upload an avatar image to MinIO.

**Files to create:**

1. **`apps/api/src/shared/plugins/s3.ts`** — Fastify plugin that decorates app with an S3Client configured for MinIO. On startup: create the bucket if it doesn't exist (use `HeadBucket` → `CreateBucket` if 404). Configure bucket policy for public read access (so avatar URLs can be served directly).

2. **`apps/api/src/modules/users/users.service.ts`**:
   ```typescript
   class UsersService {
     async getProfile(targetUserId: string, viewerId?: string): Promise<UserResponse>
       // 1. Fetch user from DB (SELECT id, username, display_name, avatar_url, bio, created_at)
       // 2. Never return password_hash
       // 3. Count followers and following (2 count queries or subqueries)
       // 4. If viewerId provided:
       //    - is_following: check if viewer follows target
       //    - is_friend: check if mutual follow exists
       // 5. Return UserResponse

     async updateProfile(userId: string, data: UpdateProfileRequest): Promise<UserResponse>
       // 1. Update only provided fields in DB
       // 2. Update updated_at timestamp
       // 3. Return updated user profile

     async uploadAvatar(userId: string, fileBuffer: Buffer, mimeType: string): Promise<string>
       // 1. Validate mime type (JPEG, PNG, WebP only for avatars)
       // 2. Validate file size (max 5MB for avatars)
       // 3. Validate magic bytes match declared mime type
       // 4. Generate object key: `avatars/${userId}/${uuid}.${ext}`
       // 5. Upload to MinIO via S3 PutObject
       // 6. Update user.avatar_url in DB with full URL: `http://${MINIO_ENDPOINT}:${MINIO_PORT}/${BUCKET}/${key}`
       // 7. If user had a previous avatar, delete old object from MinIO (fire-and-forget, don't fail if cleanup fails)
       // 8. Return new avatar URL
   }
   ```

3. **`apps/api/src/modules/users/users.routes.ts`**:
   ```
   GET  /users/me          — auth required → 200 { data: UserResponse } (alias of /auth/me but in user context)
   GET  /users/:id         — optional auth → 200 { data: UserResponse }  (includes is_following/is_friend if authenticated)
   PATCH /users/me         — auth required, body: updateProfileSchema → 200 { data: UserResponse }
   POST /users/me/avatar   — auth required, multipart file upload → 200 { data: { avatar_url: string } }
   ```

4. **`apps/api/src/modules/users/users.test.ts`** — Integration tests:
   ```
   ✓ GET /users/:id — existing user → 200 with profile data (no password_hash)
   ✓ GET /users/:id — nonexistent user → 404
   ✓ GET /users/:id — authenticated viewer → includes is_following, is_friend fields
   ✓ PATCH /users/me — update display_name → 200, field updated
   ✓ PATCH /users/me — update bio → 200, field updated
   ✓ PATCH /users/me — no auth → 401
   ✓ POST /users/me/avatar — valid JPEG upload → 200, avatar_url set, file accessible via URL
   ✓ POST /users/me/avatar — file too large (>5MB) → 422
   ✓ POST /users/me/avatar — invalid file type → 422
   ✓ POST /users/me/avatar — replaces previous avatar (old object deleted from MinIO)
   ```

**QA:**
- All 10 tests pass
- Manual: upload avatar via `curl -X POST localhost:3001/users/me/avatar -H "Authorization: Bearer $TOKEN" -F "file=@photo.jpg"` → 200, avatar URL accessible in browser

---

## Phase 2: Core Content

_Depends on: Phase 1 complete (auth middleware needed for all routes)._

### Task 2.1: Media Upload Service (MinIO Integration) ✅

**Goal**: A standalone media upload endpoint that accepts images, validates them, stores them in MinIO, and returns a `mediaId`. This is a decoupled service — media is uploaded independently, then attached to entries during creation.

**Files to create:**

1. **`apps/api/src/modules/media/media.service.ts`**:
   ```typescript
   class MediaService {
     async uploadImage(userId: string, fileBuffer: Buffer, mimeType: string, fileName: string): Promise<MediaResponse>
       // 1. Validate file size ≤ 10MB (LIMITS.MAX_IMAGE_SIZE_BYTES)
       // 2. Validate MIME type against LIMITS.ALLOWED_IMAGE_TYPES
       // 3. Validate magic bytes match declared MIME type:
       //    - JPEG: starts with FF D8 FF
       //    - PNG: starts with 89 50 4E 47
       //    - WebP: starts with 52 49 46 46 ... 57 45 42 50
       //    - HEIC: starts with 00 00 00 .. 66 74 79 70 (ftyp box)
       //    If mismatch → throw 422 "File content does not match declared type"
       // 4. Generate object key: `entries/${userId}/${uuidv4()}.${ext}`
       //    ext derived from validated MIME type, NOT from fileName
       // 5. Upload to MinIO via S3 PutObject with Content-Type header
       // 6. Insert row into entry_media table:
       //    { id, entry_id: null, user_id, url: objectKey, mime_type, size_bytes, order_index: 0 }
       //    entry_id is NULL — media is "orphaned" until attached to an entry
       // 7. Return MediaResponse { id, url: fullMinioUrl, mime_type, order_index }

     async attachMediaToEntry(mediaIds: string[], entryId: string, userId: string): Promise<void>
       // 1. Fetch all media rows by IDs where user_id matches AND entry_id IS NULL
       // 2. If count doesn't match mediaIds.length → throw 422 "One or more media not found or already attached"
       // 3. Update all matching rows: set entry_id = entryId, set order_index = array position
       // 4. If an entry already has media attached, new media order_index starts after existing max

     async deleteMediaByEntryId(entryId: string): Promise<void>
       // 1. Fetch all media for entry
       // 2. Delete objects from MinIO (batch, fire-and-forget for failures)
       // 3. Delete rows from entry_media table (handled by cascade if entry is deleted)

     async getMediaUrl(objectKey: string): string
       // Construct full URL: `http://${MINIO_ENDPOINT}:${MINIO_PORT}/${BUCKET}/${objectKey}`
       // In production this would be a CDN URL — for MVP, direct MinIO URL is fine
   }
   ```

2. **`apps/api/src/modules/media/media.routes.ts`**:
   ```
   POST /media/upload  — auth required, multipart file → 201 { data: MediaResponse }
   ```
   - Uses `@fastify/multipart` to consume the upload stream
   - Reads full file into buffer (acceptable for ≤10MB files)
   - Calls `mediaService.uploadImage()`

3. **`apps/api/src/modules/media/media.test.ts`** — Integration tests:
   ```
   ✓ POST /media/upload — valid JPEG (1KB test fixture) → 201, returns mediaId + url
   ✓ POST /media/upload — valid PNG → 201
   ✓ POST /media/upload — valid WebP → 201
   ✓ POST /media/upload — file too large (>10MB) → 422
   ✓ POST /media/upload — unsupported type (text/plain) → 422
   ✓ POST /media/upload — MIME type mismatch (says image/jpeg, actually PNG) → 422
   ✓ POST /media/upload — no auth → 401
   ✓ POST /media/upload — uploaded file accessible via returned URL (GET the URL → 200)
   ✓ Media row has entry_id = null after upload (orphaned)
   ```

**Test fixtures**: Create small valid test images. Use 1x1 pixel images generated programmatically in the test setup:
```typescript
// Minimal valid JPEG (1x1 pixel)
const TINY_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQ...', 'base64');
// Minimal valid PNG (1x1 pixel)  
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA...', 'base64');
```
Put these in `apps/api/test/helpers/fixtures.ts`.

**QA:**
- All 9 tests pass
- Manual: upload an actual photo from disk → verify it's accessible at the returned URL in a browser

### Task 2.2: Taste Entry Module (CRUD with Visibility & Media) ✅

**Goal**: Full CRUD for Taste Entries with visibility enforcement, media attachment, and proper ownership checks.

**Files to create:**

1. **`apps/api/src/modules/entries/entries.service.ts`**:
   ```typescript
   class EntriesService {
     async create(userId: string, data: CreateEntryRequest): Promise<EntryResponse>
       // 1. Validate: if media_ids provided, must be ≤ 5 (LIMITS.MAX_IMAGES_PER_ENTRY)
       // 2. Insert into taste_entries table
       // 3. If media_ids provided, call mediaService.attachMediaToEntry(media_ids, entryId, userId)
       // 4. Fetch the created entry with media + user info
       // 5. Return full EntryResponse

     async getById(entryId: string, viewerId?: string): Promise<EntryResponse>
       // 1. Fetch entry with user info + media (JOIN entry_media ORDER BY order_index)
       // 2. If not found → throw 404
       // 3. Visibility check:
       //    - 'private' and viewer is not owner → throw 404 (not 403)
       //    - 'friends' and viewer is not owner:
       //      a. If no viewerId → throw 404
       //      b. Check if owner and viewer are mutual follows → if not, throw 404
       //    - 'public' → allow
       // 4. Return EntryResponse

     async update(entryId: string, userId: string, data: UpdateEntryRequest): Promise<EntryResponse>
       // 1. Fetch entry
       // 2. If not found → throw 404
       // 3. If entry.user_id !== userId → throw 403
       // 4. Update only provided fields + updated_at
       // 5. If visibility changed, invalidate feed cache (see feed module — for now, just update the row)
       // 6. Return updated EntryResponse

     async delete(entryId: string, userId: string): Promise<void>
       // 1. Fetch entry
       // 2. If not found → throw 404
       // 3. If entry.user_id !== userId → throw 403
       // 4. Delete media from MinIO (via mediaService.deleteMediaByEntryId)
       // 5. Delete entry from DB (cascade deletes entry_media rows, list_items referencing this entry)
       // 6. Invalidate relevant feed caches (increment version key)

     async listByUser(targetUserId: string, viewerId: string | undefined, cursor?: string, limit = 20): Promise<PaginatedResponse<EntryResponse>>
       // 1. Determine visibility filter:
       //    - viewer is owner → show all (public + friends + private)
       //    - viewer is friend (mutual follow) → show public + friends
       //    - viewer is follower only → show public
       //    - viewer is null/anonymous → show public
       // 2. Query with cursor pagination: WHERE (created_at, id) < (cursorTimestamp, cursorId)
       // 3. Fetch limit+1 to determine hasMore
       // 4. Include media for each entry (LEFT JOIN entry_media)
       // 5. Encode next cursor if hasMore
       // 6. Return PaginatedResponse
   }
   ```

2. **`apps/api/src/modules/entries/entries.routes.ts`**:
   ```
   POST   /entries         — auth required, body: createEntrySchema → 201 { data: EntryResponse }
   GET    /entries/:id     — optional auth → 200 { data: EntryResponse }
   PATCH  /entries/:id     — auth required, body: updateEntrySchema → 200 { data: EntryResponse }
   DELETE /entries/:id     — auth required → 204
   GET    /users/:id/entries — optional auth, query: cursorPaginationSchema → 200 { data: EntryResponse[], cursor? }
   ```

3. **`apps/api/src/modules/entries/entries.schema.ts`** — Fastify route schemas wrapping shared Zod schemas. Add JSON schema for Fastify's built-in serialization (response serialization).

4. **`apps/api/src/modules/entries/entries.test.ts`** — Integration tests:
   ```
   Setup: create 2 test users (alice, bob). Make them mutual follows for friend tests.

   Create:
   ✓ POST /entries — valid entry without media → 201, returns EntryResponse
   ✓ POST /entries — valid entry with 3 media_ids → 201, media attached in order
   ✓ POST /entries — more than 5 media_ids → 422
   ✓ POST /entries — invalid media_id (not owned by user) → 422
   ✓ POST /entries — missing dish_name → 422
   ✓ POST /entries — rating out of range (11) → 422
   ✓ POST /entries — no auth → 401

   Read:
   ✓ GET /entries/:id — public entry, no auth → 200
   ✓ GET /entries/:id — public entry, authenticated → 200
   ✓ GET /entries/:id — friends-only entry, viewer is friend → 200
   ✓ GET /entries/:id — friends-only entry, viewer is not friend → 404
   ✓ GET /entries/:id — private entry, viewer is owner → 200
   ✓ GET /entries/:id — private entry, viewer is not owner → 404
   ✓ GET /entries/:id — nonexistent ID → 404

   Update:
   ✓ PATCH /entries/:id — owner updates dish_name → 200, name changed
   ✓ PATCH /entries/:id — non-owner → 403
   ✓ PATCH /entries/:id — change visibility from public to private → 200

   Delete:
   ✓ DELETE /entries/:id — owner → 204, entry gone, media deleted from MinIO
   ✓ DELETE /entries/:id — non-owner → 403

   List by user:
   ✓ GET /users/:id/entries — returns paginated entries, most recent first
   ✓ GET /users/:id/entries — cursor pagination works (page 1 then page 2)
   ✓ GET /users/:id/entries — visibility filtering (non-friend sees only public)
   ```

**QA:**
- All 22 tests pass
- `pnpm typecheck` passes
- Manual: create an entry with 2 photos → `GET /entries/:id` returns both photos in order

---

## Phase 3: Social Graph

_Depends on: Phase 1 complete (users must exist)._

### Task 3.1: Social Module (Follow, Unfollow, Friends, Lists) ✅

**Goal**: Implement the social graph — follow/unfollow, friend detection (mutual follow), follower/following lists with pagination.

**Files to create:**

1. **`apps/api/src/modules/social/social.service.ts`**:
   ```typescript
   class SocialService {
     async follow(followerId: string, targetId: string): Promise<void>
       // 1. If followerId === targetId → throw 422 "Cannot follow yourself"
       // 2. Verify target user exists → if not, throw 404
       // 3. INSERT INTO follows (follower_id, following_id) ON CONFLICT DO NOTHING
       //    — idempotent: if already following, do nothing (no error)
       //    — However, if the follow already existed, return 409 "Already following"
       //    — Implementation: use RETURNING or check rowCount. If 0 rows inserted → 409
       // 4. Invalidate feed cache for followerId (they'll now see targetId's entries)
       //    — Increment feed version key: INCR `feed_version:${followerId}`

     async unfollow(followerId: string, targetId: string): Promise<void>
       // 1. DELETE FROM follows WHERE follower_id = $1 AND following_id = $2
       // 2. If 0 rows deleted → throw 404 "Not following this user"
       // 3. Invalidate feed cache for followerId

     async isFollowing(followerId: string, targetId: string): Promise<boolean>
       // Simple existence check on follows table

     async areFriends(userA: string, userB: string): Promise<boolean>
       // Check mutual follow: A follows B AND B follows A
       // Query:
       //   SELECT COUNT(*) FROM follows
       //   WHERE (follower_id = $1 AND following_id = $2)
       //      OR (follower_id = $2 AND following_id = $1)
       // Result = 2 means mutual follow (friends)

     async getFollowers(userId: string, cursor?: string, limit = 20): Promise<PaginatedResponse<UserResponse>>
       // 1. SELECT users.* FROM users
       //    JOIN follows ON follows.follower_id = users.id
       //    WHERE follows.following_id = $userId
       //    AND (follows.created_at, users.id) < (cursorTimestamp, cursorId)
       //    ORDER BY follows.created_at DESC, users.id DESC
       //    LIMIT $limit + 1
       // 2. For each follower, include is_following (does the target user follow them back?)
       // 3. Encode cursor, return paginated

     async getFollowing(userId: string, cursor?: string, limit = 20): Promise<PaginatedResponse<UserResponse>>
       // Same pattern but JOIN direction reversed:
       //   follows.following_id = users.id WHERE follows.follower_id = $userId

     async getFollowerCount(userId: string): Promise<number>
       // SELECT COUNT(*) FROM follows WHERE following_id = $userId

     async getFollowingCount(userId: string): Promise<number>
       // SELECT COUNT(*) FROM follows WHERE follower_id = $userId

     async getFriends(userId: string, cursor?: string, limit = 20): Promise<PaginatedResponse<UserResponse>>
       // Mutual follows: users who userId follows AND who follow userId back
       // SELECT u.* FROM users u
       //   JOIN follows f1 ON f1.following_id = u.id AND f1.follower_id = $userId
       //   JOIN follows f2 ON f2.follower_id = u.id AND f2.following_id = $userId
       //   ORDER BY f1.created_at DESC
       //   LIMIT $limit + 1
   }
   ```

2. **`apps/api/src/modules/social/social.routes.ts`**:
   ```
   POST   /users/:id/follow      — auth required → 204 (success) or 409 (already following)
   DELETE /users/:id/follow      — auth required → 204 (success) or 404 (not following)
   GET    /users/:id/followers   — optional auth, query: cursorPaginationSchema → 200 { data: UserResponse[], cursor? }
   GET    /users/:id/following   — optional auth, query: cursorPaginationSchema → 200 { data: UserResponse[], cursor? }
   GET    /users/:id/friends     — optional auth, query: cursorPaginationSchema → 200 { data: UserResponse[], cursor? }
   ```

3. **`apps/api/src/modules/social/social.test.ts`** — Integration tests:
   ```
   Setup: create 3 test users (alice, bob, carol)

   Follow:
   ✓ POST /users/:id/follow — alice follows bob → 204
   ✓ POST /users/:id/follow — alice follows bob again → 409
   ✓ POST /users/:id/follow — alice follows self → 422
   ✓ POST /users/:id/follow — follow nonexistent user → 404
   ✓ POST /users/:id/follow — no auth → 401

   Unfollow:
   ✓ DELETE /users/:id/follow — alice unfollows bob (was following) → 204
   ✓ DELETE /users/:id/follow — alice unfollows bob (was NOT following) → 404

   Friend detection:
   ✓ alice follows bob → GET /users/bob includes is_following: true, is_friend: false
   ✓ bob follows alice back → GET /users/bob includes is_following: true, is_friend: true
   ✓ alice unfollows bob → GET /users/bob includes is_following: false, is_friend: false

   Follower/Following lists:
   ✓ GET /users/:id/followers — returns paginated list of followers
   ✓ GET /users/:id/following — returns paginated list of following
   ✓ GET /users/:id/friends — returns only mutual follows
   ✓ Cursor pagination works across all list endpoints (create 25 follows, paginate with limit=10)

   Edge cases:
   ✓ Unfollow after follow → follow count decrements correctly
   ✓ DELETE user cascades → removes all follow relationships
   ```

**QA:**
- All 16 tests pass
- `pnpm typecheck` passes
- Manual: follow a user, check profile → `is_following: true`. Have them follow back → `is_friend: true`

---

## Phase 4: Feed System

_Depends on: Phase 2 (entries exist) + Phase 3 (follow graph exists)._

### Task 4.1: Feed Query Spike (Performance Validation) ✅ (skipped — built directly)

**Goal**: Write and benchmark the feed SQL query BEFORE building the full feed module. This is the highest-risk technical component — if the fan-out-on-read query is too slow, we need to know now and pivot strategy before building frontend that depends on it.

**This is a validation task, NOT a feature task. Output is a benchmark result and a go/no-go decision.**

**What to do:**

1. **Create a seed script** at `apps/api/scripts/seed-feed-benchmark.ts`:
   - Insert 100 users
   - For each user, create a random follow graph (each user follows 10-50 random others)
   - Create ~30 mutual follow pairs (friends)
   - Insert 5,000 total taste entries spread across users (50 per user avg), with random created_at timestamps spanning 30 days, random visibility (70% public, 20% friends, 10% private)
   - Run via `tsx apps/api/scripts/seed-feed-benchmark.ts`

2. **Write the raw feed query** (not in Drizzle yet — raw SQL) in `apps/api/scripts/benchmark-feed.ts`:

   ```sql
   -- The 3-tier feed query for user $1, cursor ($2, $3), limit $4
   WITH
     -- Tier 1: Friend entries (mutual follows) — public + friends visibility
     friend_entries AS (
       SELECT te.id, te.user_id, te.dish_name, te.created_at, te.visibility,
              1 AS tier
       FROM taste_entries te
       JOIN follows f1 ON f1.following_id = te.user_id AND f1.follower_id = $1
       JOIN follows f2 ON f2.follower_id = te.user_id AND f2.following_id = $1
       WHERE te.visibility IN ('public', 'friends')
         AND (te.created_at, te.id) < ($2, $3)
       ORDER BY te.created_at DESC, te.id DESC
       LIMIT $4
     ),
     -- Tier 2: Follow entries (non-mutual) — public only
     follow_entries AS (
       SELECT te.id, te.user_id, te.dish_name, te.created_at, te.visibility,
              2 AS tier
       FROM taste_entries te
       JOIN follows f ON f.following_id = te.user_id AND f.follower_id = $1
       WHERE te.visibility = 'public'
         AND NOT EXISTS (
           SELECT 1 FROM follows f2
           WHERE f2.follower_id = te.user_id AND f2.following_id = $1
         )
         AND (te.created_at, te.id) < ($2, $3)
       ORDER BY te.created_at DESC, te.id DESC
       LIMIT $4
     ),
     -- Tier 3: Own entries — all visibility
     own_entries AS (
       SELECT te.id, te.user_id, te.dish_name, te.created_at, te.visibility,
              0 AS tier
       FROM taste_entries te
       WHERE te.user_id = $1
         AND (te.created_at, te.id) < ($2, $3)
       ORDER BY te.created_at DESC, te.id DESC
       LIMIT $4
     ),
     -- Combine and deduplicate
     combined AS (
       SELECT * FROM own_entries
       UNION ALL
       SELECT * FROM friend_entries
       UNION ALL
       SELECT * FROM follow_entries
     )
   SELECT DISTINCT ON (id) *
   FROM combined
   ORDER BY created_at DESC, id DESC
   LIMIT $4;
   ```

3. **Benchmark**:
   - Run the query 100 times for 5 different users (varying follow counts)
   - Measure: p50, p95, p99 latency
   - Run `EXPLAIN ANALYZE` and save the output
   - **Decision threshold**: If p95 < 200ms → GO (proceed with fan-out-on-read). If p95 > 200ms → investigate index tuning. If p95 > 500ms after tuning → pivot to simpler feed (chronological follows only, no tiered ranking).

4. **Also test the simpler fallback query** (no tiered ranking, just chronological from all followed users):
   ```sql
   SELECT te.* FROM taste_entries te
   JOIN follows f ON f.following_id = te.user_id AND f.follower_id = $1
   WHERE te.visibility = 'public'
     AND (te.created_at, te.id) < ($2, $3)
   UNION ALL
   -- friends (mutual follows) see friends-visibility too
   SELECT te.* FROM taste_entries te
   JOIN follows f1 ON f1.following_id = te.user_id AND f1.follower_id = $1
   JOIN follows f2 ON f2.follower_id = te.user_id AND f2.following_id = $1
   WHERE te.visibility IN ('public', 'friends')
     AND (te.created_at, te.id) < ($2, $3)
   ORDER BY created_at DESC, id DESC
   LIMIT $4;
   ```

5. **Output**: Print results to console + save to `apps/api/scripts/benchmark-results.txt` (gitignored). Include EXPLAIN ANALYZE output.

**QA:**
- Seed script runs without error and creates expected row counts
- Benchmark completes and prints results
- Decision documented: "Feed query p95 = Xms → GO" or "Feed query p95 = Xms → using simplified query"
- If go → delete seed data: `TRUNCATE taste_entries, follows, users CASCADE`

### Task 4.2: Feed Module (Full Implementation with Redis Cache) ✅

**Goal**: Build the production feed endpoint with cursor pagination, visibility filtering, Redis caching, and the query validated in Task 4.1.

**Files to create:**

1. **`apps/api/src/shared/utils/cursor.ts`**:
   ```typescript
   interface CursorData {
     t: string;  // ISO timestamp (created_at)
     i: string;  // UUID (entry id)
   }

   export function encodeCursor(createdAt: Date, id: string): string {
     const data: CursorData = { t: createdAt.toISOString(), i: id };
     return Buffer.from(JSON.stringify(data)).toString('base64url');
   }

   export function decodeCursor(cursor: string): { timestamp: string; id: string } {
     try {
       const data: CursorData = JSON.parse(
         Buffer.from(cursor, 'base64url').toString('utf-8')
       );
       return { timestamp: data.t, id: data.i };
     } catch {
       throw new ValidationError('Invalid cursor format');
     }
   }
   ```

2. **`apps/api/src/modules/feed/feed.service.ts`**:
   ```typescript
   class FeedService {
     async getFeed(userId: string, cursor?: string, limit = 20): Promise<PaginatedResponse<EntryResponse>>
       // 1. Check Redis cache:
       //    - Cache key pattern: `feed:${userId}:v${version}:${cursorHash}`
       //    - Version key: `feed_version:${userId}` (incremented on follow/unfollow/new entry by followed user)
       //    - If cache hit → deserialize and return immediately
       //
       // 2. Cache miss → query database:
       //    a. Decode cursor if provided → (timestamp, id) for WHERE clause
       //    b. Execute the tiered feed query (from Task 4.1 — whichever variant passed the benchmark)
       //    c. Include own entries (tier 0)
       //    d. Include friend entries — public + friends visibility (tier 1)
       //    e. Include follow entries — public only (tier 2)
       //    f. Merge, deduplicate by entry ID, sort by created_at DESC, id DESC
       //    g. Take limit+1 results. If got limit+1 → hasMore = true, slice to limit
       //
       // 3. For EACH entry in results, fetch:
       //    - Author info (user row — id, username, display_name, avatar_url)
       //    - Media (entry_media rows — LEFT JOIN, ordered by order_index)
       //    Use a single query with JOINs, NOT N+1 queries.
       //
       // 4. Build cursor from last entry: encodeCursor(lastEntry.created_at, lastEntry.id)
       //
       // 5. Cache result in Redis:
       //    - SET `feed:${userId}:v${version}:${cursorHash}` with TTL = LIMITS.FEED_CACHE_TTL_SECONDS (60s)
       //    - cursorHash = SHA-256 of cursor string (or "first" for no cursor)
       //
       // 6. Return PaginatedResponse<EntryResponse>

     async getPublicFeed(cursor?: string, limit = 20): Promise<PaginatedResponse<EntryResponse>>
       // For unauthenticated users or new users with no follows
       // Simple query: recent public entries ordered by created_at DESC
       // Same cursor pagination pattern
       // Redis cached with key `feed:public:${cursorHash}`, TTL = 30s

     async invalidateUserFeed(userId: string): Promise<void>
       // Increment version key: INCR `feed_version:${userId}`
       // Old cache entries expire naturally via TTL (60s)
       // No need to scan/delete old keys

     async invalidateFollowerFeeds(authorId: string): Promise<void>
       // When an author creates/deletes an entry or changes visibility:
       // 1. Get all followers of authorId from DB
       // 2. For each follower, INCR `feed_version:${followerId}`
       // 3. Also INCR `feed_version:${authorId}` (own feed)
       // NOTE: At scale this is O(follower_count). Acceptable for MVP.
       // For 10K+ followers, batch into chunks of 100 with pipeline.
   }
   ```

3. **`apps/api/src/modules/feed/feed.routes.ts`**:
   ```
   GET /feed  — auth required, query: cursorPaginationSchema → 200 { data: EntryResponse[], cursor? }
   ```
   - Auth required — unauthenticated users get 401
   - If user follows nobody, fall back to `getPublicFeed()` (discovery mode)

4. **Integrate feed invalidation hooks** — edit existing modules (do NOT create new files, edit existing service files):
   - `entries.service.ts`: After create/delete/update-visibility → call `feedService.invalidateFollowerFeeds(entry.user_id)`
   - `social.service.ts`: After follow/unfollow → call `feedService.invalidateUserFeed(followerId)`

5. **`apps/api/src/modules/feed/feed.test.ts`** — Integration tests:
   ```
   Setup: create 3 users (alice, bob, carol). alice follows bob. alice and carol are mutual follows (friends).

   Core feed:
   ✓ GET /feed — alice sees bob's public entries
   ✓ GET /feed — alice sees carol's public AND friends-only entries (they're friends)
   ✓ GET /feed — alice does NOT see carol's private entries
   ✓ GET /feed — alice sees her own entries (all visibility levels)
   ✓ GET /feed — alice does NOT see entries from users she doesn't follow
   ✓ GET /feed — bob's friends-only entry NOT visible to alice (alice follows bob, bob doesn't follow alice)

   Pagination:
   ✓ GET /feed — create 30 entries, fetch with limit=10 → returns 10 entries + cursor
   ✓ GET /feed?cursor=X — second page returns next 10
   ✓ GET /feed?cursor=Y — third page returns last 10, no cursor (end of feed)
   ✓ GET /feed — entries ordered by created_at DESC (most recent first)
   ✓ GET /feed — invalid cursor → 422

   Caching:
   ✓ Second identical request hits Redis cache (verify by checking Redis key exists)
   ✓ After bob creates new entry → alice's feed cache invalidated (version incremented)
   ✓ After alice unfollows bob → alice's feed no longer shows bob's entries

   Edge cases:
   ✓ New user with no follows → returns public discovery feed
   ✓ GET /feed — no auth → 401
   ✓ Deleted entry does not appear in feed (even if cached)
   ✓ Entry visibility changed from public to private → disappears from non-owner feeds after cache expires
   ```

**QA:**
- All 18 tests pass
- `pnpm typecheck` passes
- Manual: create entries from 2 users, follow one → feed shows their entries. Unfollow → they disappear after cache TTL

---

## Phase 5: Lists

_Depends on: Phase 2 (entries to add to lists)._

### Task 5.1: List Module (CRUD, Items, Reorder) ✅

**Goal**: Users can create curated lists of Taste Entries, add/remove entries, and reorder items. Lists behave like Spotify playlists — shareable, editable, and visible based on owner's visibility setting.

**Files to create:**

1. **`apps/api/src/modules/lists/lists.service.ts`**:
   ```typescript
   class ListsService {
     async create(userId: string, data: CreateListRequest): Promise<ListResponse>
       // 1. Count user's existing lists. If >= LIMITS.MAX_LISTS_PER_USER (50) → throw 422 "Maximum lists reached"
       // 2. Insert into lists table
       // 3. Return ListResponse (item_count = 0)

     async getById(listId: string, viewerId?: string): Promise<ListResponse & { items: EntryResponse[] }>
       // 1. Fetch list with owner info
       // 2. If not found → throw 404
       // 3. Visibility check (same pattern as entries):
       //    - 'private' and viewer is not owner → throw 404
       //    - 'friends' and viewer is not owner and not friend → throw 404
       //    - 'public' → allow
       // 4. Fetch list_items JOIN taste_entries JOIN entry_media JOIN users
       //    ORDER BY list_items.order_index ASC
       // 5. For each entry in the list, apply entry-level visibility filtering:
       //    - A list may contain friends-only or private entries
       //    - Filter OUT entries the viewer can't see (don't throw — just omit them)
       //    - This means item_count may differ from visible items for non-owner viewers
       // 6. Return ListResponse with items array

     async update(listId: string, userId: string, data: UpdateListRequest): Promise<ListResponse>
       // 1. Fetch list → 404 if not found
       // 2. Ownership check → 403 if not owner
       // 3. Update provided fields + updated_at
       // 4. Return updated ListResponse

     async delete(listId: string, userId: string): Promise<void>
       // 1. Fetch list → 404 if not found
       // 2. Ownership check → 403 if not owner
       // 3. DELETE list (cascade deletes list_items)

     async addItem(listId: string, userId: string, entryId: string): Promise<void>
       // 1. Fetch list → 404 if not found
       // 2. Ownership check → 403 if not owner
       // 3. Verify entry exists → 404 if not found
       // 4. Count existing items. If >= LIMITS.MAX_ITEMS_PER_LIST (100) → throw 422 "Maximum items reached"
       // 5. Check if entry already in list (unique constraint) → 409 "Entry already in list"
       // 6. Get current max order_index for this list
       // 7. INSERT list_item with order_index = max + 1

     async removeItem(listId: string, userId: string, entryId: string): Promise<void>
       // 1. Fetch list → 404 if not found
       // 2. Ownership check → 403 if not owner
       // 3. DELETE FROM list_items WHERE list_id = $1 AND entry_id = $2
       // 4. If 0 rows deleted → 404 "Entry not in list"
       // NOTE: Do NOT re-index remaining items — gaps in order_index are fine

     async reorderItems(listId: string, userId: string, itemIds: string[]): Promise<void>
       // 1. Fetch list → 404 if not found
       // 2. Ownership check → 403 if not owner
       // 3. Fetch all list_item IDs for this list
       // 4. Validate: itemIds must contain EXACTLY the same set of IDs (no additions, no removals, no duplicates)
       //    If mismatch → throw 422 "Item IDs don't match existing items"
       // 5. In a transaction:
       //    FOR EACH (itemId, index) in itemIds:
       //      UPDATE list_items SET order_index = index WHERE id = itemId AND list_id = listId
       // 6. Respond 200

     async listByUser(userId: string, viewerId?: string, cursor?: string, limit = 20): Promise<PaginatedResponse<ListResponse>>
       // 1. Visibility filter (same as entries — owner sees all, friends see public+friends, others see public)
       // 2. Cursor pagination by (created_at DESC, id DESC)
       // 3. Include item_count as a subquery COUNT
       // 4. Return paginated list
   }
   ```

2. **`apps/api/src/modules/lists/lists.routes.ts`**:
   ```
   POST   /lists              — auth required, body: createListSchema → 201 { data: ListResponse }
   GET    /lists/:id          — optional auth → 200 { data: ListResponse & { items: EntryResponse[] } }
   PATCH  /lists/:id          — auth required, body: updateListSchema → 200 { data: ListResponse }
   DELETE /lists/:id          — auth required → 204
   POST   /lists/:id/items    — auth required, body: { entry_id: uuid } → 201
   DELETE /lists/:id/items/:entryId — auth required → 204
   PATCH  /lists/:id/items/reorder — auth required, body: reorderItemsSchema → 200
   GET    /users/:id/lists    — optional auth, query: cursorPaginationSchema → 200 { data: ListResponse[], cursor? }
   ```

3. **`apps/api/src/modules/lists/lists.schema.ts`** — Fastify route schemas wrapping shared Zod schemas + additional request body schemas (addItem body: `{ entry_id: z.string().uuid() }`).

4. **`apps/api/src/modules/lists/lists.test.ts`** — Integration tests:
   ```
   Setup: create 2 users (alice, bob), make them friends. Create 3 entries for alice.

   CRUD:
   ✓ POST /lists — valid list → 201
   ✓ POST /lists — missing title → 422
   ✓ POST /lists — no auth → 401
   ✓ GET /lists/:id — public list → 200 with empty items array
   ✓ GET /lists/:id — friends-only list, viewer is friend → 200
   ✓ GET /lists/:id — friends-only list, viewer is not friend → 404
   ✓ GET /lists/:id — private list, viewer is not owner → 404
   ✓ PATCH /lists/:id — owner updates title → 200
   ✓ PATCH /lists/:id — non-owner → 403
   ✓ DELETE /lists/:id — owner → 204
   ✓ DELETE /lists/:id — non-owner → 403

   Items:
   ✓ POST /lists/:id/items — add entry to list → 201
   ✓ POST /lists/:id/items — add same entry again → 409
   ✓ POST /lists/:id/items — nonexistent entry → 404
   ✓ POST /lists/:id/items — non-owner adds to list → 403
   ✓ DELETE /lists/:id/items/:entryId — remove entry → 204
   ✓ DELETE /lists/:id/items/:entryId — entry not in list → 404
   ✓ GET /lists/:id — shows items in correct order

   Reorder:
   ✓ PATCH /lists/:id/items/reorder — reorder 3 items → 200, order updated
   ✓ PATCH /lists/:id/items/reorder — wrong item IDs → 422
   ✓ PATCH /lists/:id/items/reorder — duplicate IDs → 422

   Limits:
   ✓ Creating 51st list → 422 "Maximum lists reached"
   ✓ Adding 101st item → 422 "Maximum items reached"

   Cascades:
   ✓ Delete an entry → list_item referencing it is removed, list still works
   ✓ Delete a user → their lists cascade deleted

   User lists:
   ✓ GET /users/:id/lists — returns paginated lists with item counts
   ✓ GET /users/:id/lists — visibility filtering works
   ```

**QA:**
- All 27 tests pass
- `pnpm typecheck` passes
- Manual: create list → add 3 entries → reorder → fetch list detail → items appear in new order

---

## Phase 6: Frontend

_Depends on: Phase 0–5 complete (all API endpoints available). Can start Task 6.1 earlier (app shell doesn't need full API)._

### Task 6.1: App Shell, Layout & Providers ✅

**Goal**: Set up the Next.js 15 app with Tailwind CSS, TanStack Query provider, Zustand auth store, API client, and the two layout groups: `(auth)` for login/register (no navigation) and `(main)` for everything else (with bottom nav bar).

**Files to create:**

1. **`apps/web/src/lib/api-client.ts`** — Centralized fetch wrapper:
   ```typescript
   const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

   class ApiClient {
     private accessToken: string | null = null;

     setAccessToken(token: string | null) { this.accessToken = token; }

     async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
       const headers: Record<string, string> = {
         ...options.headers as Record<string, string>,
       };
       if (this.accessToken) {
         headers['Authorization'] = `Bearer ${this.accessToken}`;
       }
       // Don't set Content-Type for FormData (browser sets multipart boundary)
       if (!(options.body instanceof FormData)) {
         headers['Content-Type'] = 'application/json';
       }

       const res = await fetch(`${API_BASE}${path}`, {
         ...options,
         headers,
         credentials: 'include', // sends refresh token cookie
       });

       if (res.status === 401 && this.accessToken) {
         // Try refresh
         const refreshed = await this.refreshToken();
         if (refreshed) {
           headers['Authorization'] = `Bearer ${this.accessToken}`;
           const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
           if (!retryRes.ok) throw await this.parseError(retryRes);
           if (retryRes.status === 204) return undefined as T;
           return (await retryRes.json()).data;
         }
         // Refresh failed → redirect to login
         window.location.href = '/login';
         throw new Error('Session expired');
       }

       if (!res.ok) throw await this.parseError(res);
       if (res.status === 204) return undefined as T;
       return (await res.json()).data;
     }

     private async refreshToken(): Promise<boolean> {
       try {
         const res = await fetch(`${API_BASE}/auth/refresh`, {
           method: 'POST',
           credentials: 'include',
         });
         if (!res.ok) return false;
         const { data } = await res.json();
         this.accessToken = data.access_token;
         return true;
       } catch { return false; }
     }

     private async parseError(res: Response) {
       const body = await res.json().catch(() => ({}));
       return new ApiError(res.status, body.error?.code || 'UNKNOWN', body.error?.message || 'An error occurred');
     }
   }

   export const api = new ApiClient();
   ```

2. **`apps/web/src/lib/api-error.ts`** — Custom error class:
   ```typescript
   export class ApiError extends Error {
     constructor(public status: number, public code: string, message: string) {
       super(message);
     }
   }
   ```

3. **`apps/web/src/stores/auth-store.ts`** — Zustand store:
   ```typescript
   interface AuthState {
     user: UserResponse | null;
     isAuthenticated: boolean;
     isLoading: boolean;  // true until initial auth check completes
     setUser: (user: UserResponse | null) => void;
     setAccessToken: (token: string) => void;
     logout: () => Promise<void>;
     checkAuth: () => Promise<void>;  // called on app mount — tries /auth/me
   }
   ```
   - On `setAccessToken`: call `api.setAccessToken(token)` — keep API client in sync
   - On `logout`: POST `/auth/logout`, clear token, set user = null, redirect to `/login`
   - On `checkAuth`: try GET `/auth/me`. If 200 → set user. If 401 → set user = null, isAuthenticated = false.

4. **`apps/web/src/app/providers.tsx`** — Client component wrapping children with:
   - `QueryClientProvider` (TanStack Query — configure default staleTime: 30s, gcTime: 5min)
   - Auth initialization (call `checkAuth()` on mount)
   - Render children only after `isLoading` is false (prevents flash of wrong state)

5. **`apps/web/src/app/layout.tsx`** — Root layout:
   - Import global CSS (Tailwind)
   - Wrap children in `<Providers>`
   - Set metadata: title "Tastebook", description, viewport for mobile-first
   - Font: Inter from `next/font/google`

6. **`apps/web/src/app/page.tsx`** — Root page:
   - If authenticated → redirect to `/feed`
   - If not → redirect to `/login`

7. **`apps/web/src/app/(auth)/layout.tsx`** — Auth layout:
   - Centered layout, no navigation
   - Max width container (sm:max-w-md), vertically centered
   - Simple Tastebook logo/wordmark at top

8. **`apps/web/src/app/(main)/layout.tsx`** — Main layout:
   - Fixed bottom navigation bar (mobile-first) with 4 tabs:
     - Feed (home icon) → `/feed`
     - New Entry (plus icon) → `/entries/new`
     - Lists (bookmark icon) → `/lists`
     - Profile (user icon) → `/profile`
   - Active tab highlighted
   - Content area scrolls above the fixed nav
   - On desktop (md+): side navigation instead of bottom nav

9. **`apps/web/src/components/ui/`** — Create these reusable primitives (minimal, Tailwind-styled):
   - `Button.tsx` — primary/secondary/ghost variants, loading state with spinner, disabled state
   - `Input.tsx` — text input with label, error message display, forwardRef for react-hook-form
   - `Textarea.tsx` — same pattern as Input
   - `Avatar.tsx` — circular image with fallback initials, sizes: sm/md/lg
   - `Spinner.tsx` — loading spinner animation
   - `EmptyState.tsx` — icon + title + description + optional action button

10. **Tailwind CSS configuration** (`apps/web/tailwind.config.ts`):
    - Content paths: `./src/**/*.{ts,tsx}`
    - Custom colors: define a `tastebook` color palette (warm, food-friendly tones — earthy oranges, warm browns, cream backgrounds)
    - Extend: `fontFamily` to use Inter
    - Mobile-first breakpoints (default Tailwind is already mobile-first)

11. **`apps/web/next.config.ts`**:
    - `images.remotePatterns`: allow MinIO hostname (`localhost:9000` for dev)
    - `output: 'standalone'` (for Docker deployment)
    - Configure rewrites if needed for API proxy (optional — can use direct API URL)

12. **Environment variables**:
    - `apps/web/.env.local.example`: `NEXT_PUBLIC_API_URL=http://localhost:3001`

**QA:**
- `pnpm --filter @tastebook/web dev` → starts on port 3000 without errors
- Visiting `http://localhost:3000` → redirects to `/login` (no auth)
- `pnpm --filter @tastebook/web build` → builds without errors
- `pnpm typecheck` passes for web app
- Bottom nav renders correctly on mobile viewport (375px width)
- All UI primitives render without visual issues (check in browser)

### Task 6.2: Auth Pages (Register & Login) ✅

**Goal**: Build register and login pages with form validation, error handling, and redirect to feed on success.

**Files to create:**

1. **`apps/web/src/app/(auth)/login/page.tsx`**:
   - Form fields: email (text input), password (password input)
   - Validation: use `react-hook-form` with `zodResolver` using `loginSchema` from `@tastebook/shared`
   - On submit:
     - POST `/auth/login` via API client
     - On success: store access token in auth store, redirect to `/feed`
     - On 401: show "Invalid email or password" (generic, not field-specific)
     - On 422: show field-level errors from Zod
   - Loading state: disable button + show spinner during submit
   - Link to register page: "Don't have an account? Sign up"
   - Mobile-first layout: full width on mobile, centered card on desktop

2. **`apps/web/src/app/(auth)/register/page.tsx`**:
   - Form fields: username, email, password, confirm password
   - Validation: use `registerSchema` from shared + client-side confirm password check
   - On submit:
     - POST `/auth/register` via API client
     - On success: store token, redirect to `/feed`
     - On 409: show "Email already registered" or "Username already taken" (based on error message)
     - On 422: show field-level errors
   - Loading state: disable button + show spinner
   - Link to login page: "Already have an account? Log in"
   - Username field: show character count, allowed characters hint

3. **`apps/web/src/hooks/use-auth.ts`** — Custom hook wrapping auth mutations:
   ```typescript
   export function useLogin() {
     return useMutation({
       mutationFn: (data: LoginRequest) => api.fetch<AuthTokensResponse>('/auth/login', {
         method: 'POST',
         body: JSON.stringify(data),
       }),
       onSuccess: (data) => {
         useAuthStore.getState().setAccessToken(data.access_token);
         useAuthStore.getState().setUser(data.user);
       },
     });
   }

   export function useRegister() { /* same pattern */ }
   ```

4. **`apps/web/src/components/auth/AuthGuard.tsx`** — Client component that:
   - Wraps protected routes
   - If `!isAuthenticated && !isLoading` → redirect to `/login`
   - If `isLoading` → show full-screen spinner
   - If `isAuthenticated` → render children
   - Used in `(main)/layout.tsx` to protect all main routes

**QA:**
- Register page: fill valid data → submits → redirects to `/feed` → user is authenticated
- Register page: submit with taken email → shows "Email already registered"
- Register page: submit with short password → shows Zod validation error
- Login page: valid credentials → redirects to `/feed`
- Login page: wrong password → shows "Invalid email or password"
- Visiting `/feed` without auth → redirects to `/login`
- After login, refresh page → still authenticated (refresh token works)

### Task 6.3: Feed Page (Infinite Scroll)

**Goal**: The main feed page showing Taste Entries from followed users with infinite scroll pagination. This is the core screen of the app.

**Files to create:**

1. **`apps/web/src/hooks/use-feed.ts`**:
   ```typescript
   export function useFeed() {
     return useInfiniteQuery({
       queryKey: ['feed'],
       queryFn: async ({ pageParam }) => {
         const params = new URLSearchParams();
         if (pageParam) params.set('cursor', pageParam);
         params.set('limit', '20');
         return api.fetch<PaginatedResponse<EntryResponse>>(`/feed?${params}`);
       },
       getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
       initialPageParam: undefined as string | undefined,
       staleTime: 30_000, // 30s — feed data is fairly fresh
     });
   }
   ```

2. **`apps/web/src/components/feed/EntryCard.tsx`** — The core content card:
   - **Header**: Avatar + username + relative time ("2h ago", "3d ago") — click username → profile
   - **Image carousel**: If multiple images, show horizontal swipeable carousel with dot indicators. If single image, show full-width. Use `next/image` with proper sizing. Aspect ratio: 4:3 container, object-cover.
   - **Content**: dish_name (bold, large), restaurant_name + city (smaller, gray). Rating shown as a number badge (e.g., "8.5" with colored background — green for 7+, yellow for 4-6, red for 1-3). Price level as dollar signs (e.g., "$$").
   - **Notes**: If present, show below content in a softer font. Truncate to 3 lines with "Read more" expand.
   - **Visibility indicator**: Small icon (globe for public, people for friends, lock for private) — only shown on own entries.
   - Entire card is tappable → navigates to entry detail page `/entries/[id]`

3. **`apps/web/src/components/feed/FeedList.tsx`** — The infinite scroll container:
   - Renders list of `EntryCard` components
   - Uses `useInView` (from `react-intersection-observer`) on a sentinel element at the bottom
   - When sentinel enters viewport AND `hasNextPage` → call `fetchNextPage()`
   - Show `Spinner` at bottom while loading next page
   - Show `EmptyState` when feed is empty: "Your feed is empty. Follow some food lovers to see their entries here!"
   - Pull-to-refresh: on mobile, pull down at top → refetch query (use a simple touch event handler or a library)

4. **`apps/web/src/app/(main)/feed/page.tsx`**:
   - Page title: "Feed" (hidden on mobile, visible on desktop sidebar)
   - Renders `FeedList` component
   - This is the default authenticated landing page

5. **`apps/web/src/lib/date-utils.ts`** — Relative time formatter:
   ```typescript
   export function timeAgo(dateString: string): string {
     // Returns: "just now", "2m", "1h", "3d", "2w", "Jan 15"
     // Under 1 minute → "just now"
     // Under 1 hour → "Xm"
     // Under 24 hours → "Xh"
     // Under 7 days → "Xd"
     // Under 30 days → "Xw"
     // Otherwise → "Mon DD" format
   }
   ```

**QA:**
- Feed loads and shows entries from followed users
- Scroll to bottom → next page loads automatically (no button click needed)
- Empty feed shows helpful empty state message
- Entry cards display all fields correctly: image, dish name, restaurant, city, rating, notes
- Multiple images show carousel with swipe/dots
- Tapping entry card navigates to `/entries/[id]`
- Tapping username navigates to `/profile/[id]`
- Feed is mobile-responsive: single column, full-width cards, proper spacing
- On desktop (md+): cards have max-width, centered with whitespace

### Task 6.4: Entry Creation & Detail Pages

**Goal**: Users can create new Taste Entries with image uploads and view entry details. Two pages: creation form and detail view.

**Files to create:**

1. **`apps/web/src/hooks/use-entries.ts`**:
   ```typescript
   export function useCreateEntry() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: (data: CreateEntryRequest) =>
         api.fetch<EntryResponse>('/entries', { method: 'POST', body: JSON.stringify(data) }),
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ['feed'] });
       },
     });
   }

   export function useUploadMedia() {
     return useMutation({
       mutationFn: async (file: File) => {
         const formData = new FormData();
         formData.append('file', file);
         return api.fetch<MediaResponse>('/media/upload', { method: 'POST', body: formData });
       },
     });
   }

   export function useEntry(entryId: string) {
     return useQuery({
       queryKey: ['entries', entryId],
       queryFn: () => api.fetch<EntryResponse>(`/entries/${entryId}`),
     });
   }

   export function useDeleteEntry() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: (entryId: string) =>
         api.fetch<void>(`/entries/${entryId}`, { method: 'DELETE' }),
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ['feed'] });
       },
     });
   }
   ```

2. **`apps/web/src/app/(main)/entries/new/page.tsx`** — Entry creation page:
   - **Image upload section** (top):
     - Grid of image slots (up to 5)
     - Tap to open file picker (accept images only)
     - On file selection: immediately upload via `useUploadMedia()`, show progress spinner on the slot
     - Show uploaded image thumbnail in the slot
     - "X" button to remove (removes from the local list, keeps in MinIO — orphan cleanup is a background concern)
     - At least 0 images allowed (images are optional)
   - **Form fields** (below images):
     - `dish_name` — text input, required, placeholder "What did you eat?"
     - `restaurant_name` — text input, optional, placeholder "Where?"
     - `city` — text input, optional
     - `country` — text input, optional
     - `rating` — slider or number input (0-10), required, default 7
     - `price_level` — optional select: 1-5 (displayed as $ to $$$$$)
     - `notes` — textarea, optional, placeholder "How was it?", character counter (max 2000)
     - `visibility` — segmented control: Public / Friends / Private (default: Public)
   - **Submit button**: "Save Entry"
     - On submit: collect media_ids from uploaded images, validate form with `createEntrySchema`, POST to `/entries`
     - On success: redirect to `/feed`, show success toast
     - On error: show error message
   - Use `react-hook-form` with `zodResolver(createEntrySchema)`

3. **`apps/web/src/app/(main)/entries/[id]/page.tsx`** — Entry detail page:
   - **Header**: Back button + "..." menu (delete for owner)
   - **Image carousel**: Full-width, swipeable (same component as in EntryCard but larger)
   - **Author section**: Avatar + username + relative time
   - **Content**: dish_name (h1), restaurant_name, city + country, rating badge, price level
   - **Notes**: Full text, no truncation
   - **Visibility badge**: small tag showing "Public" / "Friends" / "Private"
   - **Delete**: If viewer is owner, "..." menu has "Delete Entry" option → confirmation dialog → DELETE API call → redirect to feed

4. **`apps/web/src/components/entry/ImageUploadGrid.tsx`** — Reusable image upload component:
   - Grid layout (2 columns on mobile, 3 on desktop)
   - Each slot: 1:1 aspect ratio
   - States per slot: empty (with + icon), uploading (spinner overlay), uploaded (thumbnail + X remove)
   - Accepts `maxImages` prop (default 5)
   - Returns `mediaIds: string[]` via callback

5. **`apps/web/src/components/entry/RatingInput.tsx`** — Visual rating input:
   - Numbers 0-10 displayed as tappable circles
   - Selected number is highlighted with color (green gradient for high, red for low)
   - Accessible: keyboard navigable, aria-label

6. **`apps/web/src/components/ui/Toast.tsx`** + **`apps/web/src/stores/toast-store.ts`**:
   - Simple toast notification system using Zustand
   - Types: success (green), error (red), info (blue)
   - Auto-dismiss after 3 seconds
   - Renders fixed to bottom-center, above nav bar
   - Used for: "Entry created!", "Entry deleted", error messages

**QA:**
- Create entry: fill all fields + upload 2 images → submit → redirected to feed → new entry visible at top
- Create entry: submit without dish_name → validation error shown
- Create entry: upload image → shows thumbnail immediately → submit → images attached to entry
- Create entry: try to upload 6th image → prevented (slot disabled or error message)
- Detail page: shows all entry data correctly, images in carousel
- Detail page: owner sees delete option → delete → redirected to feed → entry gone
- Detail page: non-owner does NOT see delete option
- Mobile: form is full-width, comfortable to fill on phone
- Image upload: handles large file (>10MB) gracefully with error message

### Task 6.5: Profile Page

**Goal**: View own profile and other users' profiles with their entries, follow/unfollow button, and follower/following counts.

**Files to create:**

1. **`apps/web/src/hooks/use-users.ts`**:
   ```typescript
   export function useUser(userId: string) {
     return useQuery({
       queryKey: ['users', userId],
       queryFn: () => api.fetch<UserResponse>(`/users/${userId}`),
     });
   }

   export function useUserEntries(userId: string) {
     return useInfiniteQuery({
       queryKey: ['users', userId, 'entries'],
       queryFn: async ({ pageParam }) => {
         const params = new URLSearchParams();
         if (pageParam) params.set('cursor', pageParam);
         params.set('limit', '20');
         return api.fetch<PaginatedResponse<EntryResponse>>(`/users/${userId}/entries?${params}`);
       },
       getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
       initialPageParam: undefined as string | undefined,
     });
   }

   export function useFollow() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: (userId: string) =>
         api.fetch<void>(`/users/${userId}/follow`, { method: 'POST' }),
       onSuccess: (_, userId) => {
         queryClient.invalidateQueries({ queryKey: ['users', userId] });
         queryClient.invalidateQueries({ queryKey: ['feed'] });
       },
     });
   }

   export function useUnfollow() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: (userId: string) =>
         api.fetch<void>(`/users/${userId}/follow`, { method: 'DELETE' }),
       onSuccess: (_, userId) => {
         queryClient.invalidateQueries({ queryKey: ['users', userId] });
         queryClient.invalidateQueries({ queryKey: ['feed'] });
       },
     });
   }

   export function useUpdateProfile() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: (data: UpdateProfileRequest) =>
         api.fetch<UserResponse>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
       onSuccess: (data) => {
         queryClient.setQueryData(['users', data.id], data);
         useAuthStore.getState().setUser(data);
       },
     });
   }

   export function useUploadAvatar() {
     return useMutation({
       mutationFn: async (file: File) => {
         const formData = new FormData();
         formData.append('file', file);
         return api.fetch<{ avatar_url: string }>('/users/me/avatar', { method: 'POST', body: formData });
       },
     });
   }
   ```

2. **`apps/web/src/app/(main)/profile/page.tsx`** — Own profile (redirects to `/profile/[userId]` using auth store's user.id).

3. **`apps/web/src/app/(main)/profile/[id]/page.tsx`** — Profile page:
   - **Header section**:
     - Avatar (large, tappable to change if own profile → triggers file picker → `useUploadAvatar`)
     - Username (bold)
     - Display name (if set, shown above username)
     - Bio (if set)
     - Stats row: `X entries · Y followers · Z following` — tappable followers/following → future pages (for MVP, just display counts, no navigation to follower lists)
   - **Action buttons**:
     - **Own profile**: "Edit Profile" button → opens inline edit form (display_name, bio) or a simple modal
     - **Other user's profile**:
       - If not following: "Follow" button (primary style)
       - If following but not friends: "Following" button (outline style) → tap to unfollow (with confirmation)
       - If friends (mutual): "Friends" badge + "Following" button
   - **Entries grid/list** (below profile header):
     - Toggle: grid view (2 columns, images only, tappable → detail) vs list view (EntryCard style)
     - Default: grid view on mobile, list view on desktop
     - Infinite scroll pagination using `useUserEntries(userId)`
     - Empty state: "No entries yet" (with "Create your first entry" button on own profile)

4. **`apps/web/src/app/(main)/profile/[id]/edit/page.tsx`** — Edit profile page (alternative to modal):
   - Form fields: display_name, bio
   - Pre-filled with current values
   - Save button → PATCH `/users/me`
   - Cancel button → go back
   - Avatar upload: tap avatar → file picker → upload → update immediately

**QA:**
- Own profile: shows all user data, entries, correct counts
- Own profile: "Edit Profile" → change bio → save → bio updated
- Own profile: tap avatar → upload new photo → avatar changes immediately
- Other user's profile: shows "Follow" button → tap → becomes "Following"
- Other user's profile: "Following" button → tap → unfollow confirmation → unfollowed
- Mutual follow: other user's profile shows "Friends" badge
- Profile entries: infinite scroll works, visibility filtering applied (non-friend sees only public)
- Empty profile: shows "No entries yet" empty state

### Task 6.6: List Pages (Browse, Detail, Create)

**Goal**: Users can view their lists, create new lists, view list details with entries, and manage list items.

**Files to create:**

1. **`apps/web/src/hooks/use-lists.ts`**:
   ```typescript
   export function useUserLists(userId: string) {
     return useInfiniteQuery({
       queryKey: ['users', userId, 'lists'],
       queryFn: async ({ pageParam }) => {
         const params = new URLSearchParams();
         if (pageParam) params.set('cursor', pageParam);
         return api.fetch<PaginatedResponse<ListResponse>>(`/users/${userId}/lists?${params}`);
       },
       getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
       initialPageParam: undefined as string | undefined,
     });
   }

   export function useList(listId: string) {
     return useQuery({
       queryKey: ['lists', listId],
       queryFn: () => api.fetch<ListResponse & { items: EntryResponse[] }>(`/lists/${listId}`),
     });
   }

   export function useCreateList() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: (data: CreateListRequest) =>
         api.fetch<ListResponse>('/lists', { method: 'POST', body: JSON.stringify(data) }),
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ['users'] });
       },
     });
   }

   export function useAddToList() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: ({ listId, entryId }: { listId: string; entryId: string }) =>
         api.fetch<void>(`/lists/${listId}/items`, { method: 'POST', body: JSON.stringify({ entry_id: entryId }) }),
       onSuccess: (_, { listId }) => {
         queryClient.invalidateQueries({ queryKey: ['lists', listId] });
       },
     });
   }

   export function useRemoveFromList() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: ({ listId, entryId }: { listId: string; entryId: string }) =>
         api.fetch<void>(`/lists/${listId}/items/${entryId}`, { method: 'DELETE' }),
       onSuccess: (_, { listId }) => {
         queryClient.invalidateQueries({ queryKey: ['lists', listId] });
       },
     });
   }

   export function useDeleteList() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: (listId: string) =>
         api.fetch<void>(`/lists/${listId}`, { method: 'DELETE' }),
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ['users'] });
       },
     });
   }
   ```

2. **`apps/web/src/app/(main)/lists/page.tsx`** — Lists browse page:
   - Shows current user's lists using `useUserLists(currentUserId)`
   - Each list rendered as a card: title, description preview, item count, visibility badge
   - Tap card → navigate to `/lists/[id]`
   - Floating action button (FAB) or top-right button: "New List" → navigate to `/lists/new`
   - Empty state: "No lists yet. Create your first list to curate your favorite dishes!"
   - Infinite scroll pagination

3. **`apps/web/src/app/(main)/lists/new/page.tsx`** — Create list page:
   - Form fields: title (required), description (optional), visibility (segmented: Public/Friends/Private)
   - Use `react-hook-form` with `zodResolver(createListSchema)`
   - On submit → POST `/lists` → redirect to `/lists/[newListId]`

4. **`apps/web/src/app/(main)/lists/[id]/page.tsx`** — List detail page:
   - **Header**: list title, description, owner info (avatar + username), item count, visibility badge
   - **Actions** (if owner):
     - "Delete List" in "..." menu → confirmation → DELETE → redirect to `/lists`
   - **Items**: Ordered list of EntryCards (reusing the component from feed)
     - Each item has a "Remove" button (X icon, visible only to owner, on hover/long-press)
     - Reorder: drag-and-drop (optional for MVP — can skip if too complex)
       - If implemented: use a simple move-up/move-down button per item instead of full drag-and-drop
       - On reorder: PATCH `/lists/:id/items/reorder` with new order
     - Empty list: "This list is empty. Add some entries from your feed!"

5. **`apps/web/src/components/entry/AddToListButton.tsx`** — Component added to EntryCard and entry detail page:
   - Bookmark icon button on each entry card
   - On tap: opens bottom sheet / dropdown showing user's lists
   - Tap a list → `useAddToList({ listId, entryId })`
   - Shows checkmark next to lists that already contain this entry (requires an API extension OR client-side check from cached list data)
   - For MVP: just show the list picker without checkmarks. If entry already in list → show 409 error as toast "Already in this list"

**QA:**
- Lists page: shows user's lists with correct data
- Lists page: create new list → appears in list
- List detail: shows all entries in correct order
- List detail: owner can remove items → item disappears
- List detail: non-owner cannot see remove buttons
- Entry card: bookmark icon → opens list picker → add to list → success toast
- Entry card: add to list that already has it → "Already in this list" error toast
- Empty states render correctly for both lists page and list detail
- Mobile: all pages usable on 375px viewport

---

## Phase 7: Integration & Polish

_Depends on: All previous phases._

### Task 7.1: End-to-End Smoke Tests & Production Docker Config

**Goal**: Verify the entire system works together as expected, finalize the Docker configuration for production-like deployment, and ensure all services communicate correctly.

**Files to create/modify:**

1. **`docker-compose.prod.yml`** — Production-ready Docker Compose configuration:
   - Extends the base `docker-compose.yml`
   - Adds `api` service (builds from `apps/api/Dockerfile`)
   - Adds `web` service (builds from `apps/web/Dockerfile`)
   - Uses a `.env.prod` file for environment variables
   - Sets up a network for internal communication (e.g., `api` and `web` talk to `postgres` without exposing ports to the host, except for the web port)
   - Configures MinIO for production (removing default credentials)

2. **`apps/api/Dockerfile`**:
   - Multi-stage build using Node 22 alpine
   - Stage 1: Build (install dependencies, compile TypeScript)
   - Stage 2: Production (copy only `dist/` and `node_modules`, set `NODE_ENV=production`)
   - Command: `node dist/server.js`

3. **`apps/web/Dockerfile`**:
   - Multi-stage build for Next.js standalone output
   - Utilizes Next.js `output: 'standalone'` feature in `next.config.ts`
   - Copies public assets and standalone server

4. **`apps/api/test/smoke.test.ts`** — High-level smoke tests running against a live local instance:
   - These tests don't mock anything. They require the app to be running.
   - Use `supertest` pointing to `http://localhost:3001` (or whatever the API port is).
   - Test flow:
     1. Register a new user
     2. Login with that user
     3. Fetch profile
     4. Create a taste entry
     5. Fetch the feed (should see own entry)
     6. Create a second user, login
     7. Follow first user
     8. Fetch feed (should see first user's entry)
   - These tests run only when explicitly triggered (e.g., `pnpm test:smoke`), not during standard `pnpm test` runs.

5. **`package.json` (Root)**:
   - Add scripts:
     - `test:smoke`: Runs the smoke tests.
     - `docker:build`: Builds the images.
     - `docker:up`: Starts the production stack.

**QA:**
- `docker compose -f docker-compose.prod.yml up --build -d` successfully builds and starts all 5 containers (postgres, redis, minio, api, web).
- The web app is accessible at `http://localhost:3000` (or configured port) and can successfully talk to the API.
- The API can successfully connect to Postgres, Redis, and MinIO within the Docker network.
- `pnpm test:smoke` passes when run against the live local instance.
- No sensitive data (passwords, JWT secrets) is hardcoded in the Dockerfiles or compose files.

---

## Final Verification Wave

Before marking work complete, the implementer MUST perform ALL of the following:

1. **`pnpm test`** — ALL integration tests pass (zero failures)
2. **`pnpm lint`** — zero lint errors
3. **`pnpm typecheck`** — zero TypeScript errors
4. **`docker compose up`** — all services start and report healthy within 60 seconds
5. **Critical user journey** (manual, against Docker Compose stack):
   a. Register user "alice" → 201 with tokens
   b. Login as alice → 200 with tokens
   c. Upload 2 images via `POST /media/upload` → 201 with media IDs
   d. Create Taste Entry with both media IDs, visibility "public" → 201
   e. Fetch feed as alice → entry appears
   f. Register user "bob" → 201
   g. As bob, follow alice → 204
   h. As bob, fetch feed → alice's public entry appears
   i. As alice, follow bob → 204 (now mutual = friends)
   j. As alice, create friends-only entry → 201
   k. As bob, fetch feed → sees both alice's public AND friends-only entries
   l. As alice, create a list "Best Dishes" → 201
   m. Add the public entry to the list → 201
   n. Fetch list detail → entry visible in list

6. **No secrets in codebase** — `.env` is gitignored, `.env.example` has placeholder values only

**This verification requires explicit user "okay" before marking work as complete.**
