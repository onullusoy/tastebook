# Tastebook — Agent Memory & Architecture Notes

> **Last Updated:** 2026-06-01 — Pivot fully implemented across backend and frontend, passing all tests

## Project Concept (UPDATED — Pivot)

**Old:** Personal food journal ("identity and memory").  
**New:** Peer-to-peer dining recommendation & discovery platform.  
Core question: **"Where and what should I eat based on my network's actual experiences?"**

A "Taste Entry" is now a **complete dining experience review** — not a single dish memory. Each entry captures a restaurant visit with multiple food items, atmosphere tags, sub-ratings, pricing tier, and full commentary. Entries can be directly linked to collaborative lists.

## Architecture (Unchanged)

Full-Stack Monorepo managed with `pnpm` workspaces and `Turborepo`.

- **`apps/api/`**: Fastify v5 REST API. Modules: Auth, Users, Entries, Media, Social, Feed, Lists.
- **`apps/web/`**: Next.js 15 (App Router), Tailwind CSS 4, Zustand, TanStack Query v5.
- **`packages/db/`**: Drizzle ORM + PostgreSQL 16. Schemas and migrations.
- **`packages/shared/`**: Zod validation schemas + API contract types (shared by frontend & backend).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v22 LTS |
| Language | TypeScript ~5.7 |
| Database | PostgreSQL 16 |
| Cache & Feed | Redis 7 |
| File Storage | MinIO (S3 compat), max 5 images, 10MB each |
| Auth | Argon2id hash, JWT Access (15min), Refresh Token (30d, SHA-256, HTTP-Only cookie) |
| ORM | Drizzle ORM |
| API Framework | Fastify v5 |
| Frontend | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 |

## Database Tables (Post-Pivot — 9 tables)

1. `users` — User accounts
2. `taste_entries` — **MODIFIED**: No more `dish_name`. Now has `atmosphere_tags` (text[]), sub-ratings (`rating_ambience`, `rating_taste`, `rating_service`, `rating_value`), `list_id` FK. `restaurant_name`, `city`, `country`, `price_level` all required.
3. `food_items` — **NEW**: 1:N child of `taste_entries`. Fields: `name`, `notes`, `order_index`.
4. `entry_media` — Images linked to entries (unchanged)
5. `follows` — Social graph (unchanged)
6. `lists` — User-created lists (unchanged structure)
7. `list_items` — Junction: lists ↔ entries (unchanged)
8. `list_collaborators` — **NEW**: Junction: lists ↔ users. Enables collaborative lists. Fields: `role` (contributor/editor).
9. `refresh_tokens` — Auth tokens (unchanged)

## Key Architecture Decisions

- **Feed**: Fan-out-on-read + Redis cache with version-key invalidation. Composite cursor `(created_at, id)`.
- **Images**: Upload to MinIO → get `mediaId` → attach to entry via `media_ids[]`.
- **Security**: Private entries → 404 (not 403). Follow → `ON CONFLICT DO NOTHING`.
- **Food Items**: Full replacement strategy on update (delete old → insert new).
- **Lists**: Owner + collaborators can add items. Only owner manages collaborators.
- **Atmosphere Tags**: Predefined enum stored as PostgreSQL text array. Validated via Zod `z.enum()`.

## Technical Debt & Known Issues (Audit: 2026-06-04)

### Critical
- **Public feed cache leaks `is_liked` across users** — `feed:public:*` Redis key is viewer-independent but contains personalized `is_liked` field. Must strip or make viewer-specific.
- **Comment body not Zod-validated** — `POST /entries/:id/comments` uses raw `request.body as {}`, no max-length or type check.
- **`deleteComment` counter can go negative** — Missing `GREATEST(0, ...)` guard (unlike `unlike` which has it).
- **`entry_comments` table has zero indexes** — Needs `(entryId, createdAt)` index urgently.

### High
- **`recalculateRestaurantStats`** fetches ALL entries for a restaurant in JS — should be a single SQL aggregation.
- **N+1 in `SocialService.mapUsersToResponses`** — 4 queries per user × 20 users = 80 queries/page. Needs batching.
- **Counter polling fires in background tabs** — 20 cards × 10s poll = 120 req/min/user. Add `refetchIntervalInBackground: false`.
- **Comments fetched eagerly** even when panel is collapsed. Add `enabled: showComments`.
- **403 leaks resource existence** on write operations (`update`/`delete` entry/list) — should check visibility before ownership.

### Medium
- **`buildEntryResponses`** duplicated across EntriesService, FeedService, ListsService. Extract to shared utility.
- **Route params** never validated as UUIDs (26+ occurrences).
- **Google Places API responses** cast to `any` without Zod validation.
- **LIKE wildcards** not escaped in search (`%`, `_` passed through).
- **`useFollow`/`useUnfollow`** invalidate all `["user"]` queries instead of specific user IDs.
- **`as any` casts** in feed.service.ts (5 occurrences) suppress Drizzle type errors.

## Development Commands

```bash
docker compose up -d          # Start infra (Postgres, Redis, MinIO)
npx pnpm install              # Install dependencies
npx pnpm db:generate          # Generate Drizzle migrations
npx pnpm db:migrate           # Apply migrations
npx pnpm dev                  # Start dev servers (API: 3001, Web: 3000)
npx pnpm test                 # Run integration tests (126 tests)
```

## Current Status & Pivot Progress

- [x] MVP Phase 0-7 completed
- [x] **PIVOT Phase 1**: DB schema changes (food_items, list_collaborators, taste_entries modification)
- [x] **PIVOT Phase 2**: Shared types & Zod schemas update
- [x] **PIVOT Phase 3**: API service rewrites (entries, lists, feed, social, routes, tests rewritten - 126/126 tests passing)
- [x] **PIVOT Phase 4**: Frontend UI components update

## References

- Full MVP plan: `.sisyphus/plans/tastebook-mvp.md`
- Opencode learnings: `.sisyphus/notepads/tastebook-mvp/learnings.md`
- Pivot implementation plan: Created as Antigravity artifact
