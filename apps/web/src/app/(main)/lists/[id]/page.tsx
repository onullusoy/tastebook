"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useList, useRemoveFromList, useDeleteList, useLikeList, useUnlikeList, useAddToList } from "../../../../hooks/use-lists";
import { useAuthStore } from "../../../../stores/auth-store";
import { useToastStore } from "../../../../stores/toast-store";
import { Spinner } from "../../../../components/ui/Spinner";
import { Button } from "../../../../components/ui/Button";
import { ListCover } from "../../../../components/lists/ListCover";
import { LocationAutocomplete } from "../../../../components/entry/LocationAutocomplete";
import { Heart, Trash2, ArrowLeft, Edit, EllipsisVertical } from "lucide-react";
import { useComments, useAddComment, useDeleteComment, useEditComment, useToggleLikeComment } from "../../../../hooks/use-entries";
import { Avatar } from "../../../../components/ui/Avatar";
import { timeAgo } from "../../../../lib/date-utils";

export default function ListDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { data: list, isLoading, error } = useList(id);
  const removeFromList = useRemoveFromList();
  const deleteList = useDeleteList();
  const addToList = useAddToList();
  const likeList = useLikeList(id);
  const unlikeList = useUnlikeList(id);
  const { user } = useAuthStore();
  const { addToast } = useToastStore();

  // Load comment hooks if feed_entry_id is populated
  const feedEntryId = list?.feed_entry_id;
  const { data: comments, isLoading: isLoadingComments } = useComments(feedEntryId || "", !!feedEntryId);
  const addCommentMutation = useAddComment(feedEntryId || "");
  const deleteCommentMutation = useDeleteComment(feedEntryId || "");
  const editCommentMutation = useEditComment(feedEntryId || "");
  const toggleLikeCommentMutation = useToggleLikeComment(feedEntryId || "");

  const [newCommentText, setNewCommentText] = useState("");
  const [activeCommentMenuId, setActiveCommentMenuId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    addCommentMutation.mutate(newCommentText.trim());
    setNewCommentText("");
  };

  const [isAdding, setIsAdding] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const [searchPlaceId, setSearchPlaceId] = useState<string | null>(null);
  const [searchCity, setSearchCity] = useState("");
  const [searchCountry, setSearchCountry] = useState("");

  const isOwner = user?.id === list?.user.id;
  const isCollaborator = user && list?.collaborators.some((c) => c.user.id === user.id);
  const canModify = isOwner || isCollaborator;

  // Auto-inject restaurant when selected from autocomplete
  useEffect(() => {
    if (searchPlaceId && searchVal) {
      addToList.mutate(
        {
          listId: id,
          restaurantId: searchPlaceId,
          name: searchVal,
          city: searchCity || undefined,
          country: searchCountry || undefined,
        },
        {
          onSuccess: () => {
            addToast("Restaurant added to list!", "success");
            setIsAdding(false);
          },
          onError: (err: any) => {
            addToast(err.message || "Failed to add restaurant", "error");
          },
        }
      );
      // Reset search inputs
      setSearchVal("");
      setSearchPlaceId(null);
      setSearchCity("");
      setSearchCountry("");
    }
  }, [searchPlaceId, searchVal, searchCity, searchCountry, id, addToList, addToast]);

  const handleRemoveItem = async (restaurantId: string) => {
    try {
      await removeFromList.mutateAsync({ listId: id, restaurantId });
      addToast("Restaurant removed from list", "success");
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

  const handleLikeToggle = async () => {
    if (!user) {
      addToast("You must be logged in to like lists", "error");
      return;
    }
    try {
      if (list?.is_liked) {
        await unlikeList.mutateAsync();
        addToast("Removed from your library", "success");
      } else {
        await likeList.mutateAsync();
        addToast("Added to your library", "success");
      }
    } catch (err: any) {
      addToast(err.message || "Action failed", "error");
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
        <h2 className="text-xl font-bold text-stone-850">List not found</h2>
        <p className="text-sm text-stone-500 font-semibold">
          The list you are looking for does not exist or you don't have permission to view it.
        </p>
        <Button variant="secondary" onClick={() => router.push("/lists")} className="cursor-pointer">
          Back to Lists
        </Button>
      </div>
    );
  }

  const cities = list.metadata?.cities || [];

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="cursor-pointer">
          <ArrowLeft size={16} className="mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {user && (
            <button
              onClick={handleLikeToggle}
              className={`p-2.5 rounded-full border transition-all cursor-pointer ${
                list.is_liked
                  ? "bg-red-50 text-red-500 border-red-200 scale-105"
                  : "bg-white text-stone-500 border-warm-200 hover:text-red-500 hover:bg-stone-50"
              }`}
              title={list.is_liked ? "Unlike List" : "Like List"}
            >
              <Heart size={20} fill={list.is_liked ? "currentColor" : "none"} />
            </button>
          )}
          {canModify && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/lists/${id}/edit`)}
              className="flex items-center gap-1 hover:bg-stone-55 border-warm-250 cursor-pointer font-bold"
            >
              <Edit size={14} /> Edit List
            </Button>
          )}
          {isOwner && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDeleteList}
              className="text-red-650 hover:bg-red-50 border-red-100 cursor-pointer font-bold"
            >
              🗑️ Delete List
            </Button>
          )}
        </div>
      </div>

      {/* wide rectangular list cover banner */}
      <ListCover
        title={list.title}
        creator={list.user}
        cities={cities}
        aspectSquare={false}
        coverUrl={list.cover_image_url}
      />

      {/* Description Overlay Details */}
      {list.description && (
        <div className="bg-white border border-warm-200 rounded-2xl p-5 shadow-sm">
          <p className="text-stone-700 text-sm leading-relaxed">{list.description}</p>
        </div>
      )}

      {/* Tracklist / Restaurants Canvas */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black text-stone-900 tracking-tight">Restaurants</h2>
            {canModify && (
              <button
                onClick={() => setIsAdding(!isAdding)}
                className="text-xs font-bold text-primary-600 hover:text-primary-750 hover:bg-primary-50 border border-primary-200/60 px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 cursor-pointer"
              >
                {isAdding ? "Cancel" : "➕ Add"}
              </button>
            )}
          </div>
          <span className="text-xs font-bold text-stone-400 capitalize bg-stone-100 px-2.5 py-1 rounded-full">
            {list.visibility} List
          </span>
        </div>

        {/* Add Restaurant Section (if creator/editor) */}
        {canModify && isAdding && (
          <div className="bg-stone-50 border border-stone-250/60 rounded-2xl p-4 flex flex-col gap-3 shadow-inner animate-in fade-in duration-200">
            <LocationAutocomplete
              label=""
              placeholder="Search restaurant by name to add directly..."
              value={searchVal}
              onChange={(val) => setSearchVal(val)}
              onChangeGooglePlaceId={(id) => setSearchPlaceId(id)}
              onChangeCity={(city) => setSearchCity(city)}
              onChangeCountry={(country) => setSearchCountry(country)}
            />
          </div>
        )}

        {!list.items || list.items.length === 0 ? (
          <div className="text-center py-16 bg-warm-50 border border-warm-150 rounded-2xl shadow-inner">
            <p className="text-stone-500 font-bold">No restaurants in this list yet.</p>
            <p className="text-xs text-stone-400 mt-1">
              Use the search bar above or add from the entries page to populate this list.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {list.items.map((restaurant, idx) => (
              <div
                key={restaurant.google_place_id}
                className="bg-white border border-warm-200 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4 hover:shadow-md hover:border-warm-300 transition-all group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Track Number */}
                  <span className="w-6 text-sm font-black text-stone-400 text-center flex-shrink-0 group-hover:text-primary-500 transition-colors">
                    {idx + 1}
                  </span>

                  {/* Restaurant details */}
                  <div className="min-w-0">
                    <h3 className="font-bold text-stone-850 truncate">
                      <Link
                        href={`/restaurants/${restaurant.google_place_id}`}
                        className="hover:underline hover:text-primary-500 transition-colors"
                      >
                        {restaurant.name}
                      </Link>
                    </h3>
                    <p className="text-xs text-stone-500 font-semibold mt-0.5 truncate">
                      📍{" "}
                      <Link
                        href={`/city/${encodeURIComponent(restaurant.city)}`}
                        className="hover:underline text-primary-500"
                      >
                        {restaurant.city}
                      </Link>
                      , {restaurant.country}
                    </p>
                    {restaurant.stats?.dominant_tags && restaurant.stats.dominant_tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5 overflow-x-auto scrollbar-none">
                        {restaurant.stats.dominant_tags.slice(0, 3).map((tag: string, i: number) => (
                          <span
                            key={i}
                            className="text-[10px] bg-primary-50 text-primary-750 border border-primary-100 px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right content / Actions */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200/50 px-2 py-0.5 rounded-lg text-xs font-bold">
                      ⭐ {restaurant.stats?.rating_avg || "0.0"}
                    </div>
                    <span className="text-[10px] text-stone-400 font-semibold">
                      {restaurant.stats?.rating_count || 0} reviews
                    </span>
                  </div>



                  {canModify && (
                    <button
                      onClick={() => handleRemoveItem(restaurant.google_place_id)}
                      className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                      title="Remove from List"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comments Panel */}
      {feedEntryId && (
        <div className="bg-white border border-warm-200 rounded-2xl p-5 shadow-sm mt-4">
          <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wider mb-4">
            Comments
          </h3>

          {/* Comment input form */}
          {user && (
            <form onSubmit={handleCommentSubmit} className="flex gap-2 items-center mb-5">
              <input
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 bg-stone-550 focus:bg-white text-xs px-3.5 py-2 rounded-full border border-warm-250 focus:border-primary-400 focus:outline-none transition-all placeholder:text-stone-400 text-stone-700"
              />
              <button
                type="submit"
                disabled={!newCommentText.trim() || addCommentMutation.isPending}
                className="bg-primary-500 hover:bg-primary-600 text-white font-bold text-xs px-3.5 py-2 rounded-full transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                Send
              </button>
            </form>
          )}

          {/* Comments list */}
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
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
                              ) : isOwner ? (
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
                            className={`flex items-center gap-0.5 hover:text-red-500 transition-colors cursor-pointer font-semibold ${
                              comment.is_liked ? "text-red-500" : ""
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
        </div>
      )}
    </div>
  );
}
