# Decisions - API Client Unwrap Refactor

## Wrapping success: true responses in data envelope
- **Decision**: Wrapped the standard `{ success: true }` responses in Fastify endpoints within the standard `{ data: { success: true } }` envelope.
- **Rationale**: This conforms to the unified standard envelope format used across all REST APIs, ensuring the client-side handlers can safely and uniformly unwrap response payloads via `data` properties without having to check for custom raw-success formats.
- **Endpoints Modified**:
  - `POST /lists/:id/items` (Add entry to list)
  - `PATCH /lists/:id/items/reorder` (Reorder list items)
  - `POST /lists/:id/collaborators` (Add collaborator to list)

## Update list hooks to explicitly unwrap `.data`
- **Decision**: Updated `apps/web/src/hooks/use-lists.ts` to type-safely expect `ApiResponse` wrapped objects on fetch calls and explicitly return `res.data`.
- **Rationale**: Keeps `use-lists.ts` hooks aligned with the API unwrapping refactor, ensuring types resolve cleanly and runtime data is correctly extracted.
- **Hooks Modified**:
  - `useUserLists` (GET `/users/${targetUserId}/lists`)
  - `useList` (GET `/lists/${id}`)
  - `useCreateList` (POST `/lists`)

## Standardized `ApiResponse<T>` interface in shared api-types
- **Decision**: Exported `ApiResponse<T>` representing `{ data: T }` from `@tastebook/shared`'s API types.
- **Rationale**: Ensures the frontend and backend share the identical TypeScript interface representation of a standard wrapped API response envelope, simplifying type assertions and improving safety in client wrappers.

## Update entries & feed hooks to explicitly unwrap `.data`
- **Decision**: Updated `apps/web/src/hooks/use-entries.ts` and `apps/web/src/hooks/use-feed.ts` to type-safely expect `ApiResponse` wrapped objects on fetch calls and explicitly return `res.data`.
- **Rationale**: Keeps hooks aligned with the API unwrapping refactor, ensuring types resolve cleanly and runtime data is correctly extracted.
- **Hooks Modified**:
  - `useEntry` (GET `/entries/${id}`)
  - `useCreateEntry` (POST `/entries`)
  - `useUploadMedia` (POST `/media/upload`)
  - `useFeed` (GET `/feed`)
