import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { ApiResponse, EntryResponse, PaginatedResponse } from "@tastebook/shared/api-types";

export function useFeed(limit = 10) {
  return useInfiniteQuery<PaginatedResponse<EntryResponse>>({
    queryKey: ["feed"],
    queryFn: async ({ pageParam }) => {
      const cursorParam = pageParam ? `&cursor=${pageParam}` : "";
      const res = await api.fetch<PaginatedResponse<EntryResponse>>(`/feed?limit=${limit}${cursorParam}`);
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
  });
}

export function useCityFeed(cityName: string, scope: "following" | "public", limit = 10) {
  return useInfiniteQuery<PaginatedResponse<EntryResponse>>({
    queryKey: ["city-feed", cityName, scope],
    queryFn: async ({ pageParam }) => {
      const cursorParam = pageParam ? `&cursor=${pageParam}` : "";
      const res = await api.fetch<PaginatedResponse<EntryResponse>>(
        `/feed/city/${encodeURIComponent(cityName)}?scope=${scope}&limit=${limit}${cursorParam}`
      );
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
    enabled: !!cityName,
  });
}

