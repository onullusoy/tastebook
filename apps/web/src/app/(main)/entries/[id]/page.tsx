"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useEntry, useDeleteEntry } from "../../../../hooks/use-entries";
import { useAuthStore } from "../../../../stores/auth-store";
import { useToastStore } from "../../../../stores/toast-store";
import { EntryCard } from "../../../../components/feed/EntryCard";
import { Spinner } from "../../../../components/ui/Spinner";
import { Button } from "../../../../components/ui/Button";

export default function EntryDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  
  const { data: entry, isLoading, error } = useEntry(id);
  const deleteEntry = useDeleteEntry();
  const { user } = useAuthStore();
  const { addToast } = useToastStore();

  const isOwner = user?.id === entry?.user.id;

  const handleDelete = async () => {
    try {
      await deleteEntry.mutateAsync(id);
      addToast("Entry deleted successfully", "success");
      router.push("/feed");
    } catch (err: any) {
      addToast(err.message || "Failed to delete entry", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="max-w-md mx-auto py-12 text-center flex flex-col items-center gap-4">
        <h2 className="text-xl font-bold text-stone-800">Entry not found</h2>
        <p className="text-sm text-stone-500">The entry you are looking for does not exist or you don't have permission to view it.</p>
        <Button variant="secondary" onClick={() => router.push("/feed")}>
          Back to Feed
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="cursor-pointer">
          ← Back
        </Button>
        <h1 className="text-xl font-black text-stone-900">Entry Detail</h1>
      </div>
      <EntryCard entry={entry} onDelete={handleDelete} isOwner={isOwner} />
    </div>
  );
}
