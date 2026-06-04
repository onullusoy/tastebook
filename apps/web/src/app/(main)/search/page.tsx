"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearch } from "../../../hooks/use-search";
import { useSearchRestaurants } from "../../../hooks/use-restaurants";
import { useFollow, useUnfollow } from "../../../hooks/use-users";
import { useAuthStore } from "../../../stores/auth-store";
import { Spinner } from "../../../components/ui/Spinner";
import { Avatar } from "../../../components/ui/Avatar";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { user: currentUser } = useAuthStore();

  const followMutation = useFollow();
  const unfollowMutation = useUnfollow();

  // Debounce query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [query]);

  const { data, isLoading, isFetched } = useSearch(debouncedQuery);
  const { data: restaurants = [], isLoading: isRestaurantsLoading } = useSearchRestaurants(debouncedQuery);

  const handleFollowToggle = async (userId: string, isFollowing: boolean) => {
    if (isFollowing) {
      await unfollowMutation.mutateAsync(userId);
    } else {
      await followMutation.mutateAsync(userId);
    }
  };

  const cities = data?.cities || [];
  const users = data?.users || [];
  const loading = isLoading || isRestaurantsLoading;

  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Explore</h1>
        <p className="text-stone-500">Find cities, friends, and shared culinary memories.</p>
      </div>

      {/* Search Input Container */}
      <div className="relative w-full">
        <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-stone-400 text-lg">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for cities or people..."
          className="w-full pl-12 pr-10 py-3.5 bg-white border border-stone-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-stone-800 placeholder-stone-400 font-medium"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-stone-400 hover:text-stone-600 transition-colors font-bold"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Results Section */}
      <div className="flex flex-col gap-8">
        {loading && (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        )}

        {!loading && !debouncedQuery.trim() && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4 bg-white border border-stone-100 rounded-2xl p-8 shadow-sm">
            <span className="text-5xl mb-4">📍</span>
            <h2 className="text-lg font-bold text-stone-800">Search Tastebook</h2>
            <p className="text-stone-500 max-w-sm mt-1">
              Search for cities, restaurants, or friends by name to browse their taste diaries.
            </p>
          </div>
        )}

        {isFetched && !loading && debouncedQuery.trim() && (
          <>
            {/* Cities Section */}
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <span>📍</span> Cities ({cities.length})
              </h2>
              {cities.length === 0 ? (
                <div className="text-stone-500 text-sm italic bg-stone-50 rounded-xl p-4 border border-stone-100">
                  No matching cities found.
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                  {cities.map((city) => (
                    <Link
                      key={`${city.city}-${city.country}`}
                      href={`/city/${encodeURIComponent(city.city)}`}
                      className="flex items-center justify-between p-4 bg-white border border-stone-200 rounded-2xl hover:border-primary-400 hover:shadow-md transition-all group"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-stone-800 group-hover:text-primary-600 transition-colors truncate">
                          {city.city}
                        </span>
                        <span className="text-xs text-stone-500 truncate">{city.country}</span>
                      </div>
                      <span className="bg-primary-50 text-primary-700 text-xs font-bold px-3 py-1.5 rounded-full select-none">
                        {city.count} {city.count === 1 ? "entry" : "entries"}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Restaurants Section */}
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <span>🍽️</span> Restaurants ({restaurants.length})
              </h2>
              {restaurants.length === 0 ? (
                <div className="text-stone-500 text-sm italic bg-stone-50 rounded-xl p-4 border border-stone-100">
                  No matching restaurants found.
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                  {restaurants.map((restaurant) => (
                    <Link
                      key={restaurant.google_place_id}
                      href={`/restaurants/${restaurant.google_place_id}`}
                      className="flex items-center justify-between p-4 bg-white border border-stone-200 rounded-2xl hover:border-primary-400 hover:shadow-md transition-all group"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-stone-800 group-hover:text-primary-600 transition-colors truncate">
                          {restaurant.name}
                        </span>
                        <span className="text-xs text-stone-500 truncate">
                          {restaurant.city}, {restaurant.country}
                        </span>
                      </div>
                      {restaurant.stats && restaurant.stats.rating_count > 0 ? (
                        <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-full select-none flex items-center gap-1">
                          ⭐ {restaurant.stats.rating_avg}
                        </span>
                      ) : (
                        <span className="bg-stone-50 text-stone-500 text-xs font-bold px-3 py-1.5 rounded-full select-none">
                          New
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* People Section */}
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <span>👤</span> People ({users.length})
              </h2>
              {users.length === 0 ? (
                <div className="text-stone-500 text-sm italic bg-stone-50 rounded-xl p-4 border border-stone-100">
                  No matching people found.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
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
                        className="flex items-center justify-between p-4 bg-white border border-stone-200 rounded-2xl hover:shadow-sm transition-all"
                      >
                        <Link
                          href={`/profile/${item.id}`}
                          className="flex items-center gap-3 min-w-0 flex-1 group"
                        >
                          <Avatar
                            src={item.avatar_url}
                            username={item.username}
                            size="md"
                            className="flex-shrink-0"
                          />
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-bold text-stone-850 truncate group-hover:text-primary-600 transition-colors">
                                {item.display_name || item.username}
                              </span>
                              {friend && (
                                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-extrabold px-1.5 py-0.5 rounded">
                                  Mutual
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-stone-500 truncate">@{item.username}</span>
                          </div>
                        </Link>

                        {/* Follow Button */}
                        {!isSelf && (
                          <button
                            onClick={() => handleFollowToggle(item.id, following)}
                            disabled={mutating}
                            className={`ml-4 px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-sm ${
                              following
                                ? "bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200"
                                : "bg-primary-500 hover:bg-primary-600 text-white"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {mutating ? "..." : following ? "Unfollow" : "Follow"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
