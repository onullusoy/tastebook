import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { ApiResponse, RestaurantResponse, RestaurantDetailResponse } from "@tastebook/shared/api-types";

export function useSearchRestaurants(query: string) {
  return useQuery<RestaurantResponse[]>({
    queryKey: ["restaurants", "search", query],
    queryFn: async () => {
      if (!query || query.trim() === "") {
        return [];
      }
      const res = await api.fetch<ApiResponse<RestaurantResponse[]>>(
        `/search/restaurants?q=${encodeURIComponent(query.trim())}`
      );
      return res.data;
    },
    enabled: query.trim().length > 0,
    staleTime: 60000,
  });
}

export function useRestaurantDetail(placeId: string) {
  return useQuery<RestaurantDetailResponse>({
    queryKey: ["restaurants", "detail", placeId],
    queryFn: async () => {
      const res = await api.fetch<ApiResponse<RestaurantDetailResponse>>(
        `/restaurants/${placeId}`
      );
      return res.data;
    },
    enabled: !!placeId,
    staleTime: 30000,
  });
}
