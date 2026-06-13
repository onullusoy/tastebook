"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { EntryResponse } from "@tastebook/shared/api-types";
import { Avatar } from "../ui/Avatar";
import { timeAgo } from "../../lib/date-utils";
import { useEntryCounters, useComments, useAddComment, useDeleteComment, useEditComment, useToggleLikeComment } from "../../hooks/use-entries";
import { useDeleteList, useLikeList, useUnlikeList } from "../../hooks/use-lists";
import { useAuthStore } from "../../stores/auth-store";
import { useToastStore } from "../../stores/toast-store";
import { EllipsisVertical } from "lucide-react";
import { ListCover } from "../lists/ListCover";
import { normalizeCityName } from "@tastebook/shared";

function getCityWithoutDistrict(city: string): string {
  if (!city) return "";
  const parts = city.split("/");
  const lastPart = parts[parts.length - 1].trim();
  return normalizeCityName(lastPart);
}

interface ListEntryCardProps {
  entry: EntryResponse;
  onDelete?: () => void;
}

export const ListEntryCard = ({ entry, onDelete }: ListEntryCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  const { data: counters } = useEntryCounters(
    entry.id,
    {
      likes_count: entry.likes_count,
      comments_count: entry.comments_count,
      is_liked: !!entry.is_liked,
    },
    !isDeleting && !isDeleted
  );

  const { user } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const resolvedIsOwner = user && user.id === entry.user.id;

  const listId = entry.metadata?.list_id || entry.list_id;

  const deleteListMutation = useDeleteList();
  const { addToast } = useToastStore();

  const likeList = useLikeList(listId || "");
  const unlikeList = useUnlikeList(listId || "");
  const [showComments, setShowComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");

  const { data: comments, isLoading: isLoadingComments } = useComments(entry.id, showComments);
  const addCommentMutation = useAddComment(entry.id);
  const deleteCommentMutation = useDeleteComment(entry.id);
  const editCommentMutation = useEditComment(entry.id);
  const toggleLikeCommentMutation = useToggleLikeComment(entry.id);

  const [activeCommentMenuId, setActiveCommentMenuId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");

  const handleLikeToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!listId) return;

    const currentlyLiked = !!counters?.is_liked;
    const diff = currentlyLiked ? -1 : 1;

    await queryClient.cancelQueries({ queryKey: ["entry-counters", entry.id] });
    const previousCounters = queryClient.getQueryData(["entry-counters", entry.id]);

    queryClient.setQueryData(["entry-counters", entry.id], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        likes_count: Math.max(0, old.likes_count + diff),
        is_liked: !currentlyLiked,
      };
    });

    try {
      if (currentlyLiked) {
        await unlikeList.mutateAsync();
      } else {
        await likeList.mutateAsync();
      }
      queryClient.invalidateQueries({ queryKey: ["entry-counters", entry.id] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["city-feed"] });
      queryClient.invalidateQueries({ queryKey: ["user-entries"] });
    } catch (err) {
      if (previousCounters) {
        queryClient.setQueryData(["entry-counters", entry.id], previousCounters);
      }
    }
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    addCommentMutation.mutate(newCommentText.trim());
    setNewCommentText("");
  };

  const rawCities = entry.metadata?.cities || [];

  if (isDeleted) return null;

  return (
    <div
      className={`grid transition-all duration-400 ease-in-out ${isDeleting
        ? "grid-template-rows-[0fr] opacity-0 scale-95 pointer-events-none"
        : "grid-template-rows-[1fr] opacity-100 scale-100"
        }`}
      style={{
        gridTemplateRows: isDeleting ? "0fr" : "1fr",
        transitionProperty: "grid-template-rows, opacity, transform, margin",
        marginBottom: isDeleting ? "-24px" : "0px",
      }}
    >
      <div className="overflow-hidden min-h-0">
        <div className="bg-white border border-warm-200 rounded-2xl shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
          {/* Header */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-stone-850 group-hover:text-primary-500 transition-colors truncate">
                      {entry.user.display_name || entry.user.username}
                    </span>
                  </div>
                  <span className="text-xs text-stone-500 truncate">
                    @{entry.user.username} • {timeAgo(entry.created_at)}
                  </span>
                </div>
              </Link>
            </div>

            <div className="relative">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
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
                    }}
                  />
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-warm-200 rounded-xl shadow-xl z-40 py-1.5 animate-fade-in text-left">
                    <div className="flex flex-col">
                      {resolvedIsOwner && listId && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpen(false);
                            router.push(`/lists/${listId}/edit`);
                          }}
                          className="w-full px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors text-left flex items-center gap-2 cursor-pointer font-semibold"
                        >
                          <span>✏️</span> Edit List
                        </button>
                      )}

                      {resolvedIsOwner && listId && (
                        <button
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpen(false);
                            if (confirm("Are you sure you want to delete this list? This action cannot be undone.")) {
                              try {
                                await deleteListMutation.mutateAsync(listId);
                                addToast("List deleted successfully", "success");
                                setIsDeleting(true);
                                setTimeout(() => {
                                  setIsDeleted(true);
                                  if (onDelete) onDelete();
                                }, 400);
                              } catch (err) {
                                addToast("Failed to delete list", "error");
                              }
                            }
                          }}
                          className="w-full px-4 py-2 text-sm text-red-655 hover:bg-red-55 transition-colors text-left flex items-center gap-2 cursor-pointer font-semibold"
                        >
                          <span>🗑️</span> Delete List
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
                          <span>⚠️</span> Report List Post
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Cover image preview */}
          {listId && (
            <Link
              href={`/lists/${listId}`}
              className="block relative mx-4 mb-3 rounded-xl overflow-hidden shadow-sm group border border-stone-200/50"
            >
              <ListCover
                title={entry.restaurant_name}
                cities={rawCities}
                aspectSquare={false}
                disableCityLinks={true}
                showTitle={false}
                coverUrl={entry.metadata?.cover_image_url}
              />
            </Link>
          )}

          {/* Card Body */}
          <div className="p-4 pt-0 flex flex-col flex-1">
            <div className="flex flex-row justify-between items-center mb-2">
              {listId ? (
                <Link
                  href={`/lists/${listId}`}
                  className="font-extrabold text-lg sm:text-xl text-stone-850 hover:text-primary-500 hover:underline transition-colors block leading-tight"
                >
                  {entry.restaurant_name}
                </Link>
              ) : (
                <h3 className="font-extrabold text-lg sm:text-xl text-stone-850 leading-tight">
                  {entry.restaurant_name}
                </h3>
              )}
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                📋 List • {entry.metadata?.item_count || 0} {entry.metadata?.item_count === 1 ? "restaurant" : "restaurants"}
              </span>
            </div>


            {entry.notes && (
              <div className="text-stone-600 text-sm leading-relaxed mb-1">
                <p className={isExpanded ? "" : "line-clamp-3"}>{entry.notes}</p>
                {(entry.notes.split("\n").length > 3 || entry.notes.length > 150) && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsExpanded(!isExpanded);
                    }}
                    className="text-xs font-bold text-primary-500 hover:text-primary-600 mt-1 cursor-pointer block"
                  >
                    {isExpanded ? "Show Less" : "Read More"}
                  </button>
                )}
              </div>
            )}

            {/* Social interactions row */}
            <div className="mt-4 pt-3 border-t border-warm-100 flex items-center justify-between">
              <div className="flex gap-4">
                <button
                  onClick={handleLikeToggle}
                  className={`flex items-center gap-1.5 text-sm font-semibold transition-all duration-200 py-1.5 px-3 rounded-full hover:bg-stone-50 ${counters?.is_liked ? "text-red-500 scale-105" : "text-stone-500 hover:text-red-500"
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
                  className={`flex items-center gap-1.5 text-sm font-semibold transition-all py-1.5 px-3 rounded-full hover:bg-stone-50 ${showComments ? "text-primary-650 bg-primary-50" : "text-stone-500 hover:text-primary-500"
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
                        <div className="bg-stone-50 rounded-2xl p-2.5 flex-1 min-w-0 border border-warm-100 relative">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <Link href={`/profile/${comment.user.id}`} className="font-bold text-xs text-stone-850 hover:underline truncate">
                              {comment.user.display_name || comment.user.username}
                            </Link>

                            {/* Kebab Menu */}
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setActiveCommentMenuId(activeCommentMenuId === comment.id ? null : comment.id);
                                }}
                                className="text-stone-400 hover:text-stone-600 p-0.5 rounded hover:bg-stone-200 transition-colors cursor-pointer flex items-center justify-center"
                              >
                                <EllipsisVertical size={14} />
                              </button>

                              {activeCommentMenuId === comment.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-30"
                                    onClick={() => setActiveCommentMenuId(null)}
                                  />
                                  <div className="absolute right-0 mt-1 w-28 bg-white border border-warm-200 rounded-lg shadow-lg z-45 py-1 text-left">
                                    {user && user.id === comment.user.id ? (
                                      <>
                                        <button
                                          onClick={() => {
                                            setActiveCommentMenuId(null);
                                            setEditingCommentId(comment.id);
                                            setEditingCommentText(comment.content);
                                          }}
                                          className="w-full px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 transition-colors text-left flex items-center gap-1.5 cursor-pointer font-semibold animate-in fade-in slide-in-from-top-1 duration-100"
                                        >
                                          ✏️ Edit
                                        </button>
                                        <button
                                          onClick={() => {
                                            setActiveCommentMenuId(null);
                                            if (window.confirm("Are you sure you want to delete this comment?")) {
                                              deleteCommentMutation.mutate(comment.id);
                                            }
                                          }}
                                          className="w-full px-3 py-1.5 text-xs text-red-655 hover:bg-red-55 transition-colors text-left flex items-center gap-1.5 cursor-pointer font-semibold"
                                        >
                                          🗑️ Delete
                                        </button>
                                      </>
                                    ) : resolvedIsOwner ? (
                                      <>
                                        <button
                                          onClick={() => {
                                            setActiveCommentMenuId(null);
                                            if (window.confirm("Are you sure you want to delete this comment?")) {
                                              deleteCommentMutation.mutate(comment.id);
                                            }
                                          }}
                                          className="w-full px-3 py-1.5 text-xs text-red-655 hover:bg-red-55 transition-colors text-left flex items-center gap-1.5 cursor-pointer font-semibold"
                                        >
                                          🗑️ Delete
                                        </button>
                                        <button
                                          onClick={() => {
                                            setActiveCommentMenuId(null);
                                            addToast("Comment reported.", "success");
                                          }}
                                          className="w-full px-3 py-1.5 text-xs text-stone-750 hover:bg-stone-50 transition-colors text-left flex items-center gap-1.5 cursor-pointer font-semibold"
                                        >
                                          ⚠️ Report
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setActiveCommentMenuId(null);
                                          addToast("Comment reported.", "success");
                                        }}
                                        className="w-full px-3 py-1.5 text-xs text-stone-755 hover:bg-stone-50 transition-colors text-left flex items-center gap-1.5 cursor-pointer font-semibold"
                                      >
                                        ⚠️ Report
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {editingCommentId === comment.id ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (!editingCommentText.trim()) return;
                                editCommentMutation.mutate({ commentId: comment.id, content: editingCommentText.trim() });
                                setEditingCommentId(null);
                              }}
                              className="flex gap-2 items-center mt-1"
                            >
                              <input
                                type="text"
                                value={editingCommentText}
                                onChange={(e) => setEditingCommentText(e.target.value)}
                                className="flex-1 bg-white border border-warm-250 rounded-xl px-2.5 py-1 text-xs text-stone-850 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                autoFocus
                              />
                              <button type="submit" className="text-xs text-primary-655 font-bold hover:underline cursor-pointer">
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCommentId(null)}
                                className="text-xs text-stone-400 hover:underline cursor-pointer"
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <>
                              <p className="text-stone-600 text-xs break-words leading-relaxed">{comment.content}</p>

                              {/* Like & Timestamp Row */}
                              <div className="flex items-center gap-2.5 mt-1.5 text-[10px] text-stone-400">
                                <button
                                  onClick={() => {
                                    toggleLikeCommentMutation.mutate({
                                      commentId: comment.id,
                                      currentlyLiked: !!comment.is_liked,
                                    });
                                  }}
                                  className={`flex items-center gap-0.5 hover:text-red-500 transition-colors cursor-pointer font-semibold ${comment.is_liked ? "text-red-500" : ""
                                    }`}
                                >
                                  <span>{comment.is_liked ? "❤️" : "🤍"}</span>
                                  {comment.likes_count > 0 && <span>{comment.likes_count}</span>}
                                </button>
                                <span>•</span>
                                <span>{timeAgo(comment.created_at)}</span>
                              </div>
                            </>
                          )}
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
      </div>
    </div>
  );
};
