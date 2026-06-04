import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { ApiResponse, UserResponse } from "@tastebook/shared/api-types";

export interface SearchedCity {
  city: string;
  country: string;
  count: number;
}

export interface SearchResponseData {
  cities: SearchedCity[];
  users: UserResponse[];
}

export function useSearch(query: string) {
  return useQuery<SearchResponseData>({
    queryKey: ["search", query],
    queryFn: async () => {
      if (!query || query.trim() === "") {
        return { cities: [], users: [] };
      }
      const res = await api.fetch<ApiResponse<SearchResponseData>>(
        `/search?q=${encodeURIComponent(query.trim())}`
      );
      return res.data;
    },
    enabled: query.trim().length > 0,
    staleTime: 60000,
  });
}
