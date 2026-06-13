import { createDb, tasteEntries, users, follows, entryMedia, foodItems, lists, listItems, listCollaborators, restaurants, entryLikes, entryComments, commentLikes, listLikes } from "@tastebook/db";
import { eq, and, or, inArray, desc, lt, sql, ne } from "drizzle-orm";
import { NotFoundError, ForbiddenError, ValidationError } from "../../shared/errors";
import type { CreateEntryRequest, UpdateEntryRequest } from "@tastebook/shared/schemas/entries";
import type { EntryResponse, PaginatedResponse } from "@tastebook/shared/api-types";
import { MediaService } from "../media/media.service";
import { encodeCursor, decodeCursor } from "../../shared/utils/cursor";
import { recalculateUserGP } from "../../shared/utils/gourme-points";
import crypto from "crypto";

export class EntriesService {
  constructor(
    private db: ReturnType<typeof createDb>,
    private mediaService: MediaService,
    private apiKey?: string
  ) {}

  private parseAddressComponents(components: any[]): { city: string; country: string; countryCode: string } {
    let city = "";
    let country = "";
    let countryCode = "";

    for (const comp of components) {
      if (comp.types.includes("locality")) {
        city = comp.long_name;
      } else if (!city && comp.types.includes("administrative_area_level_2")) {
        city = comp.long_name;
      } else if (!city && comp.types.includes("administrative_area_level_1")) {
        city = comp.long_name;
      }
      
      if (comp.types.includes("country")) {
        country = comp.long_name;
        countryCode = comp.short_name || "";
      }
    }

    return { city: city || "Unknown", country: country || "Unknown", countryCode };
  }

  /**
   * Compute a simple string similarity ratio in range [0,1] using longest common subsequence length.
   * This is used only for the Google Places Text Search verification step to avoid extra dependencies.
   */
  private strSimilarity(a: string, b: string): number {
    const s1 = a.toLowerCase().trim();
    const s2 = b.toLowerCase().trim();
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;
    // Count matching characters (Dice's coefficient over bigrams for reasonable accuracy)
    const getBigrams = (str: string): Map<string, number> => {
      const bigrams = new Map<string, number>();
      for (let i = 0; i < str.length - 1; i++) {
        const bigram = str.slice(i, i + 2);
        bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
      }
      return bigrams;
    };
    const bigrams1 = getBigrams(s1);
    const bigrams2 = getBigrams(s2);
    let intersection = 0;
    for (const [bigram, count] of bigrams1) {
      const count2 = bigrams2.get(bigram) ?? 0;
      intersection += Math.min(count, count2);
    }
    return (2 * intersection) / (s1.length + s2.length - 2);
  }

