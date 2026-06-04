# Plan: Remove Implicit Data Unwrapping in api-client.ts

## Context & Goal
The current `api-client.ts` implicitly unwraps responses by returning `resJson.data !== undefined ? resJson.data : resJson`. This magic behavior causes type mismatches and runtime bugs, particularly with `PaginatedResponse` where the `.cursor` field gets stripped. The goal is to return raw JSON from the client and require call sites to explicitly unwrap `.data`.

## Scope
- **IN**: `api-client.ts` modifications, updating all 22 frontend `api.fetch` call sites, adding `ApiResponse<T>` to shared types, fixing list API endpoint consistency.
- **OUT**: Modifying other backend endpoints (they already wrap correctly), changing business logic.

## Execution Steps

### Batch 1: Types & API Client
- **Task 1: Add ApiResponse type**: In `packages/shared/src/api-types/index.ts`, export `interface ApiResponse<T> { data: T; }`.
- **Task 2: Fix list backend routes**: In `apps/api/src/modules/lists/lists.routes.ts`, find the 3 endpoints returning `{ success: true }` and change them to return `{ data: { success: true } }` so they match the standard envelope pattern.
- **Task 3: Refactor api-client.ts**: In `apps/web/src/lib/api-client.ts`, remove the magic unwrapping (`return resJson.data !== undefined ? resJson.data : resJson` -> `return resJson`). Update `refreshToken()` to extract the token directly via `res.data.access_token`.

### Batch 2: Frontend Hooks (Explicit Unwrapping)
- **Task 4: Update auth & user hooks**: In `auth-store.ts`, `use-auth.ts`, and `use-users.ts`, change generic parameters from `T` to `ApiResponse<T>` for data-returning fetches. Extract and return `.data` from the result. Fire-and-forget endpoints (like logout, follow DELETE) remain unchanged.
- **Task 5: Update entries & feed hooks**: In `use-entries.ts` and `use-feed.ts`, update `api.fetch` generic types to `ApiResponse<T>` and explicitly unwrap `.data`. Pay special attention to `useInfiniteQuery` ensuring the unwrapped `PaginatedResponse` is returned.
- **Task 6: Update list hooks**: In `use-lists.ts`, update typed fetches to explicitly unwrap `.data`.

## Final Verification Wave
- [x] Run `npx tsc --noEmit` or rely on TS Language Server to ensure no type errors in `apps/web`.
- [x] Verify `PaginatedResponse` retains its `.cursor` field during feed/user-entry scrolling.
- [x] Verify login/register properly updates the auth store without throwing type errors.
- [x] Verify list creation and list item interactions work as expected.