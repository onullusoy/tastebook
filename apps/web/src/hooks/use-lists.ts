import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { ApiResponse, ListResponse } from "@tastebook/shared/api-types";
import { useAuthStore } from "../stores/auth-store";

export function useUserLists(type: "my" | "public" | "friends" = "my", city?: string) {
  const { user } = useAuthStore();
  const queryParams = new URLSearchParams();
  queryParams.set("type", type);
  if (city) {
    queryParams.set("city", city);
  }
  
  return useQuery<ListResponse[]>({
    queryKey: ["lists", type, user?.id, city],
    queryFn: async () => {
      const res = await api.fetch<ApiResponse<ListResponse[]>>(`/lists?${queryParams.toString()}`);
      return res.data;
    },
    enabled: type === "public" || !!user,
  });
}

export function useList(id: string) {
  return useQuery<ListResponse & { items?: any[] }>({
    queryKey: ["list", id],
    queryFn: async () => {
      const res = await api.fetch<ApiResponse<ListResponse & { items?: any[] }>>(`/lists/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateList() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  return useMutation({
    mutationFn: async (body: { title: string; description?: string; visibility: "public" | "friends" | "private"; cover_image_url?: string | null; metadata?: any }) => {
      const res = await api.fetch<ApiResponse<ListResponse>>("/lists", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });
}

export function useUpdateList() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ listId, body }: { listId: string; body: { title?: string; description?: string; visibility?: "public" | "friends" | "private"; cover_image_url?: string | null; metadata?: any } }) => {
      const res = await api.fetch<ApiResponse<ListResponse>>(`/lists/${listId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: (_, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });
}

export function useAddToList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      listId,
      restaurantId,
      name,
      city,
      country,
    }: {
      listId: string;
      restaurantId: string;
      name?: string;
      city?: string;
      country?: string;
    }) => {
      return api.fetch(`/lists/${listId}/items`, {
        method: "POST",
        body: JSON.stringify({
          restaurant_id: restaurantId,
          name,
          city,
          country,
        }),
      });
    },
    onSuccess: (_, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });
}

export function useRemoveFromList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, restaurantId }: { listId: string; restaurantId: string }) => {
      return api.fetch(`/lists/${listId}/items/${restaurantId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });
}

export function useLikeList(listId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return api.fetch(`/lists/${listId}/like`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["city-feed"] });
      queryClient.invalidateQueries({ queryKey: ["user-entries"] });
      queryClient.invalidateQueries({ queryKey: ["entry-counters"] });
    },
  });
}

export function useUnlikeList(listId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return api.fetch(`/lists/${listId}/like`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["city-feed"] });
      queryClient.invalidateQueries({ queryKey: ["user-entries"] });
      queryClient.invalidateQueries({ queryKey: ["entry-counters"] });
    },
  });
}

export function useDeleteList() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  return useMutation({
    mutationFn: async (listId: string) => {
      return api.fetch(`/lists/${listId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });
}