  /**
   * Fault-tolerant restaurant resolution with three layers:
   *  1. Fuzzy DB lookup (pg_trgm similarity >= 0.80, same city)
   *  2. Google Places Text Search fallback (if API key available)
   *  3. Graceful synthetic record creation
   *
   * Always returns a non-null googlePlaceId so entries can be properly linked.
   */
  private async fuzzyResolveRestaurant(params: {
    restaurantName: string;
    city: string;
    country: string;
    formattedAddress: string | null;
  }): Promise<{
    googlePlaceId: string;
    restaurantName: string;
    city: string;
    country: string;
    countryCode: string;
    formattedAddress: string | null;
  }> {
    const { restaurantName, city, country } = params;
    let { formattedAddress } = params;
    const SIMILARITY_THRESHOLD = 0.80;

    // ─── Layer 0: Exact case-insensitive name + city lookup ───────────────
    // Works without pg_trgm — handles the common case where the same name is
    // submitted again (e.g. autocomplete skipped, same restaurant re-entered).
    try {
      const exactMatch = await this.db.query.restaurants.findFirst({
        where: (r, { and: $and, sql: $sql }) =>
          $and(
            $sql`lower(${r.name}) = lower(${restaurantName})`,
            $sql`lower(${r.city}) = lower(${city})`
          ),
      });

      if (exactMatch) {
        console.info(
          `[FuzzyResolve] Exact match found: "${exactMatch.name}" in ${exactMatch.city}`
        );
        return {
          googlePlaceId: exactMatch.googlePlaceId,
          restaurantName: exactMatch.name,
          city: exactMatch.city,
          country: exactMatch.country,
          countryCode: exactMatch.countryCode,
          formattedAddress,
        };
      }
    } catch (err) {
      console.warn("[FuzzyResolve] Exact lookup failed, skipping:", (err as Error).message);
    }

    // ─── Layer 1: Fuzzy DB lookup via pg_trgm ───────────────────────────
    try {
      const [fuzzyMatch] = await this.db.execute<{
        google_place_id: string;
        name: string;
        city: string;
        country: string;
        country_code: string;
        sim: number;
      }>(
        sql`SELECT google_place_id, name, city, country, country_code,
               similarity(name, ${restaurantName}) AS sim
            FROM restaurants
            WHERE lower(city) = lower(${city})
              AND similarity(name, ${restaurantName}) >= ${SIMILARITY_THRESHOLD}
            ORDER BY sim DESC
            LIMIT 1`
      );

      if (fuzzyMatch) {
        console.info(
          `[FuzzyResolve] DB match found: "${fuzzyMatch.name}" (sim=${fuzzyMatch.sim.toFixed(3)}) for input "${restaurantName}" in ${city}`
        );
        return {
          googlePlaceId: fuzzyMatch.google_place_id,
          restaurantName: fuzzyMatch.name,
          city: fuzzyMatch.city,
          country: fuzzyMatch.country,
          countryCode: fuzzyMatch.country_code,
          formattedAddress,
        };
      }
    } catch (err) {
      // pg_trgm extension may not exist in test environment — fall through gracefully
      console.warn("[FuzzyResolve] pg_trgm lookup failed (extension missing?), skipping:", (err as Error).message);
    }


    // ─── Layer 2: Google Places Text Search fallback ─────────────────────
    if (this.apiKey) {
      try {
        const textSearchUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
        textSearchUrl.searchParams.set("query", `${restaurantName} ${city}`);
        textSearchUrl.searchParams.set("type", "restaurant");
        textSearchUrl.searchParams.set("key", this.apiKey);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5-second timeout
        try {
          const res = await fetch(textSearchUrl.toString(), { signal: controller.signal });
          clearTimeout(timeout);

          if (res.ok) {
            const data = (await res.json()) as any;
            if (data.status === "OK" && data.results?.length > 0) {
              const candidate = data.results[0];
              const candidateName: string = candidate.name ?? "";
              const nameSim = this.strSimilarity(restaurantName, candidateName);

              if (nameSim >= SIMILARITY_THRESHOLD) {
                const placeId: string = candidate.place_id;
                let resolvedCity = city;
                let resolvedCountry = country;
                let resolvedCountryCode = "";
                let resolvedAddress = formattedAddress ?? (candidate.formatted_address ?? null);

                // Parse address components from text search result if available
                if (candidate.address_components) {
                  const parsed = this.parseAddressComponents(candidate.address_components);
                  resolvedCity = parsed.city || city;
                  resolvedCountry = parsed.country || country;
                  resolvedCountryCode = parsed.countryCode;
                }

                // ── City guard: respect the user's explicit city choice ──────────
                // If the Google Places result is in a completely different city than
                // what the user typed, we must NOT link them — they are different
                // restaurants sharing a name in different locations.
                // E.g. "Johns Burger" in Sivas ≠ "Johns Burger" in Kiel.
                const citySim = this.strSimilarity(city, resolvedCity);
                if (citySim < 0.50) {
                  console.info(
                    `[FuzzyResolve] Google Places city mismatch: user said "${city}", result is "${resolvedCity}" (citySim=${citySim.toFixed(3)}). Skipping.`
                  );
                  // Fall through to Layer 3 — create a fresh record with the user's exact data
                } else {
                  console.info(
                    `[FuzzyResolve] Google Places match: "${candidateName}" (nameSim=${nameSim.toFixed(3)}, citySim=${citySim.toFixed(3)}) → ${placeId}`
                  );

                  // Upsert into restaurants table
                  await this.db
                    .insert(restaurants)
                    .values({
                      googlePlaceId: placeId,
                      name: candidateName,
                      city: resolvedCity,
                      country: resolvedCountry,
                      countryCode: resolvedCountryCode,
                      ratingAvg: "0.0",
                      ratingCount: 0,
                      priceLevelAvg: "0.0",
                      atmosphereTags: [],
                    })
                    .onConflictDoNothing();

                  return {
                    googlePlaceId: placeId,
                    restaurantName: candidateName,
                    city: resolvedCity,
                    country: resolvedCountry,
                    countryCode: resolvedCountryCode,
                    formattedAddress: resolvedAddress,
                  };
                }
              } else {
                console.info(
                  `[FuzzyResolve] Google Places candidate "${candidateName}" below name threshold (nameSim=${nameSim.toFixed(3)}), falling back.`
                );
              }
            }

          }
        } catch (fetchErr: any) {
          if (fetchErr.name === "AbortError") {
            console.warn("[FuzzyResolve] Google Places Text Search timed out.");
          } else {
            throw fetchErr;
          }
        }
      } catch (err) {
        console.error("[FuzzyResolve] Google Places Text Search failed, falling back:", (err as Error).message);
      }
    }

    // ─── Layer 3: Graceful fallback — create a synthetic canonical record ─
    const syntheticId = `tastebook-manual-${crypto.randomUUID()}`;
    console.info(
      `[FuzzyResolve] No confident match found for "${restaurantName}" in ${city}. Creating synthetic record: ${syntheticId}`
    );

    await this.db
      .insert(restaurants)
      .values({
        googlePlaceId: syntheticId,
        name: restaurantName,
        city,
        country,
        countryCode: "",
        ratingAvg: "0.0",
        ratingCount: 0,
        priceLevelAvg: "0.0",
        atmosphereTags: [],
      })
      .onConflictDoNothing();

    return {
      googlePlaceId: syntheticId,
      restaurantName,
      city,
      country,
      countryCode: "",
      formattedAddress,
    };
  }

