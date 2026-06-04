"use client";

import React from "react";
import { useFeed } from "../../../hooks/use-feed";
import { FeedList } from "../../../components/feed/FeedList";

export default function FeedPage() {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useFeed(10);

  const entries = data?.pages.flatMap((page) => page.data) || [];
  const isRecommended = data?.pages[0]?.is_recommended ?? false;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">
          {isRecommended ? "Recommended" : "Your Feed"}
        </h1>
        {isRecommended && (
          <p className="text-sm text-stone-500 font-semibold">
            Follow or invite your friends to see their posts.
          </p>
        )}
      </div>
      <FeedList
        entries={entries}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
      />
    </div>
  );
}
