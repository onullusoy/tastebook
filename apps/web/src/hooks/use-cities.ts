import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { ApiResponse } from "@tastebook/shared/api-types";

export interface CityStatsResponse {
  total_restaurants: number;
  total_reviews: number;
  country: string;
  country_code: string;
}

export interface CityRestaurantRankingItem {
  google_place_id: string;
  name: string;
  city: string;
  country: string;
  country_code: string;
  rating_avg: string;
  review_count: number;
}

export interface CityGourmetRankingItem {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  review_count: number;
  gourme_points: number;
}

export function useCityStats(cityName: string) {
  return useQuery<CityStatsResponse>({
    queryKey: ["cities", "stats", cityName],
    queryFn: async () => {
      const res = await api.fetch<CityStatsResponse>(
        `/cities/${encodeURIComponent(cityName)}/stats`
      );
      return res;
    },
    enabled: !!cityName,
    staleTime: 30000,
  });
}

export function useCityRestaurantRankings(cityName: string, sortBy: "popularity" | "rating") {
  return useQuery<CityRestaurantRankingItem[]>({
    queryKey: ["cities", "rankings", "restaurants", cityName, sortBy],
    queryFn: async () => {
      const res = await api.fetch<ApiResponse<CityRestaurantRankingItem[]>>(
        `/cities/${encodeURIComponent(cityName)}/rankings/restaurants?sortBy=${sortBy}`
      );
      return res.data;
    },
    enabled: !!cityName,
    staleTime: 30000,
  });
}

export function useCityGourmetRankings(cityName: string, scope: "public" | "friends", isAuthenticated: boolean) {
  return useQuery<CityGourmetRankingItem[]>({
    queryKey: ["cities", "rankings", "gourmets", cityName, scope],
    queryFn: async () => {
      const res = await api.fetch<ApiResponse<CityGourmetRankingItem[]>>(
        `/cities/${encodeURIComponent(cityName)}/rankings/gourmets?scope=${scope}`
      );
      return res.data;
    },
    enabled: !!cityName && (scope === "public" || isAuthenticated),
    staleTime: 30000,
  });
}
