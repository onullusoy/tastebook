import { createDb, tasteEntries, users, follows, entryMedia, foodItems, entryLikes } from "@tastebook/db";
import { eq, and, or, inArray, desc, lt } from "drizzle-orm";
import type { EntryResponse, PaginatedResponse } from "@tastebook/shared/api-types";
import type { SocialService } from "../social/social.service";
import type { MediaService } from "../media/media.service";
import { encodeCursor, decodeCursor } from "../../shared/utils/cursor";
import crypto from "crypto";
import type Redis from "ioredis";

export class FeedService {
  constructor(
    private db: ReturnType<typeof createDb>,
    private redis: Redis,
    private socialService: SocialService,
    private mediaService: MediaService
  ) {}

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

  async getFeed(userId: string, cursor?: string, limit = 20): Promise<PaginatedResponse<EntryResponse>> {
    const versionKey = `feed_version:${userId}`;
    let version = await this.redis.get(versionKey);
    if (!version) {
      version = "0";
      await this.redis.set(versionKey, "0");
    }

    const hash = cursor ? crypto.createHash("sha256").update(cursor).digest("hex").slice(0, 12) : "first";
    const cacheKey = `feed:${userId}:v${version}:${hash}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as PaginatedResponse<EntryResponse>;
    }

    const followed = await this.db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));
    const followedIds = followed.map(f => f.followingId);

    if (followedIds.length === 0) {
      const publicFeed = await this.getPublicFeed(cursor, limit, userId);
      const response = {
        ...publicFeed,
        is_recommended: true,
      };
      await this.redis.set(cacheKey, JSON.stringify(response), "EX", 30);
      return response;
    }

    let friendIds: string[] = [];
    if (followedIds.length > 0) {
      const mutual = await this.db
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(
          and(
            eq(follows.followingId, userId),
            inArray(follows.followerId, followedIds)
          )
        );
      friendIds = mutual.map(m => m.followerId);
    }

    const orClauses = [
      eq(tasteEntries.userId, userId)
    ];

    const nonFriendIds = followedIds.filter(id => !friendIds.includes(id));

    if (friendIds.length > 0) {
      orClauses.push(
        and(
          inArray(tasteEntries.userId, friendIds) as any,
          inArray(tasteEntries.visibility, ["public", "friends"]) as any
        ) as any
      );
    }

    if (nonFriendIds.length > 0) {
      orClauses.push(
        and(
          inArray(tasteEntries.userId, nonFriendIds) as any,
          eq(tasteEntries.visibility, "public")
        ) as any
      );
    }

    let whereClause = or(...orClauses);

    if (cursor) {
      const { timestamp: cursorTs, id: cursorId } = decodeCursor(cursor);
      const cursorCondition = or(
        lt(tasteEntries.createdAt, new Date(cursorTs)),
        and(
          eq(tasteEntries.createdAt, new Date(cursorTs)),
          lt(tasteEntries.id, cursorId)
        )
      );
      whereClause = and(whereClause, cursorCondition);
    }

    const entries = await this.db
      .select()
      .from(tasteEntries)
      .where(whereClause)
      .orderBy(desc(tasteEntries.createdAt), desc(tasteEntries.id))
      .limit(limit + 1);

    if (entries.length === 0) {
      const response = { data: [] };
      await this.redis.set(cacheKey, JSON.stringify(response), "EX", 60);
      return response;
    }

    const hasNextPage = entries.length > limit;
    const itemsToReturn = hasNextPage ? entries.slice(0, limit) : entries;

    const data = await this.buildEntryResponses(itemsToReturn, userId);

    let nextCursor: string | undefined;
    if (hasNextPage && itemsToReturn.length > 0) {
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    const response: PaginatedResponse<EntryResponse> = {
      data,
      cursor: nextCursor,
    };

    await this.redis.set(cacheKey, JSON.stringify(response), "EX", 60);

    return response;
  }

  async getPublicFeed(
    cursor?: string,
    limit = 20,
    viewerId?: string
  ): Promise<PaginatedResponse<EntryResponse>> {
    const hash = cursor ? crypto.createHash("sha256").update(cursor).digest("hex").slice(0, 12) : "first";
    const viewerKey = viewerId || "anonymous";
    const cacheKey = `feed:public:${viewerKey}:${hash}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as PaginatedResponse<EntryResponse>;
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

    const conditions = [eq(tasteEntries.visibility, "public")];
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const entries = await this.db
      .select()
      .from(tasteEntries)
      .where(and(...conditions))
      .orderBy(desc(tasteEntries.createdAt), desc(tasteEntries.id))
      .limit(limit + 1);

    if (entries.length === 0) {
      const response = { data: [] };
      await this.redis.set(cacheKey, JSON.stringify(response), "EX", 30);
      return response;
    }

    const hasNextPage = entries.length > limit;
    const itemsToReturn = hasNextPage ? entries.slice(0, limit) : entries;

    const data = await this.buildEntryResponses(itemsToReturn, viewerId);

    let nextCursor: string | undefined;
    if (hasNextPage && itemsToReturn.length > 0) {
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    const response: PaginatedResponse<EntryResponse> = {
      data,
      cursor: nextCursor,
    };

    await this.redis.set(cacheKey, JSON.stringify(response), "EX", 30);

    return response;
  }

  async getCityFeed(
    userId: string,
    cityName: string,
    scope: "following" | "public",
    cursor?: string,
    limit = 20
  ): Promise<PaginatedResponse<EntryResponse>> {
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

    let whereClause;

    if (scope === "following") {
      const followed = await this.db
        .select({ followingId: follows.followingId })
        .from(follows)
        .where(eq(follows.followerId, userId));
      const followedIds = followed.map(f => f.followingId);

      if (followedIds.length === 0) {
        return { data: [] };
      }

      const mutual = await this.db
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(
          and(
            eq(follows.followingId, userId),
            inArray(follows.followerId, followedIds)
          )
        );
      const friendIds = mutual.map(m => m.followerId);
      const nonFriendIds = followedIds.filter(id => !friendIds.includes(id));

      const orClauses = [];
      if (friendIds.length > 0) {
        orClauses.push(
          and(
            inArray(tasteEntries.userId, friendIds),
            inArray(tasteEntries.visibility, ["public", "friends"])
          )
        );
      }
      if (nonFriendIds.length > 0) {
        orClauses.push(
          and(
            inArray(tasteEntries.userId, nonFriendIds),
            eq(tasteEntries.visibility, "public")
          )
        );
      }

      if (orClauses.length === 0) {
        return { data: [] };
      }

      whereClause = and(
        eq(tasteEntries.city, cityName),
        or(...orClauses)
      );
    } else {
      whereClause = and(
        eq(tasteEntries.city, cityName),
        eq(tasteEntries.visibility, "public")
      );
    }

    if (cursorCondition) {
      whereClause = and(whereClause, cursorCondition);
    }

    const entries = await this.db
      .select()
      .from(tasteEntries)
      .where(whereClause)
      .orderBy(desc(tasteEntries.createdAt), desc(tasteEntries.id))
      .limit(limit + 1);

    if (entries.length === 0) {
      return { data: [] };
    }

    const hasNextPage = entries.length > limit;
    const itemsToReturn = hasNextPage ? entries.slice(0, limit) : entries;

    const data = await this.buildEntryResponses(itemsToReturn, userId);

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

  async invalidateUserFeed(userId: string): Promise<void> {
    await this.redis.incr(`feed_version:${userId}`);
    const keys = await this.redis.keys(`feed:public:${userId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async invalidateFollowerFeeds(userId: string): Promise<void> {
    const followersList = await this.db
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(eq(follows.followingId, userId));

    const followerIds = followersList.map(f => f.followerId);
    const allIds = [userId, ...followerIds];

    await Promise.all(allIds.map(id => this.invalidateUserFeed(id)));
  }
}
