import { createDb, tasteEntries, users, follows, restaurants } from "@tastebook/db";
import { eq, and, inArray, desc, sql, count, avg, aliasedTable } from "drizzle-orm";
import { ForbiddenError } from "../../shared/errors";

export class CitiesService {
  constructor(private db: ReturnType<typeof createDb>) {}

  async getCityStats(cityName: string) {
    // 1. Get total unique restaurants in the city
    const [restaurantCountResult] = await this.db
      .select({ count: count(restaurants.googlePlaceId) })
      .from(restaurants)
      .where(eq(restaurants.city, cityName));

    // 2. Get total reviews (entries) in the city
    const [reviewCountResult] = await this.db
      .select({ count: count(tasteEntries.id) })
      .from(tasteEntries)
      .where(eq(tasteEntries.city, cityName));

    // 3. Try to locate country details for flag rendering
    const firstRestaurant = await this.db.query.restaurants.findFirst({
      where: eq(restaurants.city, cityName),
    });

    return {
      total_restaurants: restaurantCountResult?.count ?? 0,
      total_reviews: reviewCountResult?.count ?? 0,
      country: firstRestaurant?.country ?? "",
      country_code: firstRestaurant?.countryCode ?? "",
    };
  }

  async getTopRestaurants(cityName: string, sortBy: "popularity" | "rating") {
    const query = this.db
      .select({
        google_place_id: restaurants.googlePlaceId,
        name: restaurants.name,
        city: restaurants.city,
        country: restaurants.country,
        country_code: restaurants.countryCode,
        rating_avg: avg(tasteEntries.rating),
        review_count: count(tasteEntries.id),
      })
      .from(restaurants)
      .innerJoin(tasteEntries, eq(restaurants.googlePlaceId, tasteEntries.googlePlaceId))
      .where(eq(restaurants.city, cityName))
      .groupBy(
        restaurants.googlePlaceId,
        restaurants.name,
        restaurants.city,
        restaurants.country,
        restaurants.countryCode
      );

    if (sortBy === "rating") {
      query.orderBy(desc(avg(tasteEntries.rating)), desc(count(tasteEntries.id)));
    } else {
      query.orderBy(desc(count(tasteEntries.id)), desc(avg(tasteEntries.rating)));
    }

    const results = await query.limit(10);

    return results.map(row => ({
      ...row,
      rating_avg: row.rating_avg ? Number(row.rating_avg).toFixed(1) : "0.0",
    }));
  }

  async getTopGourmets(cityName: string, requesterId: string | undefined, scope: "public" | "friends") {
    if (scope === "friends") {
      if (!requesterId) {
        throw new ForbiddenError("Authentication is required to view friends ranking.");
      }

      const f1 = aliasedTable(follows, "f1");
      const f2 = aliasedTable(follows, "f2");

      const results = await this.db
        .select({
          id: users.id,
          username: users.username,
          display_name: users.displayName,
          avatar_url: users.avatarUrl,
          review_count: count(tasteEntries.id),
        })
        .from(users)
        .innerJoin(tasteEntries, eq(users.id, tasteEntries.userId))
        .innerJoin(f1, and(eq(f1.followerId, requesterId), eq(f1.followingId, users.id)))
        .innerJoin(f2, and(eq(f2.followingId, requesterId), eq(f2.followerId, users.id)))
        .where(
          and(
            eq(tasteEntries.city, cityName),
            inArray(tasteEntries.visibility, ["public", "friends"])
          )
        )
        .groupBy(users.id, users.username, users.displayName, users.avatarUrl)
        .orderBy(desc(count(tasteEntries.id)))
        .limit(10);

      return results;
    }

    // Public scope
    const results = await this.db
      .select({
        id: users.id,
        username: users.username,
        display_name: users.displayName,
        avatar_url: users.avatarUrl,
        review_count: count(tasteEntries.id),
      })
      .from(users)
      .innerJoin(tasteEntries, eq(users.id, tasteEntries.userId))
      .where(
        and(
          eq(tasteEntries.city, cityName),
          inArray(tasteEntries.visibility, ["public", "friends"])
        )
      )
      .groupBy(users.id, users.username, users.displayName, users.avatarUrl)
      .orderBy(desc(count(tasteEntries.id)))
      .limit(10);

    return results;
  }
}
