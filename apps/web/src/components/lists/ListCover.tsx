"use client";

import React from "react";
import Link from "next/link";
import { Avatar } from "../ui/Avatar";
import { api } from "../../lib/api-client";

const CITY_COVERS: Record<string, string> = {
  istanbul: "https://picsum.photos/seed/istanbul/600/600",
  izmir: "https://picsum.photos/seed/izmir/600/600",
  ankara: "https://picsum.photos/seed/ankara/600/600",
  paris: "https://picsum.photos/seed/paris/600/600",
  london: "https://picsum.photos/seed/london/600/600",
  rome: "https://picsum.photos/seed/rome/600/600",
  tokyo: "https://picsum.photos/seed/tokyo/600/600",
  "new york": "https://picsum.photos/seed/newyork/600/600",
  default: "/placeholder-food.png",
};

interface ListCoverProps {
  title: string;
  creator?: {
    username: string;
    avatar_url?: string | null;
  };
  cities?: string[];
  aspectSquare?: boolean;
  disableCityLinks?: boolean;
  showTitle?: boolean;
  showCreator?: boolean;
  coverUrl?: string | null;
}

export function ListCover({
  title,
  creator,
  cities = [],
  aspectSquare = true,
  disableCityLinks = false,
  showTitle = true,
  showCreator = true,
  coverUrl,
}: ListCoverProps) {
  const englishLower = (str: string) => {
    return str
      .toLowerCase()
      .replace(/ı/g, "i")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/i̇/g, "i")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  // Find first city cover matching in CITY_COVERS
  const findCoverUrl = () => {
    if (cities.length === 0) return CITY_COVERS.default;
    
    // Check if the first city matches any of the hardcoded presets
    const firstCity = cities[0];
    const normalized = englishLower(firstCity);
    const matchedKey = Object.keys(CITY_COVERS).find(
      (key) => normalized.includes(key) || key.includes(normalized)
    );
    if (matchedKey) {
      return CITY_COVERS[matchedKey];
    }
    
    // Otherwise, fetch from Google Places API city-photo endpoint on backend
    const token = typeof window !== "undefined" ? api.getAccessToken() : null;
    return `${api.baseUrl}/places/city-photo?city=${encodeURIComponent(firstCity)}${token ? `&token=${token}` : ""}`;
  };
  const resolvedCoverUrl = coverUrl || findCoverUrl();

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl shadow-md border border-neutral-200/50 bg-neutral-900 group select-none ${
        aspectSquare ? "aspect-square" : "h-64 sm:h-80"
      }`}
    >
      {/* Background Image */}
      <img
        src={resolvedCoverUrl || ""}
        alt={title}
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out opacity-90"
      />

      {/* Subtle Dark Vignette Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/20" />

      {/* Content Container */}
      <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">
        {/* City Tags (Bottom-left) */}
        {cities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5 max-w-[70%] z-10">
            {cities.slice(0, 2).map((city) => (
              disableCityLinks ? (
                <span
                  key={city}
                  className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-white/15 text-white backdrop-blur-sm border border-white/10 transition-colors"
                >
                  {city}
                </span>
              ) : (
                <Link
                  key={city}
                  href={`/city/${encodeURIComponent(city)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm border border-white/10 transition-colors"
                >
                  {city}
                </Link>
              )
            ))}
            {cities.length > 2 && (
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-white/15 text-white backdrop-blur-sm border border-white/10 transition-colors">
                +{cities.length - 2}
              </span>
            )}
          </div>
        )}

        {/* List Title */}
        {showTitle && (
          <h3 className="text-white text-lg sm:text-xl font-bold tracking-tight line-clamp-2 pr-12 drop-shadow-sm">
            {title}
          </h3>
        )}

        {/* Creator Avatar & Username (Bottom-right Overlay) */}
        {showCreator && creator && (
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/15 px-2.5 py-1 rounded-full shadow-sm">
            <Avatar src={creator.avatar_url} username={creator.username} size="sm" className="!w-5 !h-5" />
            <span className="text-[11px] sm:text-xs font-medium text-white/90">
              @{creator.username}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
