"use client";

import React, { useEffect, useRef } from "react";
import { EntryResponse } from "@tastebook/shared/api-types";
import { EntryCard } from "./EntryCard";
import { Spinner } from "../ui/Spinner";
import { EmptyState } from "../ui/EmptyState";

interface FeedListProps {
  entries: EntryResponse[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export const FeedList = ({
  entries,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  emptyTitle = "No entries yet",
  emptyDescription = "Be the first to share a taste memory!",
}: FeedListProps) => {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const currentSentinel = sentinelRef.current;
    if (!currentSentinel || !hasNextPage || isLoading || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(currentSentinel);

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [hasNextPage, isLoading, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-12">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 max-w-xl mx-auto w-full">
        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </div>

      <div ref={sentinelRef} className="h-10 flex items-center justify-center">
        {isFetchingNextPage && <Spinner size="md" />}
      </div>
    </div>
  );
};
