"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUserLists } from "../../../hooks/use-lists";
import { useAuthStore } from "../../../stores/auth-store";
import { Spinner } from "../../../components/ui/Spinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Plus } from "lucide-react";

export default function ListsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: lists, isLoading } = useUserLists(user?.id);

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">Your Lists</h1>
          <p className="text-sm text-stone-500 mt-1">Curate, bookmark, and organize entries.</p>
        </div>
        {lists && lists.length > 0 && (
          <Link
            href="/lists/new"
            className="flex items-center justify-center h-10 w-10 bg-white border border-warm-200 hover:border-primary-400 hover:text-primary-500 text-stone-700 rounded-full shadow-sm transition-all cursor-pointer"
            title="Create New List"
          >
            <Plus size={20} />
          </Link>
        )}
      </div>

      {!lists || lists.length === 0 ? (
        <div className="py-12">
          <EmptyState
            title="No lists yet"
            description="Create your first list to start bookmarking entries!"
            actionLabel="＋ Create List"
            onAction={() => router.push("/lists/new")}
          />
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
          {lists.map((list) => (
            <Link
              key={list.id}
              href={`/lists/${list.id}`}
              className="bg-white border border-warm-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ease-out flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between gap-4 mb-2">
                  <h3 className="font-bold text-lg text-stone-900 group-hover:text-primary-500 transition-colors truncate">
                    {list.title}
                  </h3>
                  <span className="text-xs font-bold bg-warm-100 text-stone-600 px-2.5 py-1 rounded-full capitalize">
                    {list.visibility}
                  </span>
                </div>
                {list.description && (
                  <p className="text-stone-500 text-sm line-clamp-2">{list.description}</p>
                )}
              </div>
              <div className="mt-6 pt-4 border-t border-warm-100 flex items-center justify-between text-xs text-stone-400">
                <span className="font-bold">
                  {list.item_count} {list.item_count === 1 ? "item" : "items"}
                </span>
                <span>By @{list.user.username}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
