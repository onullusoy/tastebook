import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { Avatar } from "../ui/Avatar";
import { Spinner } from "../ui/Spinner";
import {
  useUserFollowers,
  useUserFollowing,
  useUserFriends,
  useFollow,
  useUnfollow,
} from "../../hooks/use-users";
import { useAuthStore } from "../../stores/auth-store";

interface FollowsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  initialTab: "followers" | "following" | "friends";
}

export const FollowsModal = ({
  isOpen,
  onClose,
  userId,
  initialTab,
}: FollowsModalProps) => {
  const [activeTab, setActiveTab] = React.useState<"followers" | "following" | "friends">(initialTab);
  const { user: currentUser } = useAuthStore();

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const followersQuery = useUserFollowers(userId);
  const followingQuery = useUserFollowing(userId);
  const friendsQuery = useUserFriends(userId);

  const followMutation = useFollow();
  const unfollowMutation = useUnfollow();

  const getActiveQuery = () => {
    switch (activeTab) {
      case "followers":
        return followersQuery;
      case "following":
        return followingQuery;
      case "friends":
        return friendsQuery;
    }
  };

  const query = getActiveQuery();
  const users = query.data?.pages.flatMap((page) => page.data) || [];

  // Infinite Scroll Trigger using IntersectionObserver
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!query.hasNextPage || query.isFetchingNextPage || !isOpen) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          query.fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage, isOpen, activeTab]);

  if (!isOpen) return null;

  const handleFollowToggle = async (targetId: string, isFollowing: boolean) => {
    if (isFollowing) {
      await unfollowMutation.mutateAsync(targetId);
    } else {
      await followMutation.mutateAsync(targetId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-white rounded-3xl w-full max-w-md shadow-2xl border border-stone-100 overflow-hidden z-10 flex flex-col max-h-[80vh] transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h3 className="text-lg font-black text-stone-900">Connections</h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 font-bold text-lg p-1.5 hover:bg-stone-50 rounded-full transition-all"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-stone-100">
          {(["followers", "following", "friends"] as const).map((tab) => {
            const isActive = activeTab === tab;
            const labels = {
              followers: "Followers",
              following: "Following",
              friends: "Friends",
            };
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-bold border-b-2 transition-all capitalize ${
                  isActive
                    ? "border-primary-500 text-primary-500 font-black"
                    : "border-transparent text-stone-500 hover:text-stone-700"
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* User List Container */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-[250px] flex flex-col gap-4">
          {query.isLoading ? (
            <div className="flex items-center justify-center flex-1 py-12">
              <Spinner size="md" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 text-stone-500">
              <span className="text-3xl mb-2">👥</span>
              <p className="text-sm font-medium">
                {activeTab === "followers" && "No followers yet."}
                {activeTab === "following" && "Not following anyone yet."}
                {activeTab === "friends" && "No mutual friends yet."}
              </p>
            </div>
          ) : (
            <>
              {users.map((item) => {
                const isSelf = currentUser?.id === item.id;
                const following = item.is_following ?? false;
                const friend = item.is_friend ?? false;
                const mutating =
                  (followMutation.isPending && followMutation.variables === item.id) ||
                  (unfollowMutation.isPending && unfollowMutation.variables === item.id);

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-1"
                  >
                    <Link
                      href={`/profile/${item.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 min-w-0 flex-1 group"
                    >
                      <Avatar
                        src={item.avatar_url}
                        username={item.username}
                        size="sm"
                        className="flex-shrink-0"
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-stone-850 text-sm truncate group-hover:text-primary-500 transition-colors">
                            {item.display_name || item.username}
                          </span>
                          {friend && (
                            <span className="text-[9px] bg-emerald-50 text-emerald-700 font-extrabold px-1.5 py-0.5 rounded leading-none select-none">
                              Mutual
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-stone-400 truncate">
                          @{item.username}
                        </span>
                      </div>
                    </Link>

                    {/* Follow/Unfollow Button inside Modal */}
                    {!isSelf && (
                      <button
                        onClick={() => handleFollowToggle(item.id, following)}
                        disabled={mutating}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all shadow-sm flex-shrink-0 ${
                          following
                            ? "bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200"
                            : "bg-primary-500 hover:bg-primary-600 text-white"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {mutating ? "..." : following ? "Following" : "Follow"}
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Infinite scroll load trigger */}
              <div ref={loadMoreRef} className="h-4 flex items-center justify-center">
                {query.isFetchingNextPage && <Spinner size="sm" />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
