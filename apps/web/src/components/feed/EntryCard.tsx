"use client";

import React, { useState } from "react";
import Link from "next/link";
import { EntryResponse } from "@tastebook/shared/api-types";
import { Avatar } from "../ui/Avatar";
import { AddToListButton } from "../entry/AddToListButton";
import { timeAgo } from "../../lib/date-utils";

interface EntryCardProps {
  entry: EntryResponse;
  onDelete?: () => void;
  isOwner?: boolean;
}

export const EntryCard = ({ entry, onDelete, isOwner }: EntryCardProps) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  const getRatingBadgeClass = (rating: number) => {
    if (rating >= 7) return "bg-green-100 text-green-800 border-green-200";
    if (rating >= 4) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-red-100 text-red-800 border-red-200";
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (entry.media.length > 0) {
      setActiveImageIndex((prev) => (prev === 0 ? entry.media.length - 1 : prev - 1));
    }
  };

  const handleNextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (entry.media.length > 0) {
      setActiveImageIndex((prev) => (prev === entry.media.length - 1 ? 0 : prev + 1));
    }
  };

  const priceSymbols = entry.price_level ? "$".repeat(entry.price_level) : "";

  return (
    <div className="bg-white border border-warm-200 rounded-2xl shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
      <div className="p-4 flex items-center justify-between">
        <Link href={`/profile/${entry.user.id}`} className="flex items-center gap-3 group">
          <Avatar
            src={entry.user.avatar_url}
            username={entry.user.username}
            size="sm"
            className="group-hover:opacity-90 transition-opacity"
          />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-stone-800 group-hover:text-primary-500 transition-colors truncate">
              {entry.user.display_name || entry.user.username}
            </span>
            <span className="text-xs text-stone-500 truncate">
              @{entry.user.username} • {timeAgo(entry.created_at)}
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <AddToListButton entryId={entry.id} />
          {isOwner && onDelete && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm("Are you sure you want to delete this entry?")) {
                  onDelete();
                }
              }}
              className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-warm-200"
              title="Delete entry"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {entry.media && entry.media.length > 0 ? (
        <div className="relative aspect-video w-full bg-stone-100 flex items-center justify-center overflow-hidden">
          <Link href={`/entries/${entry.id}`} className="w-full h-full block">
            <img
              src={entry.media[activeImageIndex].url}
              alt={entry.dish_name}
              className="w-full h-full object-cover transition-all"
            />
          </Link>
          {entry.media.length > 1 && (
            <>
              <button
                onClick={handlePrevImage}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors text-sm font-bold"
              >
                ‹
              </button>
              <button
                onClick={handleNextImage}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors text-sm font-bold"
              >
                ›
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/35 px-2.5 py-1 rounded-full">
                {entry.media.map((_, index) => (
                  <button
                    key={index}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveImageIndex(index);
                    }}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      index === activeImageIndex ? "bg-white scale-125" : "bg-white/50"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="aspect-video w-full bg-stone-100 flex items-center justify-center border-y border-warm-100">
          <Link href={`/entries/${entry.id}`} className="text-stone-400 text-4xl">
            🍲
          </Link>
        </div>
      )}

      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="min-w-0">
            <Link
              href={`/entries/${entry.id}`}
              className="font-bold text-lg text-stone-800 hover:text-primary-500 transition-colors block truncate"
            >
              {entry.dish_name}
            </Link>
            {(entry.restaurant_name || entry.city) && (
              <span className="text-sm text-stone-500 font-semibold truncate block mt-0.5">
                📍 {entry.restaurant_name || "Unknown Restaurant"}
                {entry.city && ` • ${entry.city}`}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span
              className={`px-2.5 py-1 text-xs font-black rounded-lg border ${getRatingBadgeClass(
                entry.rating
              )}`}
            >
              ★ {entry.rating}/10
            </span>
            {priceSymbols && (
              <span className="text-xs font-black text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-md">
                {priceSymbols}
              </span>
            )}
          </div>
        </div>

        {entry.notes && (
          <div className="mt-2 text-stone-600 text-sm">
            <p className={isExpanded ? "" : "line-clamp-3"}>{entry.notes}</p>
            {entry.notes.split("\n").length > 3 || entry.notes.length > 150 ? (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs font-bold text-primary-500 hover:text-primary-600 mt-1 cursor-pointer block"
              >
                {isExpanded ? "Show Less" : "Read More"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
