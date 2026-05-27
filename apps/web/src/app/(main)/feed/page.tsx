"use client";

import React from "react";
import { useFeed } from "../../../hooks/use-feed";
import { FeedList } from "../../../components/feed/FeedList";

export default function FeedPage() {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useFeed(10);

  const entries = data?.pages.flatMap((page) => page.data) || [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">Your Feed</h1>
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
