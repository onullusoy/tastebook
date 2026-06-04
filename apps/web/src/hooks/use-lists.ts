import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { ApiResponse, ListResponse } from "@tastebook/shared/api-types";
import { useAuthStore } from "../stores/auth-store";

export function useUserLists(userId?: string) {
  const { user } = useAuthStore();
  const targetUserId = userId || user?.id;
  
  return useQuery<ListResponse[]>({
    queryKey: ["user-lists", targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      const res = await api.fetch<ApiResponse<ListResponse[]>>(`/users/${targetUserId}/lists`);
      return res.data;
    },
    enabled: !!targetUserId,
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
    mutationFn: async (body: { title: string; description?: string; visibility: "public" | "friends" | "private" }) => {
      const res = await api.fetch<ApiResponse<ListResponse>>("/lists", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-lists", user?.id] });
    },
  });
}

export function useAddToList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, entryId }: { listId: string; entryId: string }) => {
      return api.fetch(`/lists/${listId}/items`, {
        method: "POST",
        body: JSON.stringify({ entry_id: entryId }),
      });
    },
    onSuccess: (_, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["user-lists"] });
    },
  });
}

export function useRemoveFromList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, entryId }: { listId: string; entryId: string }) => {
      return api.fetch(`/lists/${listId}/items/${entryId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["user-lists"] });
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
      queryClient.invalidateQueries({ queryKey: ["user-lists", user?.id] });
    },
  });
}
