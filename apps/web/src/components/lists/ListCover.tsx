"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Avatar } from "../ui/Avatar";
import { api } from "../../lib/api-client";
import { resolveMediaUrl } from "../../lib/media-utils";

const CITY_COVERS: Record<string, string> = {
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
  const [wikiCoverUrl, setWikiCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    if (coverUrl || cities.length === 0) return;

    const firstCity = cities[0];
    const cacheKey = `wiki_city_cover_${firstCity.toLowerCase()}`;
    const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
    if (cached) {
      setWikiCoverUrl(cached);
      return;
    }

    let isMounted = true;
    const formattedCity = firstCity.charAt(0).toUpperCase() + firstCity.slice(1);

    const fetchWikiImage = async () => {
      try {
        // 1. Try English Wikipedia summary endpoint
        let res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(formattedCity)}`);
        if (!res.ok) {
          // 2. Try Turkish Wikipedia summary endpoint if English fails
          res = await fetch(`https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(formattedCity)}`);
        }
        if (!res.ok) throw new Error("Wikipedia summary page not found");

        const data = await res.json();
        const imgUrl = data.originalimage?.source || data.thumbnail?.source;
        if (imgUrl && isMounted) {
          setWikiCoverUrl(imgUrl);
          if (typeof window !== "undefined") {
            localStorage.setItem(cacheKey, imgUrl);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch Wikipedia cover for city:", firstCity, err);
      }
    };

    fetchWikiImage();

    return () => {
      isMounted = false;
    };
  }, [coverUrl, cities]);

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

  // Find first city cover matching
  const findCoverUrl = () => {
    if (wikiCoverUrl) {
      return wikiCoverUrl;
    }

    if (cities.length === 0) return CITY_COVERS.default;
    
    const firstCity = cities[0];
    
    // Otherwise, fetch from Google Places API city-photo endpoint on backend
    const token = typeof window !== "undefined" ? api.getAccessToken() : null;
    return `${api.baseUrl}/places/city-photo?city=${encodeURIComponent(firstCity)}${token ? `&token=${token}` : ""}`;
  };
  const resolvedCoverUrl = resolveMediaUrl(coverUrl || findCoverUrl());

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
