import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { ApiResponse, EntryResponse, MediaResponse } from "@tastebook/shared/api-types";
import { CreateEntryRequest, UpdateEntryRequest } from "@tastebook/shared/schemas/entries";

export function useEntry(id: string) {
  return useQuery<EntryResponse>({
    queryKey: ["entry", id],
    queryFn: async () => {
      const res = await api.fetch<ApiResponse<EntryResponse>>(`/entries/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateEntryRequest) => {
      const res = await api.fetch<ApiResponse<EntryResponse>>("/entries", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["user-entries"] });
    },
  });
}

export function useUpdateEntry(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: UpdateEntryRequest) => {
      const res = await api.fetch<ApiResponse<EntryResponse>>(`/entries/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["entry", id] });
      queryClient.invalidateQueries({ queryKey: ["user-entries"] });
    },
  });
}

export function useUploadMedia() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.fetch<ApiResponse<MediaResponse>>("/media/upload", {
        method: "POST",
        body: formData,
      });
      return res.data;
    },
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return api.fetch(`/entries/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["user-entries"] });
    },
  });
}

export interface CountersResponse {
  likes_count: number;
  comments_count: number;
  is_liked: boolean;
}

export interface Comment {
  id: string;
  entry_id: string;
  content: string;
  created_at: string;
  user: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function useEntryCounters(entryId: string, initialData?: CountersResponse) {
  return useQuery<CountersResponse>({
    queryKey: ["entry-counters", entryId],
    queryFn: async () => {
      return api.fetch<CountersResponse>(`/entries/${entryId}/counters`);
    },
    initialData,
    refetchInterval: 10000, // Poll every 10 seconds
    refetchIntervalInBackground: false,
    enabled: !!entryId,
  });
}

export function useToggleLike(entryId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (currentlyLiked: boolean) => {
      const method = currentlyLiked ? "DELETE" : "POST";
      const res = await api.fetch<{ success: boolean }>(`/entries/${entryId}/like`, {
        method,
      });
      return res;
    },
    onMutate: async (currentlyLiked: boolean) => {
      await queryClient.cancelQueries({ queryKey: ["entry-counters", entryId] });
      await queryClient.cancelQueries({ queryKey: ["entry", entryId] });

      const previousCounters = queryClient.getQueryData<CountersResponse>(["entry-counters", entryId]);
      const previousEntry = queryClient.getQueryData<EntryResponse>(["entry", entryId]);

      queryClient.setQueryData<CountersResponse>(["entry-counters", entryId], (old) => {
        if (!old) return old;
        const diff = currentlyLiked ? -1 : 1;
        return {
          ...old,
          likes_count: Math.max(0, old.likes_count + diff),
          is_liked: !currentlyLiked,
        };
      });

      queryClient.setQueryData<EntryResponse>(["entry", entryId], (old) => {
        if (!old) return old;
        const diff = currentlyLiked ? -1 : 1;
        return {
          ...old,
          likes_count: Math.max(0, old.likes_count + diff),
          is_liked: !currentlyLiked,
        };
      });

      return { previousCounters, previousEntry };
    },
    onError: (err, variables, context) => {
      if (context?.previousCounters) {
        queryClient.setQueryData(["entry-counters", entryId], context.previousCounters);
      }
      if (context?.previousEntry) {
        queryClient.setQueryData(["entry", entryId], context.previousEntry);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["entry-counters", entryId] });
      queryClient.invalidateQueries({ queryKey: ["entry", entryId] });
    },
  });
}

export function useComments(entryId: string, enabled = true) {
  return useQuery<Comment[]>({
    queryKey: ["entry-comments", entryId],
    queryFn: async () => {
      const res = await api.fetch<ApiResponse<Comment[]>>(`/entries/${entryId}/comments`);
      return res.data;
    },
    enabled: enabled && !!entryId,
  });
}

export function useAddComment(entryId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      const res = await api.fetch<ApiResponse<Comment>>(`/entries/${entryId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      return res.data;
    },
    onSuccess: (newComment) => {
      queryClient.invalidateQueries({ queryKey: ["entry-comments", entryId] });

      queryClient.setQueryData<CountersResponse>(["entry-counters", entryId], (old) => {
        if (!old) return old;
        return {
          ...old,
          comments_count: old.comments_count + 1,
        };
      });

      queryClient.setQueryData<EntryResponse>(["entry", entryId], (old) => {
        if (!old) return old;
        return {
          ...old,
          comments_count: (old.comments_count || 0) + 1,
        };
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["entry-counters", entryId] });
      queryClient.invalidateQueries({ queryKey: ["entry", entryId] });
    },
  });
}

export function useDeleteComment(entryId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      await api.fetch(`/entries/${entryId}/comments/${commentId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entry-comments", entryId] });

      queryClient.setQueryData<CountersResponse>(["entry-counters", entryId], (old) => {
        if (!old) return old;
        return {
          ...old,
          comments_count: Math.max(0, old.comments_count - 1),
        };
      });

      queryClient.setQueryData<EntryResponse>(["entry", entryId], (old) => {
        if (!old) return old;
        return {
          ...old,
          comments_count: Math.max(0, (old.comments_count || 0) - 1),
        };
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["entry-counters", entryId] });
      queryClient.invalidateQueries({ queryKey: ["entry", entryId] });
    },
  });
}

