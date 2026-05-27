import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { UserResponse, EntryResponse, PaginatedResponse } from "@tastebook/shared/api-types";
import { useAuthStore } from "../stores/auth-store";

export function useUser(id: string) {
  return useQuery<UserResponse>({
    queryKey: ["user", id],
    queryFn: async () => {
      const res = await api.fetch<{ data: UserResponse }>(`/users/${id}`);
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
      return api.fetch<PaginatedResponse<EntryResponse>>(`/users/${id}/entries?limit=${limit}${cursorParam}`);
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
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
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
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { setUser } = useAuthStore();

  return useMutation({
    mutationFn: async (body: { display_name?: string; bio?: string }) => {
      const res = await api.fetch<{ data: UserResponse }>("/users/me", {
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

      const res = await api.fetch<{ data: { avatar_url: string } }>("/users/me/avatar", {
        method: "POST",
        body: formData,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      api.fetch<UserResponse>("/auth/me").then((currentUser) => {
        setUser(currentUser);
      });
    },
  });
}
