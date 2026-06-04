"use client";

import React, { useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useAuthStore } from "../../../../stores/auth-store";
import { useUser, useUserEntries, useFollow, useUnfollow, useUpdateProfile, useUploadAvatar } from "../../../../hooks/use-users";
import { useToastStore } from "../../../../stores/toast-store";
import { FeedList } from "../../../../components/feed/FeedList";
import { Avatar } from "../../../../components/ui/Avatar";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Textarea } from "../../../../components/ui/Textarea";
import { FollowsModal } from "../../../../components/profile/FollowsModal";

export default function ProfilePage() {
  const params = useParams();
  const id = params?.id as string;

  const { user: currentUser } = useAuthStore();
  const { data: user, isLoading: isUserLoading } = useUser(id);
  const { data: entriesData, isLoading: isEntriesLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useUserEntries(id, 10);
  const follow = useFollow();
  const unfollow = useUnfollow();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const { addToast } = useToastStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  
  const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
  const [socialModalTab, setSocialModalTab] = useState<"followers" | "following" | "friends">("followers");

  const openSocialModal = (tab: "followers" | "following" | "friends") => {
    setSocialModalTab(tab);
    setIsSocialModalOpen(true);
  };

  const isOwnProfile = currentUser?.id === id;
  const entries = entriesData?.pages.flatMap((page) => page.data) || [];

  const handleFollowToggle = async () => {
    if (!user) return;
    try {
      if (user.is_following) {
        await unfollow.mutateAsync(id);
        addToast(`Unfollowed @${user.username}`, "success");
      } else {
        await follow.mutateAsync(id);
        addToast(`Followed @${user.username}`, "success");
      }
    } catch (err: any) {
      addToast(err.message || "Failed to toggle follow status", "error");
    }
  };

  const handleAvatarClick = () => {
    if (isOwnProfile) {
      fileInputRef.current?.click();
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadAvatar.mutateAsync(file);
      addToast("Avatar updated successfully!", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to upload avatar", "error");
    }
  };

  const handleStartEdit = () => {
    if (!user) return;
    setEditDisplayName(user.display_name || "");
    setEditBio(user.bio || "");
    setIsEditing(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile.mutateAsync({
        display_name: editDisplayName,
        bio: editBio,
      });
      addToast("Profile updated successfully!", "success");
      setIsEditing(false);
    } catch (err: any) {
      addToast(err.message || "Failed to update profile", "error");
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex justify-center p-12">
        <span className="animate-spin text-4xl">🍲</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold text-stone-800">User not found</h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="bg-white border border-warm-200 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row gap-6 items-start md:items-center">
        <div className="relative group cursor-pointer flex-shrink-0" onClick={handleAvatarClick}>
          <Avatar
            src={user.avatar_url}
            username={user.username}
            size="lg"
            className={isOwnProfile ? "group-hover:opacity-75 transition-opacity" : ""}
          />
          {isOwnProfile && (
            <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-bold">Upload</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <div className="flex-1 flex flex-col gap-4">
          {isEditing ? (
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-3 max-w-md">
              <Input
                label="Display Name"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
              />
              <Textarea
                label="Bio"
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={updateProfile.isPending}
                >
                  Save
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-4 flex-wrap">
                <h1 className="text-2xl font-black text-stone-900 leading-none">
                  {user.display_name || user.username}
                </h1>
                {isOwnProfile ? (
                  <Button variant="secondary" size="sm" onClick={handleStartEdit}>
                    Edit Profile
                  </Button>
                ) : (
                  <Button
                    variant={user.is_following ? "secondary" : "primary"}
                    size="sm"
                    onClick={handleFollowToggle}
                    isLoading={follow.isPending || unfollow.isPending}
                  >
                    {user.is_following ? "Unfollow" : "Follow"}
                  </Button>
                )}
              </div>
              <span className="text-stone-500 font-semibold text-sm">@{user.username}</span>
              {user.bio && <p className="text-stone-600 text-sm mt-1">{user.bio}</p>}
            </div>
          )}

          <div className="flex gap-6 border-t border-warm-100 pt-4 mt-2">
            <div className="flex flex-col">
              <span className="text-stone-900 font-black text-lg">
                {entries.length || 0}
              </span>
              <span className="text-stone-500 text-xs font-bold uppercase">Entries</span>
            </div>
            <button
              onClick={() => openSocialModal("followers")}
              className="flex flex-col text-left hover:opacity-75 transition-opacity focus:outline-none cursor-pointer"
            >
              <span className="text-stone-900 font-black text-lg">
                {user.follower_count ?? 0}
              </span>
              <span className="text-stone-500 text-xs font-bold uppercase">Followers</span>
            </button>
            <button
              onClick={() => openSocialModal("following")}
              className="flex flex-col text-left hover:opacity-75 transition-opacity focus:outline-none cursor-pointer"
            >
              <span className="text-stone-900 font-black text-lg">
                {user.following_count ?? 0}
              </span>
              <span className="text-stone-500 text-xs font-bold uppercase">Following</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-black text-stone-900 tracking-tight">Journal Entries</h2>
        <FeedList
          entries={entries}
          isLoading={isEntriesLoading}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          emptyTitle="No journal entries"
          emptyDescription={
            isOwnProfile
              ? "You haven't posted any taste journal entries yet!"
              : "This user hasn't posted any entries yet."
          }
        />
      </div>

      <FollowsModal
        isOpen={isSocialModalOpen}
        onClose={() => setIsSocialModalOpen(false)}
        userId={id}
        initialTab={socialModalTab}
      />
    </div>
  );
}
