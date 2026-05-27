import { createDb, tasteEntries, users, follows, entryMedia } from "@tastebook/db";
import { eq, and, or, inArray, desc, lt } from "drizzle-orm";
import { NotFoundError, ForbiddenError, ValidationError } from "../../shared/errors";
import type { CreateEntryRequest, UpdateEntryRequest } from "@tastebook/shared/schemas/entries";
import type { EntryResponse, PaginatedResponse } from "@tastebook/shared/api-types";
import { MediaService } from "../media/media.service";
import { encodeCursor, decodeCursor } from "../../shared/utils/cursor";

export class EntriesService {
  constructor(
    private db: ReturnType<typeof createDb>,
    private mediaService: MediaService
  ) {}

  private async fetchEntryResponse(entryId: string): Promise<EntryResponse> {
    const rows = await this.db
      .select({
        entry: tasteEntries,
        user: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
        media: entryMedia,
      })
      .from(tasteEntries)
      .innerJoin(users, eq(tasteEntries.userId, users.id))
      .leftJoin(entryMedia, eq(tasteEntries.id, entryMedia.entryId))
      .where(eq(tasteEntries.id, entryId))
      .orderBy(entryMedia.orderIndex);

    if (rows.length === 0) {
      throw new NotFoundError("Entry not found");
    }

    const firstRow = rows[0];
    const entry = firstRow.entry;
    const user = firstRow.user;

    const mediaList = rows
      .map(r => r.media)
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map(m => ({
        id: m.id,
        url: this.mediaService.getMediaUrl(m.url),
        mime_type: m.mimeType ?? "",
        order_index: m.orderIndex,
      }));

    return {
      id: entry.id,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
      },
      dish_name: entry.dishName,
      restaurant_name: entry.restaurantName,
      city: entry.city,
      country: entry.country,
      price_level: entry.priceLevel,
      rating: entry.rating,
      notes: entry.notes,
      visibility: entry.visibility as "public" | "friends" | "private",
      media: mediaList,
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

  async create(userId: string, data: CreateEntryRequest): Promise<EntryResponse> {
    const mediaIds = data.media_ids ?? [];
    if (mediaIds.length > 5) {
      throw new ValidationError("Maximum 5 media files allowed per entry.");
    }

    const [newEntry] = await this.db
      .insert(tasteEntries)
      .values({
        userId,
        dishName: data.dish_name,
        restaurantName: data.restaurant_name ?? "",
        city: data.city ?? "",
        country: data.country ?? "",
        priceLevel: data.price_level ?? null,
        rating: data.rating,
        notes: data.notes ?? null,
        visibility: data.visibility ?? "public",
      })
      .returning();

    if (mediaIds.length > 0) {
      await this.mediaService.attachMediaToEntry(mediaIds, newEntry.id, userId);
    }

    return this.fetchEntryResponse(newEntry.id);
  }

  async getById(entryId: string, viewerId?: string): Promise<EntryResponse> {
    const response = await this.fetchEntryResponse(entryId);

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

    if (entry.userId !== userId) {
      throw new ForbiddenError("You do not own this entry.");
    }

    const updateData: Partial<typeof tasteEntries.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.dish_name !== undefined) updateData.dishName = data.dish_name;
    if (data.restaurant_name !== undefined) updateData.restaurantName = data.restaurant_name ?? "";
    if (data.city !== undefined) updateData.city = data.city ?? "";
    if (data.country !== undefined) updateData.country = data.country ?? "";
    if (data.price_level !== undefined) updateData.priceLevel = data.price_level;
    if (data.rating !== undefined) updateData.rating = data.rating;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;

    await this.db
      .update(tasteEntries)
      .set(updateData)
      .where(eq(tasteEntries.id, entryId));

    return this.fetchEntryResponse(entryId);
  }

  async delete(entryId: string, userId: string): Promise<void> {
    const entry = await this.db.query.tasteEntries.findFirst({
      where: eq(tasteEntries.id, entryId),
    });

    if (!entry) {
      throw new NotFoundError("Entry not found");
    }

    if (entry.userId !== userId) {
      throw new ForbiddenError("You do not own this entry.");
    }

    await this.mediaService.deleteMediaByEntryId(entryId, userId);

    await this.db
      .delete(tasteEntries)
      .where(eq(tasteEntries.id, entryId));
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

    if (entries.length === 0) {
      return { data: [] };
    }

    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, targetUserId),
    });
    if (!userRecord) {
      throw new NotFoundError("User not found");
    }
    const mappedUser = {
      id: userRecord.id,
      username: userRecord.username,
      display_name: userRecord.displayName,
      avatar_url: userRecord.avatarUrl,
    };

    const entryIds = entries.map(e => e.id);
    const allMedia = await this.db
      .select()
      .from(entryMedia)
      .where(inArray(entryMedia.entryId, entryIds))
      .orderBy(entryMedia.orderIndex);

    const hasNextPage = entries.length > limit;
    const itemsToReturn = hasNextPage ? entries.slice(0, limit) : entries;

    const data = itemsToReturn.map(entry => {
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

    return {
      data,
      cursor: nextCursor,
    };
  }
}
