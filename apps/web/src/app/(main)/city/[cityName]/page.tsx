"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCityFeed } from "../../../../hooks/use-feed";
import { FeedList } from "../../../../components/feed/FeedList";
import { Avatar } from "../../../../components/ui/Avatar";
import { Spinner } from "../../../../components/ui/Spinner";
import { Button } from "../../../../components/ui/Button";
import { useAuthStore } from "../../../../stores/auth-store";
import {
  useCityStats,
  useCityRestaurantRankings,
  useCityGourmetRankings,
} from "../../../../hooks/use-cities";

type MainTab = "feed" | "restaurants" | "gourmets";
type RestaurantSubTab = "popularity" | "rating";
type GourmetSubTab = "public" | "friends";

export default function CityFeedPage() {
  const params = useParams();
  const router = useRouter();
  const rawCityName = params?.cityName as string;
  const cityName = decodeURIComponent(rawCityName || "");

  const { user } = useAuthStore();
  const isAuthenticated = !!user;

  // Active Tab States
  const [activeTab, setActiveTab] = useState<MainTab>("feed");
  const [feedScope, setFeedScope] = useState<"following" | "public">("following");
  const [restaurantSort, setRestaurantSort] = useState<RestaurantSubTab>("popularity");
  const [gourmetScope, setGourmetScope] = useState<GourmetSubTab>("public");

  // Query Hooks
  const { data: stats, isLoading: statsLoading } = useCityStats(cityName);

  const {
    data: feedData,
    isLoading: feedLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useCityFeed(cityName, feedScope);

  const {
    data: restaurantsRanking,
    isLoading: restaurantsLoading,
  } = useCityRestaurantRankings(cityName, restaurantSort);

  const {
    data: gourmetsRanking,
    isLoading: gourmetsLoading,
  } = useCityGourmetRankings(cityName, gourmetScope, isAuthenticated);

  const feedEntries = feedData?.pages.flatMap((page) => page.data) ?? [];

  // Main Tab Button Component
  const MainTabButton = ({
    value,
    label,
  }: {
    value: MainTab;
    label: string;
  }) => {
    const active = activeTab === value;
    return (
      <button
        onClick={() => setActiveTab(value)}
        className={`w-full py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center cursor-pointer ${active
            ? "bg-white text-stone-900 shadow-sm border border-warm-200"
            : "text-stone-500 hover:text-stone-750"
          }`}
      >
        {label}
      </button>
    );
  };

  // Sub Tab Button Component
  const SubTabButton = <T extends string>({
    value,
    label,
    activeValue,
    onChange,
  }: {
    value: T;
    label: string;
    activeValue: T;
    onChange: (val: T) => void;
  }) => {
    const active = activeValue === value;
    return (
      <button
        onClick={() => onChange(value)}
        className={`w-full py-2 text-xs font-bold rounded-lg transition-all cursor-pointer text-center ${active
            ? "bg-stone-900 text-white shadow-sm"
            : "bg-stone-100 text-stone-500 hover:text-stone-750 border border-warm-200/50"
          }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col gap-6">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="cursor-pointer">
          ← Back
        </Button>
      </div>

      {/* City Profile Card */}
      <div className="bg-white border border-warm-200 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col gap-6">
        <div className="flex justify-between items-center gap-4">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <span className="text-3xl select-none flex-shrink-0 mt-0.5">📍</span>
            <div className="flex flex-col min-w-0">
              <h1 className="text-3xl font-black text-stone-900 tracking-tight leading-tight">
                {cityName}
              </h1>
              {stats?.country && (
                <p className="text-stone-500 text-sm font-semibold mt-1">
                  {stats.country}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              router.push(
                `/entries/new?city=${encodeURIComponent(cityName)}&country=${encodeURIComponent(stats?.country || "")}`
              )
            }
            className="flex-shrink-0 cursor-pointer"
          >
            + Add Review
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 border-t border-warm-200 pt-6">
          <div className="bg-stone-50/60 border border-warm-200/60 rounded-xl p-4 flex flex-col">
            <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              Total Restaurants
            </span>
            <span className="text-2xl font-black text-stone-900 mt-1">
              {statsLoading ? "..." : stats?.total_restaurants ?? 0}
            </span>
          </div>
          <div className="bg-stone-50/60 border border-warm-200/60 rounded-xl p-4 flex flex-col">
            <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              Total Reviews
            </span>
            <span className="text-2xl font-black text-stone-900 mt-1">
              {statsLoading ? "..." : stats?.total_reviews ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Container */}
      <div className="flex flex-col">
        {/* Main Tab Controller - Grid of 3 equal columns */}
        <div className="grid grid-cols-3 bg-stone-100 p-1 rounded-2xl border border-stone-200/50 shadow-inner select-none">
          <MainTabButton value="feed" label="Feed" />
          <MainTabButton value="restaurants" label="Top Restaurants" />
          <MainTabButton value="gourmets" label="Top Gourmets" />
        </div>

        {/* Sub Tabs Controller - Grid of 2 equal columns */}
        <div className="grid grid-cols-2 gap-2 bg-stone-100/50 p-1 rounded-xl border border-warm-200/40 select-none">
          {activeTab === "feed" && (
            <>
              <SubTabButton
                value="following"
                label="Following Feed"
                activeValue={feedScope}
                onChange={setFeedScope}
              />
              <SubTabButton
                value="public"
                label="All Public"
                activeValue={feedScope}
                onChange={setFeedScope}
              />
            </>
          )}
          {activeTab === "restaurants" && (
            <>
              <SubTabButton
                value="popularity"
                label="Popularity"
                activeValue={restaurantSort}
                onChange={setRestaurantSort}
              />
              <SubTabButton
                value="rating"
                label="Avg. Rating"
                activeValue={restaurantSort}
                onChange={setRestaurantSort}
              />
            </>
          )}
          {activeTab === "gourmets" && (
            <>
              <SubTabButton
                value="public"
                label="Public"
                activeValue={gourmetScope}
                onChange={setGourmetScope}
              />
              {isAuthenticated ? (
                <SubTabButton
                  value="friends"
                  label="Friends"
                  activeValue={gourmetScope}
                  onChange={setGourmetScope}
                />
              ) : (
                <button
                  disabled
                  className="w-full py-2 text-xs font-bold rounded-lg bg-stone-100/40 text-stone-300 border border-warm-200/30 cursor-not-allowed text-center"
                >
                  Friends (Auth required)
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="mt-2 min-h-[300px]">
        {activeTab === "feed" && (
          <FeedList
            entries={feedEntries}
            isLoading={feedLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={!!hasNextPage}
            fetchNextPage={fetchNextPage}
            emptyTitle={
              feedScope === "following"
                ? `No entries from people you follow in ${cityName}`
                : `No public entries in ${cityName} yet`
            }
            emptyDescription={
              feedScope === "following"
                ? `Try switching to "All Public" tab to see what others shared in ${cityName}.`
                : "Be the first one to share a memory here!"
            }
          />
        )}

        {activeTab === "restaurants" && (
          <>
            {restaurantsLoading ? (
              <div className="flex justify-center p-12">
                <Spinner size="lg" />
              </div>
            ) : !restaurantsRanking || restaurantsRanking.length === 0 ? (
              <div className="text-center py-12 bg-white border border-warm-200 rounded-2xl">
                <p className="text-stone-500 font-medium">No restaurants ranked in {cityName} yet.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {restaurantsRanking.map((item, index) => (
                  <div
                    key={item.google_place_id}
                    onClick={() => router.push(`/restaurants/${item.google_place_id}`)}
                    className="bg-white border border-warm-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-warm-300 transition-all cursor-pointer flex justify-between items-center group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center font-black text-stone-700 group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors flex-shrink-0">
                        #{index + 1}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-stone-850 group-hover:text-primary-600 transition-colors truncate">
                          {item.name}
                        </h3>
                        <p className="text-xs text-stone-500 font-semibold mt-0.5">
                          {item.city}, {item.country}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <div className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200/60 px-2 py-0.5 rounded-lg text-xs font-bold">
                        ⭐ {item.rating_avg}
                      </div>
                      <span className="text-xs text-stone-400 font-bold">
                        {item.review_count} {item.review_count === 1 ? "review" : "reviews"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "gourmets" && (
          <>
            {gourmetsLoading ? (
              <div className="flex justify-center p-12">
                <Spinner size="lg" />
              </div>
            ) : !gourmetsRanking || gourmetsRanking.length === 0 ? (
              <div className="text-center py-12 bg-white border border-warm-200 rounded-2xl">
                <p className="text-stone-500 font-medium">No gourmets ranked in {cityName} yet.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {gourmetsRanking.map((gourmet, index) => (
                  <div
                    key={gourmet.id}
                    onClick={() => router.push(`/profile/${gourmet.id}`)}
                    className="bg-white border border-warm-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-warm-300 transition-all cursor-pointer flex justify-between items-center group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center font-black text-stone-700 group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors flex-shrink-0">
                        #{index + 1}
                      </div>
                      <Avatar src={gourmet.avatar_url} username={gourmet.username} size="sm" />
                      <div className="min-w-0">
                        <h3 className="font-bold text-stone-850 group-hover:text-primary-600 transition-colors truncate">
                          {gourmet.display_name || gourmet.username}
                        </h3>
                        <p className="text-xs text-stone-500 font-semibold mt-0.5">
                          @{gourmet.username}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-xs font-black bg-primary-50 text-primary-600 px-2.5 py-1 rounded-lg">
                        {gourmet.review_count} {gourmet.review_count === 1 ? "review" : "reviews"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
