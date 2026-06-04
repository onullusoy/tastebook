import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { UserResponse, EntryResponse, PaginatedResponse, ApiResponse } from "@tastebook/shared/api-types";
import { useAuthStore } from "../stores/auth-store";

export function useUser(id: string) {
  return useQuery<UserResponse>({
    queryKey: ["user", id],
    queryFn: async () => {
      const res = await api.fetch<ApiResponse<UserResponse>>(`/users/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useUserEntries(id: string, limit = 10) {
  return useInfiniteQuery<PaginatedResponse<EntryResponse>>({
    queryKey: ["user-entries", id],
    queryFn: async ({ pageParam }) => {
      const cursorParam = pageParam ? `&cursor=${pageParam}` : "";
      const res = await api.fetch<PaginatedResponse<EntryResponse>>(`/users/${id}/entries?limit=${limit}${cursorParam}`);
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
    enabled: !!id,
  });
}

export function useFollow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      return api.fetch(`/users/${userId}/follow`, {
        method: "POST",
      });
    },
    onSuccess: (_, userId) => {
      const meId = useAuthStore.getState().user?.id;
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      queryClient.invalidateQueries({ queryKey: ["user", "me"] });
      if (meId) {
        queryClient.invalidateQueries({ queryKey: ["user", meId] });
      }
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["user-followers"] });
      queryClient.invalidateQueries({ queryKey: ["user-following"] });
      queryClient.invalidateQueries({ queryKey: ["user-friends"] });
    },
  });
}

export function useUnfollow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      return api.fetch(`/users/${userId}/follow`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, userId) => {
      const meId = useAuthStore.getState().user?.id;
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      queryClient.invalidateQueries({ queryKey: ["user", "me"] });
      if (meId) {
        queryClient.invalidateQueries({ queryKey: ["user", meId] });
      }
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["user-followers"] });
      queryClient.invalidateQueries({ queryKey: ["user-following"] });
      queryClient.invalidateQueries({ queryKey: ["user-friends"] });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { setUser } = useAuthStore();

  return useMutation({
    mutationFn: async (body: { display_name?: string; bio?: string }) => {
      const res = await api.fetch<ApiResponse<UserResponse>>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ["user", updatedUser.id] });
      queryClient.invalidateQueries({ queryKey: ["user", "me"] });
    },
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  const { setUser } = useAuthStore();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.fetch<ApiResponse<{ avatar_url: string }>>("/users/me/avatar", {
        method: "POST",
        body: formData,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      api.fetch<ApiResponse<UserResponse>>("/auth/me").then((currentUser) => {
        setUser(currentUser.data);
      });
    },
  });
}

export function useUserFollowers(id: string, limit = 20) {
  return useInfiniteQuery<PaginatedResponse<UserResponse>>({
    queryKey: ["user-followers", id],
    queryFn: async ({ pageParam }) => {
      const cursorParam = pageParam ? `&cursor=${pageParam}` : "";
      const res = await api.fetch<PaginatedResponse<UserResponse>>(`/users/${id}/followers?limit=${limit}${cursorParam}`);
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
    enabled: !!id,
  });
}

export function useUserFollowing(id: string, limit = 20) {
  return useInfiniteQuery<PaginatedResponse<UserResponse>>({
    queryKey: ["user-following", id],
    queryFn: async ({ pageParam }) => {
      const cursorParam = pageParam ? `&cursor=${pageParam}` : "";
      const res = await api.fetch<PaginatedResponse<UserResponse>>(`/users/${id}/following?limit=${limit}${cursorParam}`);
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
    enabled: !!id,
  });
}

export function useUserFriends(id: string, limit = 20) {
  return useInfiniteQuery<PaginatedResponse<UserResponse>>({
    queryKey: ["user-friends", id],
    queryFn: async ({ pageParam }) => {
      const cursorParam = pageParam ? `&cursor=${pageParam}` : "";
      const res = await api.fetch<PaginatedResponse<UserResponse>>(`/users/${id}/friends?limit=${limit}${cursorParam}`);
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
    enabled: !!id,
  });
}
