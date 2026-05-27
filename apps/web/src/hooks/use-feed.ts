import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { EntryResponse, PaginatedResponse } from "@tastebook/shared/api-types";

export function useFeed(limit = 10) {
  return useInfiniteQuery<PaginatedResponse<EntryResponse>>({
    queryKey: ["feed"],
    queryFn: async ({ pageParam }) => {
      const cursorParam = pageParam ? `&cursor=${pageParam}` : "";
      return api.fetch<PaginatedResponse<EntryResponse>>(`/feed?limit=${limit}${cursorParam}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
  });
}
