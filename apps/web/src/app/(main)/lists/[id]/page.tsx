"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useList, useRemoveFromList, useDeleteList } from "../../../../hooks/use-lists";
import { useAuthStore } from "../../../../stores/auth-store";
import { useToastStore } from "../../../../stores/toast-store";
import { EntryCard } from "../../../../components/feed/EntryCard";
import { Spinner } from "../../../../components/ui/Spinner";
import { Button } from "../../../../components/ui/Button";

export default function ListDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { data: list, isLoading, error } = useList(id);
  const removeFromList = useRemoveFromList();
  const deleteList = useDeleteList();
  const { user } = useAuthStore();
  const { addToast } = useToastStore();

  const isOwner = user?.id === list?.user.id;

  const handleRemoveItem = async (entryId: string) => {
    try {
      await removeFromList.mutateAsync({ listId: id, entryId });
      addToast("Entry removed from list", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to remove item", "error");
    }
  };

  const handleDeleteList = async () => {
    if (!confirm("Are you sure you want to delete this list? This action cannot be undone.")) return;
    try {
      await deleteList.mutateAsync(id);
      addToast("List deleted successfully", "success");
      router.push("/lists");
    } catch (err: any) {
      addToast(err.message || "Failed to delete list", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="max-w-md mx-auto py-12 text-center flex flex-col items-center gap-4">
        <h2 className="text-xl font-bold text-stone-800">List not found</h2>
        <p className="text-sm text-stone-500">The list you are looking for does not exist or you don't have permission to view it.</p>
        <Button variant="secondary" onClick={() => router.push("/lists")}>
          Back to Lists
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="cursor-pointer">
            ← Back
          </Button>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">{list.title}</h1>
        </div>
        {isOwner && (
          <Button variant="secondary" size="sm" onClick={handleDeleteList} className="text-red-600 hover:bg-red-50 cursor-pointer">
            🗑️ Delete List
          </Button>
        )}
      </div>

      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm flex flex-col gap-2">
        <div className="flex justify-between items-center text-xs font-bold text-stone-400">
          <span>By @{list.user.username}</span>
          <span className="capitalize">{list.visibility} List</span>
        </div>
        {list.description && <p className="text-stone-600 text-sm mt-1">{list.description}</p>}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-black text-stone-800">Entries ({list.items?.length || 0})</h2>
        {!list.items || list.items.length === 0 ? (
          <div className="text-center py-12 bg-warm-50 border border-warm-100 rounded-xl">
            <p className="text-stone-500 text-sm">No items in this list yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {list.items.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                isOwner={user?.id === entry.user.id}
                onRemove={isOwner ? () => handleRemoveItem(entry.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
