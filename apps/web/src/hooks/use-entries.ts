import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { EntryResponse, MediaResponse } from "@tastebook/shared/api-types";
import { CreateEntryRequest } from "@tastebook/shared/schemas/entries";

export function useEntry(id: string) {
  return useQuery<EntryResponse>({
    queryKey: ["entry", id],
    queryFn: async () => {
      const res = await api.fetch<{ data: EntryResponse }>(`/entries/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateEntryRequest) => {
      const res = await api.fetch<{ data: EntryResponse }>("/entries", {
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

export function useUploadMedia() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.fetch<{ data: MediaResponse }>("/media/upload", {
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
