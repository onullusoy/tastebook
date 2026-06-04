import { createDb, users, tasteEntries, follows, restaurants } from "@tastebook/db";
import { eq, and, or, sql, ilike, desc } from "drizzle-orm";
import type { UserResponse, RestaurantResponse } from "@tastebook/shared/api-types";
import { SocialService } from "../social/social.service";

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

export class SearchService {
  constructor(
    private db: ReturnType<typeof createDb>,
    private socialService: SocialService
  ) {}

  async search(userId: string, q: string) {
    if (!q || q.trim() === "") {
      return { cities: [], users: [] };
    }

    const trimmed = q.trim();
    const escaped = escapeLike(trimmed);

    // 1. Search cities
    // Find unique cities matching query where entries are public
    const matchingCities = await this.db
      .select({
        city: tasteEntries.city,
        country: tasteEntries.country,
        count: sql<number>`count(*)::int`,
      })
      .from(tasteEntries)
      .where(
        and(
          ilike(tasteEntries.city, `%${escaped}%`),
          eq(tasteEntries.visibility, "public")
        )
      )
      .groupBy(tasteEntries.city, tasteEntries.country)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    // 2. Search users matching query in username or displayName
    const matchingUsers = await this.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        or(
          ilike(users.username, `%${escaped}%`),
          ilike(users.displayName, `%${escaped}%`)
        )
      )
      .limit(10);

    // 3. Map matching users to include follow stats & relation flags using the batched mapping method in SocialService
    const userResponses = await this.socialService.mapUsersToResponses(matchingUsers as any, userId);

    return {
      cities: matchingCities,
      users: userResponses,
    };
  }

  async searchRestaurants(reqUserId: string, q: string, apiKey?: string, limit = 10): Promise<RestaurantResponse[]> {
    if (!q || q.trim() === "") {
      return [];
    }

    const trimmed = q.trim();
    const escaped = escapeLike(trimmed);

    // 1. Search local restaurants, boosted by network activity
    const localRes = await this.db
      .select({
        googlePlaceId: restaurants.googlePlaceId,
        name: restaurants.name,
        city: restaurants.city,
        country: restaurants.country,
        ratingAvg: restaurants.ratingAvg,
        ratingCount: restaurants.ratingCount,
        priceLevelAvg: restaurants.priceLevelAvg,
        atmosphereTags: restaurants.atmosphereTags,
        networkCount: sql<number>`count(distinct ${follows.followingId})::int`,
      })
      .from(restaurants)
      .leftJoin(tasteEntries, eq(tasteEntries.googlePlaceId, restaurants.googlePlaceId))
      .leftJoin(
        follows,
        and(
          eq(follows.followerId, reqUserId),
          eq(follows.followingId, tasteEntries.userId)
        )
      )
      .where(
        or(
          ilike(restaurants.name, `%${escaped}%`),
          ilike(restaurants.city, `%${escaped}%`)
        )
      )
      .groupBy(
        restaurants.googlePlaceId,
        restaurants.name,
        restaurants.city,
        restaurants.country,
        restaurants.ratingAvg,
        restaurants.ratingCount,
        restaurants.priceLevelAvg,
        restaurants.atmosphereTags
      )
      .orderBy(
        desc(sql`count(distinct ${follows.followingId})`),
        desc(restaurants.ratingAvg)
      )
      .limit(limit);

    const formattedLocal: RestaurantResponse[] = localRes.map((r) => ({
      google_place_id: r.googlePlaceId,
      name: r.name,
      city: r.city,
      country: r.country,
      is_local: true,
      stats: {
        rating_avg: Number(r.ratingAvg),
        rating_count: r.ratingCount,
        price_level_avg: Number(r.priceLevelAvg),
        dominant_tags: r.atmosphereTags || [],
      },
    }));

    let mergedResults = [...formattedLocal];

    // 2. Fetch autocomplete predictions from Google if local results limit not hit
    if (mergedResults.length < limit && apiKey) {
      const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
      url.searchParams.set("input", trimmed);
      url.searchParams.set("types", "establishment");
      url.searchParams.set("key", apiKey);

      try {
        const response = await fetch(url.toString());
        if (response.ok) {
          const data = await response.json();
          if (data.predictions) {
            for (const prediction of data.predictions) {
              if (mergedResults.some((r) => r.google_place_id === prediction.place_id)) {
                continue;
              }

              const mainText = prediction.structured_formatting.main_text;
              const secondaryText = prediction.structured_formatting.secondary_text || "";
              const parts = secondaryText.split(",").map((p: string) => p.trim());
              let country = "";
              let city = "";
              if (parts.length > 0) {
                country = parts[parts.length - 1];
              }
              if (parts.length > 1) {
                city = parts[parts.length - 2];
              }

              mergedResults.push({
                google_place_id: prediction.place_id,
                name: mainText,
                city: city,
                country: country,
                is_local: false,
                stats: null,
              });

              if (mergedResults.length >= limit) {
                break;
              }
            }
          }
        }
      } catch (err) {
        console.error("Google Autocomplete fetch failed in hybrid search service", err);
      }
    }

    return mergedResults;
  }
}