  private async fetchEntryResponse(entryId: string, viewerId?: string): Promise<EntryResponse> {
    const rows = await this.db
      .select({
        entry: tasteEntries,
        user: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(tasteEntries)
      .innerJoin(users, eq(tasteEntries.userId, users.id))
      .where(eq(tasteEntries.id, entryId));

    if (rows.length === 0) {
      throw new NotFoundError("Entry not found");
    }

    const firstRow = rows[0];
    const entry = firstRow.entry;
    const user = firstRow.user;

    // Fetch food items
    const foodItemRows = await this.db
      .select()
      .from(foodItems)
      .where(eq(foodItems.entryId, entryId))
      .orderBy(foodItems.orderIndex);

    // Fetch media
    const mediaRows = await this.db
      .select()
      .from(entryMedia)
      .where(eq(entryMedia.entryId, entryId))
      .orderBy(entryMedia.orderIndex);

    const mediaList = mediaRows.map(m => ({
      id: m.id,
      url: this.mediaService.getMediaUrl(m.url),
      thumbnail_url: this.mediaService.getThumbnailUrl(m.url),
      mime_type: m.mimeType ?? "",
      order_index: m.orderIndex,
    }));

    const foodItemList = foodItemRows.map(fi => ({
      id: fi.id,
      name: fi.name,
      notes: fi.notes,
      order_index: fi.orderIndex,
    }));

    // Resolve likes count and liked status based on whether it is a list post
    let likesCount = entry.likesCount;
    let isLiked = false;

    if (entry.listId) {
      const [listLikesCountResult] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(listLikes)
        .where(eq(listLikes.listId, entry.listId));
      likesCount = listLikesCountResult?.count ?? 0;

      if (viewerId) {
        const likeRecord = await this.db.query.listLikes.findFirst({
          where: and(
            eq(listLikes.listId, entry.listId),
            eq(listLikes.userId, viewerId)
          )
        });
        isLiked = !!likeRecord;
      }
    } else {
      if (viewerId) {
        const likeRecord = await this.db.query.entryLikes.findFirst({
          where: and(
            eq(entryLikes.entryId, entry.id),
            eq(entryLikes.userId, viewerId)
          )
        });
        isLiked = !!likeRecord;
      }
    }

    let itemCount = 0;
    if (entry.listId) {
      const [listItemsCountResult] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(listItems)
        .where(eq(listItems.listId, entry.listId));
      itemCount = listItemsCountResult?.count ?? 0;
    }

    return {
      id: entry.id,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
      },
      restaurant_name: entry.restaurantName,
      city: entry.city,
      country: entry.country,
      google_place_id: entry.googlePlaceId,
      formatted_address: entry.formattedAddress,
      atmosphere_tags: entry.atmosphereTags ?? [],
      price_level: entry.priceLevel,
      rating: entry.rating,
      rating_ambience: entry.ratingAmbience,
      rating_taste: entry.ratingTaste,
      rating_service: entry.ratingService,
      rating_value: entry.ratingValue,
      food_items: foodItemList,
      notes: entry.notes,
      visibility: entry.visibility as "public" | "friends" | "private",
      media: mediaList,
      list_id: entry.listId,
      likes_count: likesCount,
      comments_count: entry.commentsCount,
      is_liked: isLiked,
      metadata: entry.metadata ? {
        ...entry.metadata,
        item_count: itemCount,
      } : null,
      created_at: entry.createdAt.toISOString(),
    };
  }

  private async checkIsFriend(viewerId: string, ownerId: string): Promise<boolean> {
    const friendCheck = await this.db.query.follows.findMany({
      where: and(
        or(
          and(eq(follows.followerId, viewerId), eq(follows.followingId, ownerId)),
          and(eq(follows.followerId, ownerId), eq(follows.followingId, viewerId))
        )
      )
    });
    return friendCheck.length === 2;
  }

  /**
   * Verify that a user can associate an entry with a given list.
   * They must be the owner or a collaborator.
   */
  private async verifyListAccess(listId: string, userId: string): Promise<void> {
    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });

    if (!list) {
      throw new NotFoundError("List not found");
    }

    if (list.userId === userId) return; // owner

    const collab = await this.db.query.listCollaborators.findFirst({
      where: and(
        eq(listCollaborators.listId, listId),
        eq(listCollaborators.userId, userId)
      ),
    });

