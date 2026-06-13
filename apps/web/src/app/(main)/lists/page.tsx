"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUserLists } from "../../../hooks/use-lists";
import { useAuthStore } from "../../../stores/auth-store";
import { Spinner } from "../../../components/ui/Spinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ListCover } from "../../../components/lists/ListCover";
import { Plus, MapPin } from "lucide-react";

export default function ListsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"my" | "public" | "friends">("my");
  const [cityFilter, setCityFilter] = useState("");

  const { data: lists, isLoading } = useUserLists(activeTab, cityFilter);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">Restaurant Lists</h1>
          <p className="text-sm text-stone-500 mt-1">Curate, discover, and share collections of dining locations.</p>
        </div>
        {user && (
          <Link
            href="/lists/new"
            className="flex items-center justify-center h-10 w-10 bg-white border border-warm-200 hover:border-primary-400 hover:text-primary-500 text-stone-700 rounded-full shadow-sm transition-all cursor-pointer flex-shrink-0"
            title="Create New List"
          >
            <Plus size={20} />
          </Link>
        )}
      </div>

      {/* Segmented control & Filter bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200/50 shadow-inner w-full md:w-auto overflow-x-auto">
          {(["my", "public", "friends"] as const).map((tab) => {
            if (tab === "friends" && !user) return null;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 md:flex-none py-2 px-4 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === tab
                    ? "bg-white text-stone-900 shadow-sm border border-warm-200"
                    : "text-stone-500 hover:text-stone-850"
                }`}
              >
                {tab === "my" ? "My Lists" : tab === "public" ? "Public Lists" : "Friends' Curations"}
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-64 flex-shrink-0">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
          <input
            type="text"
            placeholder="Filter by city..."
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white border border-warm-250 focus:border-primary-400 focus:outline-none transition-all placeholder:text-stone-400 text-stone-700 shadow-sm animate-fade-in"
          />
        </div>
      </div>

      {/* Loading/Content states */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner size="lg" />
        </div>
      ) : !lists || lists.length === 0 ? (
        <div className="py-12">
          <EmptyState
            title={cityFilter ? "No lists found" : "No lists yet"}
            description={
              cityFilter
                ? `No curations match "${cityFilter}" in this section.`
                : activeTab === "my"
                ? "Create your first restaurant list to start curating spots!"
                : activeTab === "friends"
                ? "None of your friends have created public lists yet."
                : "No public lists found in Tastebook."
            }
            actionLabel={activeTab === "my" && !cityFilter ? "＋ Create List" : undefined}
            onAction={activeTab === "my" && !cityFilter ? () => router.push("/lists/new") : undefined}
          />
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {lists.map((list) => {
            const cities = list.metadata?.cities || [];
            return (
              <Link
                key={list.id}
                href={`/lists/${list.id}`}
                className="group flex flex-col bg-white border border-warm-200 rounded-2xl p-4 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-out"
              >
                {/* Album Cover */}
                <div className="mb-4 w-full">
                  <ListCover
                    title={list.title}
                    creator={list.user}
                    cities={cities}
                    aspectSquare={true}
                    disableCityLinks={true}
                    showTitle={false}
                    showCreator={false}
                    coverUrl={list.cover_image_url}
                  />
                </div>

                {/* Meta details */}
                <div className="flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-stone-900 group-hover:text-primary-500 transition-colors text-sm line-clamp-1 flex-1">
                      {list.title}
                    </h3>
                    <span className="capitalize px-2 py-0.5 bg-stone-100 text-stone-600 rounded-full text-[10px] border border-stone-200/50 flex-shrink-0">
                      {list.visibility}
                    </span>
                  </div>
                  
                  <p className="text-stone-500 text-xs mt-1 truncate">
                    By @{list.user.username}
                  </p>

                  <div className="mt-2 pt-2 border-t border-warm-100 flex items-center justify-between text-[11px] font-bold text-stone-400">
                    <span>
                      {list.item_count} {list.item_count === 1 ? "restaurant" : "restaurants"}
                    </span>
                    <span className="flex items-center gap-0.5 text-red-500">
                      ❤️ {list.likes_count}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
