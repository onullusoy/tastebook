# Learnings - API Client Unwrap Refactor

- **Envelope Consistency**: Consistent API envelopes (e.g. always wrapping successful operations/objects in `{ data: ... }`) reduces complexity in full-stack applications.
- **Fastify & TypeScript Integration**: Fastify schemas and Zod schemas validate request parameters and bodies, but the final response envelope format returned inside Fastify route handlers must match the expected TypeScript client models to prevent run-time response unwrap errors.
- **Refactoring Magic Unwrapping**: Removing magic unwrapping (`resJson.data !== undefined ? resJson.data : resJson`) improves clarity and predictability on the client side since clients can handle the wrapper formats explicitly and type-safely.
- **TanStack Infinite Query Unwrapping**: When using `useInfiniteQuery`, it is crucial that the `queryFn` returns the unwrapped `PaginatedResponse` shape so `getNextPageParam` and components consuming page data receive the expected structure directly.
- **Auth and User Hooks Refactoring**: Changing generics from `T` to `ApiResponse<T>` in `auth-store.ts`, `use-auth.ts`, and `use-users.ts` ensures type safety and clean data access. When unwrapping responses, we must extract and return `.data` from API calls. Fire-and-forget calls (e.g. logout, follow DELETE) return 204 or no content, so they remain generic-less and unmodified.