    if (!collab) {
      throw new ForbiddenError("You are not a contributor of this list.");
    }
  }

  async create(userId: string, data: CreateEntryRequest): Promise<EntryResponse> {
    const mediaIds = data.media_ids ?? [];
    if (mediaIds.length > 5) {
      throw new ValidationError("Maximum 5 media files allowed per entry.");
    }

    // Verify list access if list_id provided
    if (data.list_id) {
      await this.verifyListAccess(data.list_id, userId);
    }

    let restaurantName = data.restaurant_name;
    let city = data.city;
    let country = data.country;
    let countryCode = "";
    let formattedAddress = data.formatted_address ?? null;
    let resolvedGooglePlaceId: string | null = data.google_place_id ?? null;

    if (data.google_place_id) {
      // 1. Check database cache first in restaurants table
      const existingRestaurant = await this.db.query.restaurants.findFirst({
        where: eq(restaurants.googlePlaceId, data.google_place_id),
      });

      if (existingRestaurant) {
        restaurantName = existingRestaurant.name;
        city = existingRestaurant.city;
        country = existingRestaurant.country;
      } else {
        if (this.apiKey) {
          // 2. Fetch from Google Places details API
          try {
            const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
            url.searchParams.set("place_id", data.google_place_id);
            url.searchParams.set("fields", "name,address_components,formatted_address");
            url.searchParams.set("key", this.apiKey);
            if (data.session_token) {
              url.searchParams.set("sessiontoken", data.session_token);
            }

            const res = await fetch(url.toString());
            if (res.ok) {
              const resData = (await res.json()) as any;
              if (resData.status === "OK" && resData.result) {
                const result = resData.result;
                restaurantName = result.name || restaurantName;
                formattedAddress = result.formatted_address || formattedAddress;
                
                if (result.address_components) {
                  const parsed = this.parseAddressComponents(result.address_components);
                  city = parsed.city;
                  country = parsed.country;
                  countryCode = parsed.countryCode;
                }
              }
            }
          } catch (err) {
            console.error("Failed to fetch Google Place Details:", err);
          }
        }

        // Initialize the restaurant record in the table first so the foreign key doesn't fail
        await this.db
          .insert(restaurants)
          .values({
            googlePlaceId: data.google_place_id,
            name: restaurantName,
            city,
            country,
            countryCode,
            ratingAvg: "0.0",
            ratingCount: 0,
            priceLevelAvg: "0.0",
            atmosphereTags: [],
          })
          .onConflictDoNothing();
      }
    } else {
      // No google_place_id provided — run fault-tolerant fuzzy matching pipeline
      const resolved = await this.fuzzyResolveRestaurant({
        restaurantName,
        city,
        country,
        formattedAddress,
      });
      resolvedGooglePlaceId = resolved.googlePlaceId;
      restaurantName = resolved.restaurantName;
      city = resolved.city;
      country = resolved.country;
      countryCode = resolved.countryCode;
      formattedAddress = resolved.formattedAddress;
    }

    const [newEntry] = await this.db
      .insert(tasteEntries)
      .values({
        userId,
        restaurantName,
        city,
        country,
        googlePlaceId: resolvedGooglePlaceId,
        formattedAddress,
        atmosphereTags: data.atmosphere_tags ?? [],
        priceLevel: data.price_level,
        rating: data.rating,
        ratingAmbience: data.rating_ambience ?? null,
        ratingTaste: data.rating_taste ?? null,
        ratingService: data.rating_service ?? null,
        ratingValue: data.rating_value ?? null,
        notes: data.notes ?? null,
        visibility: data.visibility ?? "public",
        listId: data.list_id ?? null,
        metadata: data.metadata ?? {},
      })
      .returning();

    // Insert food items
    if (data.food_items.length > 0) {
      await this.db.insert(foodItems).values(
        data.food_items.map((item, idx) => ({
          entryId: newEntry.id,
          name: item.name,
          notes: item.notes ?? null,
          orderIndex: idx,
        }))
      );
    }

    // Attach media
    if (mediaIds.length > 0) {
      await this.mediaService.attachMediaToEntry(mediaIds, newEntry.id, userId);
    }

    // Auto-add to list if list_id provided
    if (data.list_id) {
      if (!newEntry.googlePlaceId) {
        throw new ValidationError("Cannot add to list: entry must be associated with a restaurant.");
      }

      // Check if this restaurant is already in the list to avoid unique constraint violations
      const existingItem = await this.db.query.listItems.findFirst({
        where: and(
          eq(listItems.listId, data.list_id),
          eq(listItems.restaurantId, newEntry.googlePlaceId)
        ),
      });

      if (!existingItem) {
        const [maxOrderResult] = await this.db
          .select({ maxOrder: sql<number>`COALESCE(max(order_index), -1)::int` })
          .from(listItems)
          .where(eq(listItems.listId, data.list_id));
        const nextOrder = (maxOrderResult?.maxOrder ?? -1) + 1;

        await this.db.insert(listItems).values({
          listId: data.list_id,
          restaurantId: newEntry.googlePlaceId,
          orderIndex: nextOrder,
        });
      }
    }

    if (newEntry.googlePlaceId) {
      await this.recalculateRestaurantStats(newEntry.googlePlaceId);
    }

    await recalculateUserGP(this.db, userId);

    return this.fetchEntryResponse(newEntry.id, userId);
  }

  async getById(entryId: string, viewerId?: string): Promise<EntryResponse> {
    const response = await this.fetchEntryResponse(entryId, viewerId);

    if (response.visibility === "private") {
      if (viewerId !== response.user.id) {
        throw new NotFoundError("Entry not found");
      }
    } else if (response.visibility === "friends") {
      if (viewerId !== response.user.id) {
        if (!viewerId) {
          throw new NotFoundError("Entry not found");
        }
        const isFriend = await this.checkIsFriend(viewerId, response.user.id);
        if (!isFriend) {
          throw new NotFoundError("Entry not found");
        }
      }
    }

    return response;
  }

  async update(entryId: string, userId: string, data: UpdateEntryRequest): Promise<EntryResponse> {
    const entry = await this.db.query.tasteEntries.findFirst({
      where: eq(tasteEntries.id, entryId),
    });

    if (!entry) {
      throw new NotFoundError("Entry not found");
    }

    // Verify visibility first to prevent existence leaks
    await this.getById(entryId, userId);

    const oldGooglePlaceId = entry.googlePlaceId;

    if (entry.userId !== userId) {
      throw new ForbiddenError("You do not own this entry.");
    }

    const updateData: Partial<typeof tasteEntries.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.google_place_id !== undefined) {
      if (data.google_place_id === null) {
        updateData.googlePlaceId = null;
      } else {
        // Find or create restaurant
        const existingRestaurant = await this.db.query.restaurants.findFirst({
          where: eq(restaurants.googlePlaceId, data.google_place_id),
        });

        if (!existingRestaurant) {
          let restaurantName = data.restaurant_name ?? entry.restaurantName;
          let city = data.city ?? entry.city;
          let country = data.country ?? entry.country;
          let countryCode = "US"; // default fallback
          let formattedAddress = data.formatted_address ?? entry.formattedAddress ?? undefined;

          if (this.apiKey) {
            try {
              const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
              url.searchParams.set("place_id", data.google_place_id);
              url.searchParams.set("fields", "name,address_components,formatted_address");
              url.searchParams.set("key", this.apiKey);

              const res = await fetch(url.toString());
              if (res.ok) {
                const resData = (await res.json()) as any;
                if (resData.status === "OK" && resData.result) {
                  const result = resData.result;
                  restaurantName = result.name || restaurantName;
                  formattedAddress = result.formatted_address || formattedAddress;
                  
                  if (result.address_components) {
                    const parsed = this.parseAddressComponents(result.address_components);
                    city = parsed.city;
                    country = parsed.country;
                    countryCode = parsed.countryCode;
                  }
                }
              }
            } catch (err) {
              console.error("Failed to fetch Google Place Details during update:", err);
            }
          }

          // Initialize the restaurant record in the table first so the foreign key doesn't fail
          await this.db
            .insert(restaurants)
            .values({
              googlePlaceId: data.google_place_id,
              name: restaurantName,
              city,
              country,
              countryCode,
              ratingAvg: "0.0",
              ratingCount: 0,
              priceLevelAvg: "0.0",
              atmosphereTags: [],
            })
            .onConflictDoNothing();

          if (data.restaurant_name === undefined) {
            updateData.restaurantName = restaurantName;
          }
          if (data.city === undefined) {
            updateData.city = city;
          }
          if (data.country === undefined) {
            updateData.country = country;
          }
          if (data.formatted_address === undefined && formattedAddress !== undefined) {
            updateData.formattedAddress = formattedAddress;
          }
        }
        updateData.googlePlaceId = data.google_place_id;
      }
    }

    if (data.restaurant_name !== undefined) updateData.restaurantName = data.restaurant_name;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.formatted_address !== undefined) updateData.formattedAddress = data.formatted_address;
    if (data.atmosphere_tags !== undefined) updateData.atmosphereTags = data.atmosphere_tags;
    if (data.price_level !== undefined) updateData.priceLevel = data.price_level;
    if (data.rating !== undefined) updateData.rating = data.rating;
    if (data.rating_ambience !== undefined) updateData.ratingAmbience = data.rating_ambience;
    if (data.rating_taste !== undefined) updateData.ratingTaste = data.rating_taste;
    if (data.rating_service !== undefined) updateData.ratingService = data.rating_service;
    if (data.rating_value !== undefined) updateData.ratingValue = data.rating_value;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;
    if (data.list_id !== undefined) {
      await this.verifyListAccess(data.list_id, userId);
      updateData.listId = data.list_id;
    }

    await this.db
      .update(tasteEntries)
      .set(updateData)
      .where(eq(tasteEntries.id, entryId));

    // Replace food items if provided (full replacement strategy)
    if (data.food_items !== undefined) {
      await this.db.delete(foodItems).where(eq(foodItems.entryId, entryId));
      if (data.food_items.length > 0) {
        await this.db.insert(foodItems).values(
          data.food_items.map((item, idx) => ({
            entryId,
            name: item.name,
            notes: item.notes ?? null,
            orderIndex: idx,
          }))
        );
      }
    }

    const updatedResponse = await this.fetchEntryResponse(entryId, userId);

    if (updatedResponse.google_place_id) {
      await this.recalculateRestaurantStats(updatedResponse.google_place_id);
    }
    if (oldGooglePlaceId && oldGooglePlaceId !== updatedResponse.google_place_id) {
      await this.recalculateRestaurantStats(oldGooglePlaceId);
    }

    await recalculateUserGP(this.db, userId);

    return updatedResponse;
  }

  async delete(entryId: string, userId: string): Promise<void> {
    const entry = await this.db.query.tasteEntries.findFirst({
      where: eq(tasteEntries.id, entryId),
    });

    if (!entry) {
      throw new NotFoundError("Entry not found");
    }

    // Verify visibility first to prevent existence leaks
    await this.getById(entryId, userId);

    if (entry.userId !== userId) {
      throw new ForbiddenError("You do not own this entry.");
    }

    await this.mediaService.deleteMediaByEntryId(entryId, userId);

    // food_items will cascade-delete via FK
    await this.db
      .delete(tasteEntries)
      .where(eq(tasteEntries.id, entryId));

    if (entry.googlePlaceId) {
      await this.recalculateRestaurantStats(entry.googlePlaceId);
    }

    await recalculateUserGP(this.db, userId);
  }

  /**
   * Build an EntryResponse[] from raw entry rows.
   * Batch-fetches users, media, and food items for efficiency.
   */
  private async buildEntryResponses(
    entries: (typeof tasteEntries.$inferSelect)[],
    viewerId?: string
  ): Promise<EntryResponse[]> {
    if (entries.length === 0) return [];

    const entryIds = entries.map(e => e.id);
    const userIds = Array.from(new Set(entries.map(e => e.userId)));

    // Batch fetch users
    const userRecords = await this.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(inArray(users.id, userIds));
    const userMap = new Map(userRecords.map(u => [u.id, u]));

    // Batch fetch media
    const allMedia = await this.db
      .select()
      .from(entryMedia)
      .where(inArray(entryMedia.entryId, entryIds))
      .orderBy(entryMedia.orderIndex);

    // Batch fetch food items
    const allFoodItems = await this.db
      .select()
      .from(foodItems)
      .where(inArray(foodItems.entryId, entryIds))
      .orderBy(foodItems.orderIndex);

    // Batch fetch likes for the viewer
    const likedEntryIds = new Set<string>();
    if (viewerId) {
      const likes = await this.db
        .select({ entryId: entryLikes.entryId })
        .from(entryLikes)
        .where(
          and(
            eq(entryLikes.userId, viewerId),
            inArray(entryLikes.entryId, entryIds)
          )
        );
      likes.forEach(l => likedEntryIds.add(l.entryId));
    }

    const listIds = entries.map(e => e.listId).filter(Boolean) as string[];

    // Batch fetch list likes counts
    const listLikesCounts = new Map<string, number>();
    if (listIds.length > 0) {
      const counts = await this.db
        .select({ listId: listLikes.listId, count: sql<number>`count(*)::int` })
        .from(listLikes)
        .where(inArray(listLikes.listId, listIds))
        .groupBy(listLikes.listId);
      counts.forEach(c => listLikesCounts.set(c.listId, c.count));
    }

    // Batch fetch list likes for the viewer
    const likedListIds = new Set<string>();
    if (viewerId && listIds.length > 0) {
      const likes = await this.db
        .select({ listId: listLikes.listId })
        .from(listLikes)
        .where(
          and(
            eq(listLikes.userId, viewerId),
            inArray(listLikes.listId, listIds)
          )
        );
      likes.forEach(l => likedListIds.add(l.listId));
    }

    // Batch fetch list items counts
    const listItemsCounts = new Map<string, number>();
    if (listIds.length > 0) {
      const counts = await this.db
        .select({ listId: listItems.listId, count: sql<number>`count(*)::int` })
        .from(listItems)
        .where(inArray(listItems.listId, listIds))
        .groupBy(listItems.listId);
      counts.forEach(c => listItemsCounts.set(c.listId, c.count));
    }

    return entries.map(entry => {
      const userRecord = userMap.get(entry.userId);
      const mappedUser = {
        id: userRecord?.id ?? "",
        username: userRecord?.username ?? "",
        display_name: userRecord?.displayName ?? null,
        avatar_url: userRecord?.avatarUrl ?? null,
      };

      const mediaList = allMedia
        .filter(m => m.entryId === entry.id)
        .map(m => ({
          id: m.id,
          url: this.mediaService.getMediaUrl(m.url),
          thumbnail_url: this.mediaService.getThumbnailUrl(m.url),
          mime_type: m.mimeType ?? "",
          order_index: m.orderIndex,
        }));

      const foodItemList = allFoodItems
        .filter(fi => fi.entryId === entry.id)
        .map(fi => ({
          id: fi.id,
          name: fi.name,
          notes: fi.notes,
          order_index: fi.orderIndex,
        }));

      return {
        id: entry.id,
        user: mappedUser,
        restaurant_name: entry.restaurantName,
        city: entry.city,
        country: entry.country,
        google_place_id: entry.googlePlaceId,
        formatted_address: entry.formattedAddress,
        atmosphere_tags: entry.atmosphereTags ?? [],
        price_level: entry.priceLevel,
        rating: entry.rating,
        rating_ambience: entry.ratingAmbience,
        rating_taste: entry.ratingTaste,
        rating_service: entry.ratingService,
        rating_value: entry.ratingValue,
        food_items: foodItemList,
        notes: entry.notes || null,
        visibility: entry.visibility as "public" | "friends" | "private",
        media: mediaList,
        list_id: entry.listId,
        likes_count: entry.listId ? (listLikesCounts.get(entry.listId) ?? 0) : entry.likesCount,
        comments_count: entry.commentsCount,
        is_liked: entry.listId ? likedListIds.has(entry.listId) : likedEntryIds.has(entry.id),
        metadata: entry.metadata ? {
          ...entry.metadata,
          item_count: entry.listId ? (listItemsCounts.get(entry.listId) ?? 0) : 0,
        } : null,
        created_at: entry.createdAt.toISOString(),
      };
    });
  }

  async listByUser(
    targetUserId: string,
    viewerId: string | undefined,
    cursor?: string,
    limit = 20
  ): Promise<PaginatedResponse<EntryResponse>> {
    let visibilities: string[] = ["public"];
    if (viewerId) {
      if (viewerId === targetUserId) {
        visibilities = ["public", "friends", "private"];
      } else {
        const isFriend = await this.checkIsFriend(viewerId, targetUserId);
        if (isFriend) {
          visibilities = ["public", "friends"];
        }
      }
    }

    let cursorCondition;
    if (cursor) {
      const { timestamp: cursorTs, id: cursorId } = decodeCursor(cursor);
      cursorCondition = or(
        lt(tasteEntries.createdAt, new Date(cursorTs)),
        and(
          eq(tasteEntries.createdAt, new Date(cursorTs)),
          lt(tasteEntries.id, cursorId)
        )
      );
    }

    const conditions = [
      eq(tasteEntries.userId, targetUserId),
      inArray(tasteEntries.visibility, visibilities),
    ];
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const entries = await this.db
      .select()
      .from(tasteEntries)
      .where(and(...conditions))
      .orderBy(desc(tasteEntries.createdAt), desc(tasteEntries.id))
      .limit(limit + 1);

    const hasNextPage = entries.length > limit;
    const itemsToReturn = hasNextPage ? entries.slice(0, limit) : entries;

    const data = await this.buildEntryResponses(itemsToReturn, viewerId);

    let nextCursor: string | undefined;
    if (hasNextPage && itemsToReturn.length > 0) {
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    return {
      data,
      cursor: nextCursor,
    };
  }

  private async recalculateRestaurantStats(googlePlaceId: string): Promise<void> {
    const [stats] = await this.db
      .select({
        ratingAvg: sql<string>`COALESCE(AVG(${tasteEntries.rating}), 0)::numeric(3,1)`,
        ratingCount: sql<number>`COUNT(*)::int`,
        priceLevelAvg: sql<string>`COALESCE(AVG(${tasteEntries.priceLevel}), 0)::numeric(3,1)`,
      })
      .from(tasteEntries)
      .where(eq(tasteEntries.googlePlaceId, googlePlaceId));

    if (!stats || stats.ratingCount === 0) {
      await this.db
        .update(restaurants)
        .set({
          ratingAvg: "0.0",
          ratingCount: 0,
          priceLevelAvg: "0.0",
          atmosphereTags: [],
        })
        .where(eq(restaurants.googlePlaceId, googlePlaceId));
      return;
    }

    const tagRows = await this.db
      .select({
        atmosphereTags: tasteEntries.atmosphereTags,
      })
      .from(tasteEntries)
      .where(
        and(
          eq(tasteEntries.googlePlaceId, googlePlaceId),
          sql`cardinality(${tasteEntries.atmosphereTags}) > 0`
        )
      );

    const tagCounts: Record<string, number> = {};
    for (const row of tagRows) {
      if (row.atmosphereTags) {
        for (const tag of row.atmosphereTags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }

    const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map((entry) => entry[0])
      .slice(0, 5);

    await this.db
      .update(restaurants)
      .set({
        ratingAvg: stats.ratingAvg.toString(),
        ratingCount: stats.ratingCount,
        priceLevelAvg: stats.priceLevelAvg.toString(),
        atmosphereTags: sortedTags,
        updatedAt: new Date(),
      })
      .where(eq(restaurants.googlePlaceId, googlePlaceId));
  }

  async getSegmentedEntriesForRestaurant(placeId: string, reqUserId: string) {
    const followingRows = await this.db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, reqUserId));
    const followingIds = followingRows.map((r) => r.id);

    const followerRows = await this.db
      .select({ id: follows.followerId })
      .from(follows)
      .where(eq(follows.followingId, reqUserId));
    const followerIds = followerRows.map((r) => r.id);

    const allEntries = await this.db
      .select()
      .from(tasteEntries)
      .where(eq(tasteEntries.googlePlaceId, placeId))
      .orderBy(desc(tasteEntries.createdAt));

    const allResponses = await this.buildEntryResponses(allEntries, reqUserId);

    const my_entries = allResponses.filter((r) => r.user.id === reqUserId);

    const network_entries = allResponses.filter((r) => {
      if (r.user.id === reqUserId) return false;
      const isFollowing = followingIds.includes(r.user.id);
      if (!isFollowing) return false;

      if (r.visibility === "public") return true;
      if (r.visibility === "friends") {
        return followerIds.includes(r.user.id);
      }
      return false;
    });

    const public_entries = allResponses.filter((r) => {
      if (r.user.id === reqUserId) return false;
      const isFollowing = followingIds.includes(r.user.id);
      return !isFollowing && r.visibility === "public";
    });

    return {
      my_entries,
      network_entries,
      public_entries,
    };
  }

  async like(userId: string, entryId: string): Promise<string> {
    // 1. Verify access / visibility first (will throw 404/403 if unauthorized)
    const entry = await this.getById(entryId, userId);

    await this.db.transaction(async (tx) => {
      const existing = await tx.query.entryLikes.findFirst({
        where: and(
          eq(entryLikes.userId, userId),
          eq(entryLikes.entryId, entryId)
        )
      });
      if (existing) return;

      await tx.insert(entryLikes).values({ userId, entryId });

      await tx
        .update(tasteEntries)
        .set({ likesCount: sql`${tasteEntries.likesCount} + 1` })
        .where(eq(tasteEntries.id, entryId));

      await recalculateUserGP(tx, entry.user.id);
    });

    return entry.user.id;
  }

  async unlike(userId: string, entryId: string): Promise<string> {
    // 1. Verify access / visibility
    const entry = await this.getById(entryId, userId);

    await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(entryLikes)
        .where(
          and(
            eq(entryLikes.userId, userId),
            eq(entryLikes.entryId, entryId)
          )
        )
        .returning();

      if (deleted.length === 0) return;

      await tx
        .update(tasteEntries)
        .set({ likesCount: sql`GREATEST(0, ${tasteEntries.likesCount} - 1)` })
        .where(eq(tasteEntries.id, entryId));

      await recalculateUserGP(tx, entry.user.id);
    });

    return entry.user.id;
  }

  async addComment(userId: string, entryId: string, content: string): Promise<{ comment: any; ownerId: string }> {
    if (!content || content.trim().length === 0) {
      throw new ValidationError("Comment content cannot be empty");
    }

    // 1. Verify access / visibility
    const entry = await this.getById(entryId, userId);

    const comment = await this.db.transaction(async (tx) => {
      const [newComment] = await tx
        .insert(entryComments)
        .values({
          userId,
          entryId,
          content: content.trim(),
        })
        .returning();

      await tx
        .update(tasteEntries)
        .set({ commentsCount: sql`${tasteEntries.commentsCount} + 1` })
        .where(eq(tasteEntries.id, entryId));

      await recalculateUserGP(tx, entry.user.id);

      return newComment;
    });

    // Fetch user details for the response
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    return {
      comment: {
        id: comment.id,
        entry_id: comment.entryId,
        content: comment.content,
        created_at: comment.createdAt.toISOString(),
        likes_count: 0,
        is_liked: false,
        user: {
          id: userRecord?.id ?? "",
          username: userRecord?.username ?? "",
          display_name: userRecord?.displayName ?? null,
          avatar_url: userRecord?.avatarUrl ?? null,
        },
      },
      ownerId: entry.user.id
    };
  }

  async getComments(entryId: string, viewerId?: string): Promise<any[]> {
    // 1. Verify access / visibility
    await this.getById(entryId, viewerId);

    const rows = await this.db
      .select({
        comment: entryComments,
        user: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(entryComments)
      .innerJoin(users, eq(entryComments.userId, users.id))
      .where(eq(entryComments.entryId, entryId))
      .orderBy(entryComments.createdAt);

    const commentIds = rows.map((r) => r.comment.id);
    const likesCountMap = new Map<string, number>();
    const viewerLikedCommentIds = new Set<string>();

    if (commentIds.length > 0) {
      // 1. Fetch counts
      const counts = await this.db
        .select({
          commentId: commentLikes.commentId,
          count: sql<number>`count(${commentLikes.userId})::int`,
        })
        .from(commentLikes)
        .where(inArray(commentLikes.commentId, commentIds))
        .groupBy(commentLikes.commentId);
      
      counts.forEach((c) => likesCountMap.set(c.commentId, c.count));

      // 2. Fetch viewer likes
      if (viewerId) {
        const viewerLikes = await this.db
          .select({ commentId: commentLikes.commentId })
          .from(commentLikes)
          .where(
            and(
              eq(commentLikes.userId, viewerId),
              inArray(commentLikes.commentId, commentIds)
            )
          );
        viewerLikes.forEach((l) => viewerLikedCommentIds.add(l.commentId));
      }
    }

    return rows.map((r) => ({
      id: r.comment.id,
      entry_id: r.comment.entryId,
      content: r.comment.content,
      created_at: r.comment.createdAt.toISOString(),
      likes_count: likesCountMap.get(r.comment.id) ?? 0,
      is_liked: viewerLikedCommentIds.has(r.comment.id),
      user: {
        id: r.user.id,
        username: r.user.username,
        display_name: r.user.displayName,
        avatar_url: r.user.avatarUrl,
      },
    }));
  }

  async deleteComment(userId: string, entryId: string, commentId: string): Promise<string> {
    return this.db.transaction(async (tx) => {
      const commentRecord = await tx
        .select({
          commentUserId: entryComments.userId,
          entryUserId: tasteEntries.userId,
        })
        .from(entryComments)
        .innerJoin(tasteEntries, eq(entryComments.entryId, tasteEntries.id))
        .where(and(eq(entryComments.id, commentId), eq(entryComments.entryId, entryId)))
        .limit(1);

      if (commentRecord.length === 0) {
        throw new NotFoundError("Comment not found");
      }

      const { commentUserId, entryUserId } = commentRecord[0];

      if (commentUserId !== userId && entryUserId !== userId) {
        throw new ForbiddenError("You do not have permission to delete this comment");
      }

      await tx.delete(entryComments).where(eq(entryComments.id, commentId));

      await tx
        .update(tasteEntries)
        .set({ commentsCount: sql`GREATEST(0, ${tasteEntries.commentsCount} - 1)` })
        .where(eq(tasteEntries.id, entryId));

      await recalculateUserGP(tx, entryUserId);

      return entryUserId;
    });
  }

  async editComment(userId: string, entryId: string, commentId: string, content: string): Promise<any> {
    if (!content || content.trim().length === 0) {
      throw new ValidationError("Comment content cannot be empty");
    }

    // Verify access
    await this.getById(entryId, userId);

    const [updatedComment] = await this.db
      .update(entryComments)
      .set({ content: content.trim() })
      .where(
        and(
          eq(entryComments.id, commentId),
          eq(entryComments.entryId, entryId),
          eq(entryComments.userId, userId)
        )
      )
      .returning();

    if (!updatedComment) {
      throw new ForbiddenError("You do not have permission to edit this comment or the comment was not found");
    }

    // Fetch user details for response
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    const countResult = await this.db
      .select({ count: sql<number>`count(${commentLikes.userId})::int` })
      .from(commentLikes)
      .where(eq(commentLikes.commentId, commentId));
    
    const isLikedResult = await this.db
      .select()
      .from(commentLikes)
      .where(
        and(
          eq(commentLikes.commentId, commentId),
          eq(commentLikes.userId, userId)
        )
      )
      .limit(1);

    return {
      id: updatedComment.id,
      entry_id: updatedComment.entryId,
      content: updatedComment.content,
      created_at: updatedComment.createdAt.toISOString(),
      likes_count: countResult[0]?.count ?? 0,
      is_liked: isLikedResult.length > 0,
      user: {
        id: userRecord?.id ?? "",
        username: userRecord?.username ?? "",
        display_name: userRecord?.displayName ?? null,
        avatar_url: userRecord?.avatarUrl ?? null,
      },
    };
  }

  async toggleCommentLike(userId: string, entryId: string, commentId: string, isLiked: boolean): Promise<void> {
    // 1. Verify access / visibility of the entry
    await this.getById(entryId, userId);

    // 2. Verify comment exists
    const commentRecord = await this.db
      .select()
      .from(entryComments)
      .where(
        and(
          eq(entryComments.id, commentId),
          eq(entryComments.entryId, entryId)
        )
      )
      .limit(1);

    if (commentRecord.length === 0) {
      throw new NotFoundError("Comment not found");
    }

    if (isLiked) {
      const existing = await this.db.query.commentLikes.findFirst({
        where: and(
          eq(commentLikes.userId, userId),
          eq(commentLikes.commentId, commentId)
        ),
      });

      if (!existing) {
        await this.db.insert(commentLikes).values({ userId, commentId });
      }
    } else {
      await this.db
        .delete(commentLikes)
        .where(
          and(
            eq(commentLikes.userId, userId),
            eq(commentLikes.commentId, commentId)
          )
        );
    }
  }

  async getCounters(entryId: string, viewerId?: string): Promise<{ likes_count: number; comments_count: number; is_liked: boolean }> {
    // 1. Verify access / visibility
    const entry = await this.getById(entryId, viewerId);

    return {
      likes_count: entry.likes_count,
      comments_count: entry.comments_count,
      is_liked: !!entry.is_liked,
    };
  }
}

