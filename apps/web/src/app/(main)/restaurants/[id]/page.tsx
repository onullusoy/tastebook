"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRestaurantDetail } from "../../../../hooks/use-restaurants";
import { useDeleteEntry } from "../../../../hooks/use-entries";
import { useAuthStore } from "../../../../stores/auth-store";
import { useToastStore } from "../../../../stores/toast-store";
import { EntryCard } from "../../../../components/feed/EntryCard";
import { Spinner } from "../../../../components/ui/Spinner";
import { Button } from "../../../../components/ui/Button";
import { ImagePreviewModal } from "../../../../components/entry/ImagePreviewModal";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../lib/api-client";

type TabType = "my" | "network" | "public";

export default function RestaurantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params?.id as string;

  const { data: detail, isLoading, error } = useRestaurantDetail(id);
  const deleteEntry = useDeleteEntry();
  const { user } = useAuthStore();
  const { addToast } = useToastStore();

  const [activeTab, setActiveTab] = useState<TabType>("my");
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = () => {
    if (detail?.restaurant.formatted_address) {
      navigator.clipboard.writeText(detail.restaurant.formatted_address);
      setCopied(true);
      addToast("Address copied to clipboard", "success");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    try {
      await deleteEntry.mutateAsync(entryId);
      addToast("Entry deleted successfully", "success");
      queryClient.invalidateQueries({ queryKey: ["restaurants", "detail", id] });
    } catch (err: any) {
      addToast(err.message || "Failed to delete entry", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="max-w-md mx-auto py-12 text-center flex flex-col items-center gap-4">
        <h2 className="text-xl font-bold text-stone-800">Restaurant not found</h2>
        <p className="text-sm text-stone-500">
          The restaurant details could not be loaded. Please try again.
        </p>
        <Button variant="secondary" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const { restaurant, my_entries, network_entries, public_entries } = detail;
  const stats = restaurant.stats;

  const getEntriesForTab = () => {
    switch (activeTab) {
      case "my":
        return my_entries;
      case "network":
        return network_entries;
      case "public":
        return public_entries;
    }
  };

  const currentEntries = getEntriesForTab();

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="cursor-pointer">
          ← Back
        </Button>
      </div>

      {/* Restaurant Report Card Dashboard */}
      <div className="bg-white border border-warm-200 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col gap-6">
        <div>
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-black uppercase tracking-wider text-primary-500">
                Restaurant Profile
              </span>
              <h1 className="text-3xl font-black text-stone-900 tracking-tight mt-1">
                {restaurant.name}
              </h1>
              {restaurant.formatted_address ? (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-stone-500 text-sm flex items-center gap-1.5 min-w-0">
                    📍
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.name + ", " + restaurant.formatted_address)}&query_place_id=${restaurant.google_place_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-primary-600 font-semibold truncate block"
                      title="Open in Google Maps"
                    >
                      {restaurant.formatted_address}
                    </a>
                  </span>
                  <button
                    onClick={handleCopyAddress}
                    className="text-stone-400 hover:text-stone-600 text-xs font-bold px-2 py-1 rounded bg-stone-550 border border-warm-200 hover:bg-stone-100 transition-all cursor-pointer"
                    title="Copy Address"
                  >
                    {copied ? "Copied! ✓" : "Copy"}
                  </button>
                </div>
              ) : (
                <p className="text-stone-500 text-sm mt-1">
                  📍 {restaurant.city}, {restaurant.country}
                </p>
              )}
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                router.push(
                  `/entries/new?google_place_id=${restaurant.google_place_id}&name=${encodeURIComponent(
                    restaurant.name
                  )}&city=${encodeURIComponent(restaurant.city)}&country=${encodeURIComponent(
                    restaurant.country
                  )}`
                )
              }
              className="flex-shrink-0 cursor-pointer"
            >
              + Add Review
            </Button>
          </div>

          {restaurant.photos && restaurant.photos.length > 0 && (
            <div className="mt-4">
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-2">
                Photos
              </span>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {restaurant.photos.map((photoRef, index) => {
                  const token = api.getAccessToken();
                  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
                  const thumbUrl = `${baseUrl}/places/photo?photo_reference=${photoRef}&maxwidth=400&token=${token || ""}`;
                  const zoomUrl = `${baseUrl}/places/photo?photo_reference=${photoRef}&maxwidth=1600&token=${token || ""}`;
                  return (
                    <button
                      key={index}
                      onClick={() => setZoomedImageUrl(zoomUrl)}
                      className="relative h-20 w-28 flex-shrink-0 rounded-xl overflow-hidden border border-warm-100 hover:scale-105 hover:shadow-md transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbUrl}
                        alt={`${restaurant.name} photo ${index + 1}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-warm-100 pt-6">
          <div className="bg-warm-50/50 p-4 rounded-xl border border-warm-100 flex flex-col items-center justify-center text-center">
            <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">
              Rating
            </span>
            <span className="text-2xl font-black text-stone-800 mt-1">
              {stats?.rating_count && stats.rating_count > 0 ? `${stats.rating_avg}/10` : "—"}
            </span>
          </div>

          <div className="bg-warm-50/50 p-4 rounded-xl border border-warm-100 flex flex-col items-center justify-center text-center">
            <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">
              Reviews
            </span>
            <span className="text-2xl font-black text-stone-800 mt-1">
              {stats?.rating_count ?? 0}
            </span>
          </div>

          <div className="bg-warm-50/50 p-4 rounded-xl border border-warm-100 flex flex-col items-center justify-center text-center">
            <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">
              Price Range
            </span>
            <span className="text-2xl font-black text-stone-800 mt-1">
              {stats?.price_level_avg && stats.price_level_avg > 0
                ? "$".repeat(Math.round(stats.price_level_avg))
                : "—"}
            </span>
          </div>

          <div className="bg-warm-50/50 p-4 rounded-xl border border-warm-100 flex flex-col items-center justify-center text-center">
            <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">
              Dominant Tag
            </span>
            <span className="text-sm font-black text-primary-600 mt-2 truncate w-full px-1">
              {stats?.dominant_tags && stats.dominant_tags.length > 0
                ? stats.dominant_tags[0]
                : "None yet"}
            </span>
          </div>
        </div>

        {/* Atmosphere Tags list */}
        {stats?.dominant_tags && stats.dominant_tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {stats.dominant_tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-bold px-3 py-1 rounded-full bg-primary-50 text-primary-700 border border-primary-100 capitalize"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Review Segmentation Tabs */}
      <div className="flex border-b border-warm-200">
        <button
          onClick={() => setActiveTab("my")}
          className={`flex-1 py-3 text-sm font-black uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${activeTab === "my"
            ? "border-primary-500 text-primary-600 font-black"
            : "border-transparent text-stone-400 hover:text-stone-600"
            }`}
        >
          My Reviews ({my_entries.length})
        </button>
        <button
          onClick={() => setActiveTab("network")}
          className={`flex-1 py-3 text-sm font-black uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${activeTab === "network"
            ? "border-primary-500 text-primary-600 font-black"
            : "border-transparent text-stone-400 hover:text-stone-600"
            }`}
        >
          Following Reviews ({network_entries.length})
        </button>
        <button
          onClick={() => setActiveTab("public")}
          className={`flex-1 py-3 text-sm font-black uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${activeTab === "public"
            ? "border-primary-500 text-primary-600 font-black"
            : "border-transparent text-stone-400 hover:text-stone-600"
            }`}
        >
          Public Reviews ({public_entries.length})
        </button>
      </div>

      {/* Review Entries List */}
      <div className="flex flex-col gap-6">
        {currentEntries.length === 0 ? (
          <div className="bg-white border border-warm-200 rounded-2xl p-12 text-center flex flex-col items-center gap-4 shadow-sm">
            <span className="text-4xl">🍽️</span>
            <div>
              <h3 className="text-lg font-bold text-stone-800">
                {activeTab === "my"
                  ? "No reviews from you yet"
                  : activeTab === "network"
                    ? "No reviews from your network"
                    : "No public reviews yet"}
              </h3>
              <p className="text-stone-400 text-sm mt-1 max-w-sm">
                {activeTab === "my"
                  ? "Share your dining experience at this venue with your friends!"
                  : activeTab === "network"
                    ? "None of the users you follow have posted a review for this restaurant yet."
                    : "Be the first one to share a public review of this restaurant!"}
              </p>
            </div>
            {activeTab === "my" && (
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  router.push(
                    `/entries/new?google_place_id=${restaurant.google_place_id
                    }&name=${encodeURIComponent(restaurant.name)}&city=${encodeURIComponent(
                      restaurant.city
                    )}&country=${encodeURIComponent(restaurant.country)}`
                  )
                }
              >
                Create a Review
              </Button>
            )}
          </div>
        ) : (
          currentEntries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              isOwner={user?.id === entry.user.id}
              onDelete={() => handleDelete(entry.id)}
              onImageClick={setZoomedImageUrl}
            />
          ))
        )}
      </div>

      <ImagePreviewModal
        isOpen={!!zoomedImageUrl}
        onClose={() => setZoomedImageUrl(null)}
        imageUrl={zoomedImageUrl || ""}
        altText={restaurant.name}
      />
    </div>
  );
}
