import { createDb, lists, listItems, users, follows, tasteEntries, entryMedia, foodItems, listCollaborators } from "@tastebook/db";
import { eq, and, or, inArray, desc, sql } from "drizzle-orm";
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from "../../shared/errors";
import type { CreateListRequest, UpdateListRequest } from "@tastebook/shared/schemas/lists";
import type { ListResponse, EntryResponse, CollaboratorResponse } from "@tastebook/shared/api-types";
import type { MediaService } from "../media/media.service";

export class ListsService {
  constructor(
    private db: ReturnType<typeof createDb>,
    private mediaService: MediaService
  ) {}

  private async checkIsFriend(viewerId: string, ownerId: string): Promise<boolean> {
    const friendCheck = await this.db
      .select()
      .from(follows)
      .where(
        and(
          or(
            and(eq(follows.followerId, viewerId), eq(follows.followingId, ownerId)),
            and(eq(follows.followerId, ownerId), eq(follows.followingId, viewerId))
          )
        )
      );
    return friendCheck.length === 2;
  }

  private async getCollaboratorsForList(listId: string): Promise<CollaboratorResponse[]> {
    const rows = await this.db
      .select({
        collab: listCollaborators,
        user: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(listCollaborators)
      .innerJoin(users, eq(listCollaborators.userId, users.id))
      .where(eq(listCollaborators.listId, listId));

    return rows.map(row => ({
      id: row.collab.id,
      user: {
        id: row.user.id,
        username: row.user.username,
        display_name: row.user.displayName,
        avatar_url: row.user.avatarUrl,
      },
      role: row.collab.role as "contributor" | "editor",
      created_at: row.collab.createdAt.toISOString(),
    }));
  }

  /**
   * Check if a user is the owner or a collaborator of a list.
   */
  async canContribute(listId: string, userId: string): Promise<boolean> {
    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });
    if (!list) return false;
    if (list.userId === userId) return true;

    const collab = await this.db.query.listCollaborators.findFirst({
      where: and(
        eq(listCollaborators.listId, listId),
        eq(listCollaborators.userId, userId)
      ),
    });
    return !!collab;
  }

  private async fetchListResponse(listId: string): Promise<ListResponse> {
    const rows = await this.db
      .select({
        list: lists,
        user: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(lists)
      .innerJoin(users, eq(lists.userId, users.id))
      .where(eq(lists.id, listId));

    if (rows.length === 0) {
      throw new NotFoundError("List not found");
    }

    const [itemCountResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listItems)
      .where(eq(listItems.listId, listId));

    const collaborators = await this.getCollaboratorsForList(listId);

    const firstRow = rows[0];
    const list = firstRow.list;
    const user = firstRow.user;

    return {
      id: list.id,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
      },
      title: list.title,
      description: list.description,
      visibility: list.visibility as "public" | "friends" | "private",
      cover_image_url: list.coverImageUrl,
      item_count: itemCountResult?.count ?? 0,
      collaborators,
      is_collaborative: collaborators.length > 0,
      created_at: list.createdAt.toISOString(),
    };
  }

  async create(userId: string, data: CreateListRequest): Promise<ListResponse> {
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(lists)
      .where(eq(lists.userId, userId));

    if ((countResult?.count ?? 0) >= 50) {
      throw new ValidationError("Maximum 50 lists allowed per user.");
    }

    const [newList] = await this.db
      .insert(lists)
      .values({
        userId,
        title: data.title,
        description: data.description ?? null,
        visibility: data.visibility ?? "public",
      })
      .returning();

    return this.fetchListResponse(newList.id);
  }

  async getById(listId: string, viewerId?: string): Promise<ListResponse & { items: EntryResponse[] }> {
    const listRes = await this.fetchListResponse(listId);

    // Collaborators always have access
    const isCollaborator = viewerId
      ? listRes.collaborators.some(c => c.user.id === viewerId)
      : false;

    if (!isCollaborator) {
      if (listRes.visibility === "private") {
        if (viewerId !== listRes.user.id) {
          throw new NotFoundError("List not found");
        }
      } else if (listRes.visibility === "friends") {
        if (viewerId !== listRes.user.id) {
          if (!viewerId) {
            throw new NotFoundError("List not found");
          }
          const isFriend = await this.checkIsFriend(viewerId, listRes.user.id);
          if (!isFriend) {
            throw new NotFoundError("List not found");
          }
        }
      }
    }

    const items = await this.db
      .select({ entryId: listItems.entryId })
      .from(listItems)
      .where(eq(listItems.listId, listId))
      .orderBy(listItems.orderIndex);

    const entryIds = items.map(i => i.entryId);
    let entries: EntryResponse[] = [];
    if (entryIds.length > 0) {
      const entryRows = await this.db
        .select()
        .from(tasteEntries)
        .where(inArray(tasteEntries.id, entryIds));

      const creatorIds = Array.from(new Set(entryRows.map(e => e.userId)));
      const creators = await this.db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(inArray(users.id, creatorIds));
      const creatorMap = new Map(creators.map(c => [c.id, c]));

      const allMedia = await this.db
        .select()
        .from(entryMedia)
        .where(inArray(entryMedia.entryId, entryIds))
        .orderBy(entryMedia.orderIndex);

      const allFoodItems = await this.db
        .select()
        .from(foodItems)
        .where(inArray(foodItems.entryId, entryIds))
        .orderBy(foodItems.orderIndex);

      const mappedEntries = entryRows.map(entry => {
        const creator = creatorMap.get(entry.userId);
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
          user: {
            id: creator?.id ?? "",
            username: creator?.username ?? "",
            display_name: creator?.displayName ?? null,
            avatar_url: creator?.avatarUrl ?? null,
          },
          restaurant_name: entry.restaurantName,
          city: entry.city,
          country: entry.country,
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
          created_at: entry.createdAt.toISOString(),
        };
      });

      entries = entryIds
        .map(id => mappedEntries.find(e => e.id === id))
        .filter((e): e is EntryResponse => !!e);
    }

    return {
      ...listRes,
      items: entries,
    };
  }

