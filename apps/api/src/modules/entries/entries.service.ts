import { createDb, tasteEntries, users, follows, entryMedia, foodItems, lists, listItems, listCollaborators, restaurants, entryLikes, entryComments } from "@tastebook/db";
import { eq, and, or, inArray, desc, lt, sql, ne } from "drizzle-orm";
import { NotFoundError, ForbiddenError, ValidationError } from "../../shared/errors";
import type { CreateEntryRequest, UpdateEntryRequest } from "@tastebook/shared/schemas/entries";
import type { EntryResponse, PaginatedResponse } from "@tastebook/shared/api-types";
import { MediaService } from "../media/media.service";
import { encodeCursor, decodeCursor } from "../../shared/utils/cursor";

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

    // Check if entry is liked by viewer
    let isLiked = false;
    if (viewerId) {
      const likeRecord = await this.db.query.entryLikes.findFirst({
        where: and(
          eq(entryLikes.entryId, entry.id),
          eq(entryLikes.userId, viewerId)
        )
      });
      isLiked = !!likeRecord;
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
      likes_count: entry.likesCount,
      comments_count: entry.commentsCount,
      is_liked: isLiked,
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
    }

    const [newEntry] = await this.db
      .insert(tasteEntries)
      .values({
        userId,
        restaurantName,
        city,
        country,
        googlePlaceId: data.google_place_id ?? null,
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
      // Check if entry already in list (shouldn't be, it's new)
      const [maxOrderResult] = await this.db
        .select({ maxOrder: sql<number>`COALESCE(max(order_index), -1)::int` })
        .from(listItems)
        .where(eq(listItems.listId, data.list_id));
      const nextOrder = (maxOrderResult?.maxOrder ?? -1) + 1;

      await this.db.insert(listItems).values({
        listId: data.list_id,
        entryId: newEntry.id,
        orderIndex: nextOrder,
      });
    }

    if (newEntry.googlePlaceId) {
      await this.recalculateRestaurantStats(newEntry.googlePlaceId);
    }

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

    if (data.restaurant_name !== undefined) updateData.restaurantName = data.restaurant_name;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.google_place_id !== undefined) updateData.googlePlaceId = data.google_place_id;
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
        likes_count: entry.likesCount,
        comments_count: entry.commentsCount,
        is_liked: likedEntryIds.has(entry.id),
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

    return rows.map((r) => ({
      id: r.comment.id,
      entry_id: r.comment.entryId,
      content: r.comment.content,
      created_at: r.comment.createdAt.toISOString(),
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

      return entryUserId;
    });
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

