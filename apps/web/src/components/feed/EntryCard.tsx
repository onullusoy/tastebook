"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { EntryResponse } from "@tastebook/shared/api-types";
import { Avatar } from "../ui/Avatar";
import { timeAgo } from "../../lib/date-utils";
import { useEntryCounters, useToggleLike, useComments, useAddComment, useDeleteComment, useDeleteEntry } from "../../hooks/use-entries";
import { useAuthStore } from "../../stores/auth-store";
import { useUserLists, useAddToList } from "../../hooks/use-lists";
import { useToastStore } from "../../stores/toast-store";
import { EllipsisVertical } from "lucide-react";

interface EntryCardProps {
  entry: EntryResponse;
  onDelete?: () => void;
  onRemove?: () => void;
  isOwner?: boolean;
  onImageClick?: (url: string) => void;
}

export const EntryCard = ({ entry, onDelete, onRemove, isOwner, onImageClick }: EntryCardProps) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showListsSubmenu, setShowListsSubmenu] = useState(false);

  const { data: counters } = useEntryCounters(entry.id, {
    likes_count: entry.likes_count,
    comments_count: entry.comments_count,
    is_liked: !!entry.is_liked,
  });

  const { user } = useAuthStore();
  const router = useRouter();
  const resolvedIsOwner = isOwner || (user && user.id === entry.user.id);
  const deleteEntryMutation = useDeleteEntry();
  const { data: lists, isLoading: isLoadingLists } = useUserLists();
  const addToListMutation = useAddToList();
  const { addToast } = useToastStore();

  const toggleLikeMutation = useToggleLike(entry.id);
  const [showComments, setShowComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");

  const { data: comments, isLoading: isLoadingComments } = useComments(entry.id, showComments);
  const addCommentMutation = useAddComment(entry.id);
  const deleteCommentMutation = useDeleteComment(entry.id);

  const handleLikeToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleLikeMutation.mutate(!!counters?.is_liked);
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    addCommentMutation.mutate(newCommentText.trim());
    setNewCommentText("");
  };

  const getRatingBadgeClass = (rating: number) => {
    if (rating >= 7) return "bg-green-100 text-green-800 border-green-200";
    if (rating >= 4) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-red-100 text-red-800 border-red-200";
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (entry.media.length > 0) {
      setActiveImageIndex((prev) =>
        prev === 0 ? entry.media.length - 1 : prev - 1,
      );
    }
  };

  const handleNextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (entry.media.length > 0) {
      setActiveImageIndex((prev) =>
        prev === entry.media.length - 1 ? 0 : prev + 1,
      );
    }
  };

  const priceSymbols = entry.price_level ? "$".repeat(entry.price_level) : "";
  const foodItemNames = entry.food_items?.map((fi) => fi.name) ?? [];

  return (
    <div className="bg-white border border-warm-200 rounded-2xl shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
      <div className="p-4 flex items-center justify-between">
        <Link
          href={`/profile/${entry.user.id}`}
          className="flex items-center gap-3 group"
        >
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
        <div className="relative">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(!menuOpen);
              setShowListsSubmenu(false);
            }}
            className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors cursor-pointer flex items-center justify-center"
            aria-label="Options"
          >
            <EllipsisVertical size={20} />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  setShowListsSubmenu(false);
                }}
              />
              <div className="absolute right-0 mt-2 w-52 bg-white border border-warm-200 rounded-xl shadow-xl z-40 py-1.5 animate-fade-in text-left">
                {!showListsSubmenu ? (
                  <div className="flex flex-col">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowListsSubmenu(true);
                      }}
                      className="w-full px-4 py-2 text-sm text-stone-700 hover:bg-primary-50 hover:text-primary-600 transition-colors text-left flex items-center gap-2 cursor-pointer font-semibold"
                    >
                      <span>🔖</span> Add to List
                    </button>

                    {onRemove && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuOpen(false);
                          if (confirm("Are you sure you want to remove this entry from this list?")) {
                            onRemove();
                          }
                        }}
                        className="w-full px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors text-left flex items-center gap-2 cursor-pointer font-semibold"
                      >
                        <span>❌</span> Remove from List
                      </button>
                    )}

                    {resolvedIsOwner && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuOpen(false);
                          router.push(`/entries/${entry.id}/edit`);
                        }}
                        className="w-full px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors text-left flex items-center gap-2 cursor-pointer font-semibold"
                      >
                        <span>✏️</span> Edit Post
                      </button>
                    )}

                    {resolvedIsOwner && (
                      <button
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuOpen(false);
                          if (confirm("Are you sure you want to delete this entry?")) {
                            if (onDelete) {
                              onDelete();
                            } else {
                              try {
                                await deleteEntryMutation.mutateAsync(entry.id);
                                addToast("Entry deleted successfully", "success");
                              } catch (err) {
                                addToast("Failed to delete entry", "error");
                              }
                            }
                          }
                        }}
                        className="w-full px-4 py-2 text-sm text-red-650 hover:bg-red-50 transition-colors text-left flex items-center gap-2 cursor-pointer font-semibold"
                      >
                        <span>🗑️</span> Delete Post
                      </button>
                    )}

                    {!resolvedIsOwner && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuOpen(false);
                          addToast("Post reported. Thank you for your feedback.", "success");
                        }}
                        className="w-full px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors text-left flex items-center gap-2 cursor-pointer font-semibold"
                      >
                        <span>⚠️</span> Report Post
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 px-3 py-1 border-b border-warm-100">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowListsSubmenu(false);
                        }}
                        className="text-stone-400 hover:text-stone-600 text-xs font-bold"
                      >
                        ← Back
                      </button>
                      <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                        Select List
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1">
                      {isLoadingLists ? (
                        <div className="px-4 py-2 text-xs text-stone-500">
                          Loading lists...
                        </div>
                      ) : !lists || lists.length === 0 ? (
                        <div className="px-4 py-2 text-xs text-stone-500">
                          No lists found. Create one in the Lists tab!
                        </div>
                      ) : (
                        lists.map((list) => (
                          <button
                            key={list.id}
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              try {
                                await addToListMutation.mutateAsync({
                                  listId: list.id,
                                  entryId: entry.id,
                                });
                                addToast(`Added to list "${list.title}"!`, "success");
                                setMenuOpen(false);
                                setShowListsSubmenu(false);
                              } catch (err: any) {
                                addToast(err.message || "Failed to add to list", "error");
                              }
                            }}
                            className="w-full px-4 py-2 text-xs text-stone-700 hover:bg-primary-50 hover:text-primary-600 transition-colors text-left flex items-center justify-between cursor-pointer font-semibold"
                          >
                            <span className="truncate">{list.title}</span>
                            <span className="text-stone-450 text-[10px]">({list.item_count})</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {entry.media && entry.media.length > 0 && (
        <div className="relative aspect-video w-full bg-stone-100 flex items-center justify-center overflow-hidden">
          {onImageClick ? (
            <button
              onClick={() => onImageClick(entry.media[activeImageIndex].url)}
              className="w-full h-full text-left relative focus:outline-none pointer-events-none md:pointer-events-auto cursor-default md:cursor-zoom-in"
              aria-label="Zoom image"
            >
              <Image
                src={entry.media[activeImageIndex].thumbnail_url || entry.media[activeImageIndex].url}
                alt={entry.restaurant_name}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                priority={activeImageIndex === 0}
                className="object-cover transition-all"
              />
            </button>
          ) : (
            <Link href={`/entries/${entry.id}`} className="w-full h-full block relative">
              <Image
                src={entry.media[activeImageIndex].thumbnail_url || entry.media[activeImageIndex].url}
                alt={entry.restaurant_name}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                priority={activeImageIndex === 0}
                className="object-cover transition-all"
              />
            </Link>
          )}
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
                      index === activeImageIndex
                        ? "bg-white scale-125"
                        : "bg-white/50"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="min-w-0">
            {entry.google_place_id ? (
              <Link
                href={`/restaurants/${entry.google_place_id}`}
                className="font-bold text-lg text-stone-850 hover:text-primary-500 hover:underline transition-colors block truncate"
              >
                {entry.restaurant_name}
              </Link>
            ) : (
              <Link
                href={`/entries/${entry.id}`}
                className="font-bold text-lg text-stone-850 hover:text-primary-500 transition-colors block truncate"
              >
                {entry.restaurant_name}
              </Link>
            )}
            <span className="text-sm text-stone-500 font-semibold truncate block mt-0.5">
              📍{" "}
              <Link
                href={`/city/${encodeURIComponent(entry.city)}`}
                className="hover:underline hover:text-primary-500 transition-colors"
              >
                {entry.city}
              </Link>
              , {entry.country}
            </span>
            {foodItemNames.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {foodItemNames.map((name, i) => (
                  <span
                    key={i}
                    className="text-xs bg-warm-100 text-stone-600 px-2 py-0.5 rounded-full border border-warm-200"
                  >
                    🍽️ {name}
                  </span>
                ))}
              </div>
            )}
            {entry.atmosphere_tags && entry.atmosphere_tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {entry.atmosphere_tags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full border border-primary-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span
              className={`px-2.5 py-1 text-xs font-black rounded-lg border ${getRatingBadgeClass(
                entry.rating,
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

        {/* Social interactions row */}
        <div className="mt-4 pt-3 border-t border-warm-100 flex items-center justify-between">
          <div className="flex gap-4">
            <button
              onClick={handleLikeToggle}
              className={`flex items-center gap-1.5 text-sm font-semibold transition-all duration-200 py-1.5 px-3 rounded-full hover:bg-stone-50 ${
                counters?.is_liked ? "text-red-500 scale-105" : "text-stone-500 hover:text-red-500"
              }`}
            >
              <span className="text-base">{counters?.is_liked ? "❤️" : "🤍"}</span>
              <span>{counters?.likes_count}</span>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowComments(!showComments);
              }}
              className={`flex items-center gap-1.5 text-sm font-semibold transition-all py-1.5 px-3 rounded-full hover:bg-stone-50 ${
                showComments ? "text-primary-650 bg-primary-50" : "text-stone-500 hover:text-primary-500"
              }`}
            >
              <span className="text-base">💬</span>
              <span>{counters?.comments_count}</span>
            </button>
          </div>
        </div>

        {/* Comment panel */}
        {showComments && (
          <div className="mt-3 pt-3 border-t border-warm-150 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">Comments</h4>
            
            {/* Comments list */}
            <div className="space-y-3 max-h-60 overflow-y-auto mb-3 pr-1 scrollbar-thin">
              {isLoadingComments ? (
                <p className="text-xs text-stone-400 py-2">Loading comments...</p>
              ) : comments && comments.length > 0 ? (
                comments.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-2.5 text-sm">
                    <Link href={`/profile/${comment.user.id}`} className="flex-shrink-0">
                      <Avatar
                        src={comment.user.avatar_url}
                        username={comment.user.username}
                        size="sm"
                      />
                    </Link>
                    <div className="bg-stone-50 rounded-2xl p-2.5 flex-1 min-w-0 border border-warm-100">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <Link href={`/profile/${comment.user.id}`} className="font-bold text-xs text-stone-850 hover:underline truncate">
                          {comment.user.display_name || comment.user.username}
                        </Link>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-stone-400">
                            {timeAgo(comment.created_at)}
                          </span>
                          {(resolvedIsOwner || (user && user.id === comment.user.id)) && (
                            <button
                              onClick={() => {
                                if (window.confirm("Are you sure you want to delete this comment?")) {
                                  deleteCommentMutation.mutate(comment.id);
                                }
                              }}
                              disabled={deleteCommentMutation.isPending}
                              className="text-[10px] text-stone-400 hover:text-red-600 font-bold transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-stone-600 text-xs break-words leading-relaxed">{comment.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-stone-400 py-2">No comments yet. Be the first to say something!</p>
              )}
            </div>

            {/* Comment input form */}
            <form onSubmit={handleCommentSubmit} className="flex gap-2 items-center">
              <input
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 bg-stone-50 hover:bg-stone-100/50 focus:bg-white text-xs px-3.5 py-2 rounded-full border border-warm-250 focus:border-primary-400 focus:outline-none transition-all placeholder:text-stone-400 text-stone-700"
              />
              <button
                type="submit"
                disabled={!newCommentText.trim() || addCommentMutation.isPending}
                className="bg-primary-500 hover:bg-primary-600 text-white font-bold text-xs px-3.5 py-2 rounded-full transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