  async update(listId: string, userId: string, data: UpdateListRequest): Promise<ListResponse> {
    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });

    if (!list) {
      throw new NotFoundError("List not found");
    }

    // Verify visibility first to prevent existence leaks
    await this.getById(listId, userId);

    if (list.userId !== userId) {
      throw new ForbiddenError("You do not own this list.");
    }

    const updateData: Partial<typeof lists.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;

    await this.db
      .update(lists)
      .set(updateData)
      .where(eq(lists.id, listId));

    return this.fetchListResponse(listId);
  }

  async delete(listId: string, userId: string): Promise<void> {
    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });

    if (!list) {
      throw new NotFoundError("List not found");
    }

    // Verify visibility first to prevent existence leaks
    await this.getById(listId, userId);

    if (list.userId !== userId) {
      throw new ForbiddenError("You do not own this list.");
    }

    await this.db
      .delete(lists)
      .where(eq(lists.id, listId));
  }

  async addItem(listId: string, userId: string, entryId: string): Promise<void> {
    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });
    if (!list) {
      throw new NotFoundError("List not found");
    }

    // Verify visibility first to prevent existence leaks
    await this.getById(listId, userId);

    // Owner or collaborator can add items
    const isOwner = list.userId === userId;
    if (!isOwner) {
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

    const entry = await this.db.query.tasteEntries.findFirst({
      where: eq(tasteEntries.id, entryId),
    });
    if (!entry) {
      throw new NotFoundError("Entry not found");
    }

    const existing = await this.db.query.listItems.findFirst({
      where: and(
        eq(listItems.listId, listId),
        eq(listItems.entryId, entryId)
      ),
    });
    if (existing) {
      throw new ConflictError("Entry already in list");
    }

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listItems)
      .where(eq(listItems.listId, listId));
    if ((countResult?.count ?? 0) >= 100) {
      throw new ValidationError("Maximum 100 items allowed per list.");
    }

    const [maxOrderResult] = await this.db
      .select({ maxOrder: sql<number>`max(order_index)::int` })
      .from(listItems)
      .where(eq(listItems.listId, listId));
    const nextOrder = (maxOrderResult?.maxOrder !== null && maxOrderResult?.maxOrder !== undefined)
      ? maxOrderResult.maxOrder + 1
      : 0;

    await this.db.insert(listItems).values({
      listId,
      entryId,
      orderIndex: nextOrder,
    });
  }

  async removeItem(listId: string, userId: string, entryId: string): Promise<void> {
    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });
    if (!list) {
      throw new NotFoundError("List not found");
    }

    // Verify visibility first to prevent existence leaks
    await this.getById(listId, userId);

    // Owner or collaborator can remove items
    const isOwner = list.userId === userId;
    if (!isOwner) {
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

    const result = await this.db
      .delete(listItems)
      .where(
        and(
          eq(listItems.listId, listId),
          eq(listItems.entryId, entryId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new NotFoundError("Item not found in list");
    }
  }

  async reorderItems(listId: string, userId: string, entryIds: string[]): Promise<void> {
    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });
    if (!list) {
      throw new NotFoundError("List not found");
    }

    // Verify visibility first to prevent existence leaks
    await this.getById(listId, userId);

    if (list.userId !== userId) {
      throw new ForbiddenError("You do not own this list.");
    }

    const currentItems = await this.db
      .select()
      .from(listItems)
      .where(eq(listItems.listId, listId));

    const currentEntryIds = currentItems.map(i => i.entryId);

    const hasMismatch = entryIds.length !== currentEntryIds.length || entryIds.some(id => !currentEntryIds.includes(id));
    if (hasMismatch) {
      throw new ValidationError("Invalid entry ids for reordering.");
    }

    await this.db.transaction(async (tx) => {
      for (let idx = 0; idx < entryIds.length; idx++) {
        const entryId = entryIds[idx];
        await tx
          .update(listItems)
          .set({ orderIndex: idx })
          .where(
            and(
              eq(listItems.listId, listId),
              eq(listItems.entryId, entryId)
            )
          );
      }
    });
  }

  // ===== Collaborator Management =====

  async addCollaborator(listId: string, ownerId: string, targetUserId: string, role: string): Promise<void> {
    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });
    if (!list) {
      throw new NotFoundError("List not found");
    }

    // Verify visibility first to prevent existence leaks
    await this.getById(listId, ownerId);

    if (list.userId !== ownerId) {
      throw new ForbiddenError("Only the list owner can manage collaborators.");
    }
    if (ownerId === targetUserId) {
      throw new ValidationError("Cannot add yourself as a collaborator.");
    }

    // Verify target user exists
    const targetUser = await this.db.query.users.findFirst({
      where: eq(users.id, targetUserId),
    });
    if (!targetUser) {
      throw new NotFoundError("User not found");
    }

    // Check if already a collaborator
    const existing = await this.db.query.listCollaborators.findFirst({
      where: and(
        eq(listCollaborators.listId, listId),
        eq(listCollaborators.userId, targetUserId)
      ),
    });
    if (existing) {
      throw new ConflictError("User is already a collaborator.");
    }

    await this.db.insert(listCollaborators).values({
      listId,
      userId: targetUserId,
      role: role as "contributor" | "editor",
    });
  }

  async removeCollaborator(listId: string, ownerId: string, targetUserId: string): Promise<void> {
    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });
    if (!list) {
      throw new NotFoundError("List not found");
    }

    // Verify visibility first to prevent existence leaks
    await this.getById(listId, ownerId);

    if (list.userId !== ownerId) {
      throw new ForbiddenError("Only the list owner can manage collaborators.");
    }

    const result = await this.db
      .delete(listCollaborators)
      .where(
        and(
          eq(listCollaborators.listId, listId),
          eq(listCollaborators.userId, targetUserId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new NotFoundError("Collaborator not found");
    }
  }

  async listByUser(targetUserId: string, viewerId: string | undefined): Promise<ListResponse[]> {
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

    const userLists = await this.db
      .select()
      .from(lists)
      .where(
        and(
          eq(lists.userId, targetUserId),
          inArray(lists.visibility, visibilities)
        )
      )
      .orderBy(desc(lists.createdAt));

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

    const listIds = userLists.map((l) => l.id);

    const itemCounts = listIds.length > 0
      ? await this.db
          .select({
            listId: listItems.listId,
            count: sql<number>`count(*)::int`,
          })
          .from(listItems)
          .where(inArray(listItems.listId, listIds))
          .groupBy(listItems.listId)
      : [];

    const itemCountMap = new Map<string, number>(
      itemCounts.map((c) => [c.listId, c.count])
    );

    const collaboratorsRows = listIds.length > 0
      ? await this.db
          .select({
            collab: listCollaborators,
            user: {
              id: users.id,
              username: users.username,
              displayName: users.displayName,
              avatarUrl: users.avatarUrl,
            },
          })
          .from(listCollaborators)
          .innerJoin(users, eq(listCollaborators.userId, users.id))
          .where(inArray(listCollaborators.listId, listIds))
      : [];

    const collaboratorsMap = new Map<string, CollaboratorResponse[]>();
    for (const row of collaboratorsRows) {
      const listId = row.collab.listId;
      if (!collaboratorsMap.has(listId)) {
        collaboratorsMap.set(listId, []);
      }
      collaboratorsMap.get(listId)!.push({
        id: row.collab.id,
        user: {
          id: row.user.id,
          username: row.user.username,
          display_name: row.user.displayName,
          avatar_url: row.user.avatarUrl,
        },
        role: row.collab.role as "contributor" | "editor",
        created_at: row.collab.createdAt.toISOString(),
      });
    }

    const results = userLists.map((list) => {
      const colabs = collaboratorsMap.get(list.id) || [];
      return {
        id: list.id,
        user: mappedUser,
        title: list.title,
        description: list.description,
        visibility: list.visibility as "public" | "friends" | "private",
        cover_image_url: list.coverImageUrl,
        item_count: itemCountMap.get(list.id) ?? 0,
        collaborators: colabs,
        is_collaborative: colabs.length > 0,
        created_at: list.createdAt.toISOString(),
      };
    });

    return results;
  }
}
