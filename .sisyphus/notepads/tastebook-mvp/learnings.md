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

