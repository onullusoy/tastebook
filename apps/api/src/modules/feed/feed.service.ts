import { createDb, tasteEntries, users, follows, entryMedia } from "@tastebook/db";
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
      return this.getPublicFeed(cursor, limit);
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

    const userIds = Array.from(new Set(entries.map(e => e.userId)));
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

    const entryIds = entries.map(e => e.id);
    const allMedia = await this.db
      .select()
      .from(entryMedia)
      .where(inArray(entryMedia.entryId, entryIds))
      .orderBy(entryMedia.orderIndex);

    const hasNextPage = entries.length > limit;
    const itemsToReturn = hasNextPage ? entries.slice(0, limit) : entries;

    const data = itemsToReturn.map(entry => {
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
          mime_type: m.mimeType ?? "",
          order_index: m.orderIndex,
        }));

      return {
        id: entry.id,
        user: mappedUser,
        dish_name: entry.dishName,
        restaurant_name: entry.restaurantName || null,
        city: entry.city || null,
        country: entry.country || null,
        price_level: entry.priceLevel,
        rating: entry.rating,
        notes: entry.notes || null,
        visibility: entry.visibility as "public" | "friends" | "private",
        media: mediaList,
        created_at: entry.createdAt.toISOString(),
      };
    });

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

  async getPublicFeed(cursor?: string, limit = 20): Promise<PaginatedResponse<EntryResponse>> {
    const hash = cursor ? crypto.createHash("sha256").update(cursor).digest("hex").slice(0, 12) : "first";
    const cacheKey = `feed:public:${hash}`;

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

    const userIds = Array.from(new Set(entries.map(e => e.userId)));
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

    const entryIds = entries.map(e => e.id);
    const allMedia = await this.db
      .select()
      .from(entryMedia)
      .where(inArray(entryMedia.entryId, entryIds))
      .orderBy(entryMedia.orderIndex);

    const hasNextPage = entries.length > limit;
    const itemsToReturn = hasNextPage ? entries.slice(0, limit) : entries;

    const data = itemsToReturn.map(entry => {
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
          mime_type: m.mimeType ?? "",
          order_index: m.orderIndex,
        }));

      return {
        id: entry.id,
        user: mappedUser,
        dish_name: entry.dishName,
        restaurant_name: entry.restaurantName || null,
        city: entry.city || null,
        country: entry.country || null,
        price_level: entry.priceLevel,
        rating: entry.rating,
        notes: entry.notes || null,
        visibility: entry.visibility as "public" | "friends" | "private",
        media: mediaList,
        created_at: entry.createdAt.toISOString(),
      };
    });

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

  async invalidateUserFeed(userId: string): Promise<void> {
    await this.redis.incr(`feed_version:${userId}`);
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
