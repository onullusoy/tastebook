import { createDb, lists, listItems, users, follows, listCollaborators, listLikes, restaurants, tasteEntries } from "@tastebook/db";
import { eq, and, or, inArray, desc, sql } from "drizzle-orm";
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from "../../shared/errors";
import { normalizeCityName } from "@tastebook/shared";
import type { CreateListRequest, UpdateListRequest } from "@tastebook/shared/schemas/lists";
import type { ListResponse, RestaurantResponse, CollaboratorResponse } from "@tastebook/shared/api-types";
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

  private async fetchListResponse(listId: string, viewerId?: string): Promise<ListResponse> {
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

    const [likesCountResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listLikes)
      .where(eq(listLikes.listId, listId));

    let isLiked = false;
    if (viewerId) {
      const likeRecord = await this.db.query.listLikes.findFirst({
        where: and(
          eq(listLikes.listId, listId),
          eq(listLikes.userId, viewerId)
        ),
      });
      isLiked = !!likeRecord;
    }

    const collaborators = await this.getCollaboratorsForList(listId);

    const firstRow = rows[0];
    const list = firstRow.list;
    const user = firstRow.user;

    // Find corresponding feed entry ID
    const entry = await this.db.query.tasteEntries.findFirst({
      where: eq(tasteEntries.listId, listId),
    });

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
      likes_count: likesCountResult?.count ?? 0,
      is_liked: isLiked,
      collaborators,
      is_collaborative: collaborators.length > 0,
      metadata: list.metadata,
      created_at: list.createdAt.toISOString(),
      feed_entry_id: entry?.id || null,
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

    if (data.metadata?.cities) {
      data.metadata.cities = data.metadata.cities.map(c => normalizeCityName(c));
    }

    const [newList] = await this.db
      .insert(lists)
      .values({
        userId,
        title: data.title,
        description: data.description ?? null,
        visibility: data.visibility ?? "public",
        coverImageUrl: data.cover_image_url ?? null,
        metadata: data.metadata ?? {},
      })
      .returning();

    // Share list creation as a feed post in tasteEntries
    const initialCity = data.metadata?.cities?.[0] || "Various";
    await this.db
      .insert(tasteEntries)
      .values({
        userId,
        restaurantName: data.title,
        city: initialCity,
        country: "Various",
        priceLevel: 1,
        rating: 10,
        notes: data.description ?? null,
        visibility: data.visibility ?? "public",
        listId: newList.id,
        metadata: {
          is_list: true,
          list_id: newList.id,
          cities: data.metadata?.cities || [],
          cover_image_url: data.cover_image_url ?? null,
        },
      });

    return this.fetchListResponse(newList.id, userId);
  }

  async getById(listId: string, viewerId?: string): Promise<ListResponse & { items: RestaurantResponse[] }> {
    const listRes = await this.fetchListResponse(listId, viewerId);

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
      .select({
        restaurant: restaurants
      })
      .from(listItems)
      .innerJoin(restaurants, eq(listItems.restaurantId, restaurants.googlePlaceId))
      .where(eq(listItems.listId, listId))
      .orderBy(listItems.orderIndex);

    const mappedItems: RestaurantResponse[] = items.map((row) => ({
      google_place_id: row.restaurant.googlePlaceId,
      name: row.restaurant.name,
      city: row.restaurant.city,
      country: row.restaurant.country,
      is_local: true,
      stats: {
        rating_avg: Number(row.restaurant.ratingAvg),
        rating_count: row.restaurant.ratingCount,
        price_level_avg: Number(row.restaurant.priceLevelAvg),
        dominant_tags: row.restaurant.atmosphereTags || [],
      },
      metadata: row.restaurant.metadata,
    }));

    return {
      ...listRes,
      items: mappedItems,
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

    const isContributor = await this.canContribute(listId, userId);
    if (!isContributor) {
      throw new ForbiddenError("You do not have permission to edit this list.");
    }

    const updateData: Partial<typeof lists.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.cover_image_url !== undefined) updateData.coverImageUrl = data.cover_image_url;
    
    if (data.metadata !== undefined) {
      if (data.metadata?.cities) {
        data.metadata.cities = data.metadata.cities.map(c => normalizeCityName(c));
      }
      updateData.metadata = data.metadata;
    }

    await this.db
      .update(lists)
      .set(updateData)
      .where(eq(lists.id, listId));

    // Update corresponding tasteEntries feed post if it exists
    const entry = await this.db.query.tasteEntries.findFirst({
      where: eq(tasteEntries.listId, listId),
    });
    if (entry) {
      const entryUpdate: Partial<typeof tasteEntries.$inferInsert> = {};
      if (data.title !== undefined) entryUpdate.restaurantName = data.title;
      if (data.description !== undefined) entryUpdate.notes = data.description;
      if (data.visibility !== undefined) entryUpdate.visibility = data.visibility;

      const currentMetadata = (entry.metadata as any) || {};
      let hasMetadataChange = false;
      const updatedMetadata = { ...currentMetadata };

      if (data.metadata !== undefined) {
        const cities = data.metadata?.cities || [];
        entryUpdate.city = cities[0] || "Various";
        updatedMetadata.cities = cities;
        hasMetadataChange = true;
      }

      if (data.cover_image_url !== undefined) {
        updatedMetadata.cover_image_url = data.cover_image_url;
        hasMetadataChange = true;
      }

      if (hasMetadataChange) {
        entryUpdate.metadata = updatedMetadata;
      }

      if (Object.keys(entryUpdate).length > 0) {
        await this.db
          .update(tasteEntries)
          .set(entryUpdate)
          .where(eq(tasteEntries.id, entry.id));
      }
    }

    return this.fetchListResponse(listId, userId);
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

    // Cascade delete corresponding tasteEntries feed post
    await this.db
      .delete(tasteEntries)
      .where(eq(tasteEntries.listId, listId));

    await this.db
      .delete(lists)
      .where(eq(lists.id, listId));
  }

  async addItem(
    listId: string,
    userId: string,
    restaurantId: string,
    details?: { name?: string; city?: string; country?: string }
  ): Promise<void> {
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

    let restaurant = await this.db.query.restaurants.findFirst({
      where: eq(restaurants.googlePlaceId, restaurantId),
    });
    if (!restaurant) {
      const normalizedCity = details?.city ? normalizeCityName(details.city) : "Unknown";
      const [newRest] = await this.db
        .insert(restaurants)
        .values({
          googlePlaceId: restaurantId,
          name: details?.name || "Unknown Restaurant",
          city: normalizedCity,
          country: details?.country || "Unknown",
          ratingAvg: "0.0",
          ratingCount: 0,
          priceLevelAvg: "0.0",
          atmosphereTags: [],
          metadata: {},
        })
        .returning();
      restaurant = newRest;
    }

    const existing = await this.db.query.listItems.findFirst({
      where: and(
        eq(listItems.listId, listId),
        eq(listItems.restaurantId, restaurantId)
      ),
    });
    if (existing) {
      throw new ConflictError("Restaurant already in list");
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
      restaurantId,
      orderIndex: nextOrder,
    });

    await this.syncListCities(listId);
  }

  async removeItem(listId: string, userId: string, restaurantId: string): Promise<void> {
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
          eq(listItems.restaurantId, restaurantId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new NotFoundError("Item not found in list");
    }

    await this.syncListCities(listId);
  }

  async reorderItems(listId: string, userId: string, restaurantIds: string[]): Promise<void> {
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

    const currentRestaurantIds = currentItems.map(i => i.restaurantId);

    const hasMismatch = restaurantIds.length !== currentRestaurantIds.length || restaurantIds.some(id => !currentRestaurantIds.includes(id));
    if (hasMismatch) {
      throw new ValidationError("Invalid restaurant ids for reordering.");
    }

    await this.db.transaction(async (tx) => {
      for (let idx = 0; idx < restaurantIds.length; idx++) {
        const restaurantId = restaurantIds[idx];
        await tx
          .update(listItems)
          .set({ orderIndex: idx })
          .where(
            and(
              eq(listItems.listId, listId),
              eq(listItems.restaurantId, restaurantId)
            )
          );
      }
    });
  }

  // ===== Likes Layer =====

  async like(userId: string, listId: string): Promise<string> {
    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });
    if (!list) {
      throw new NotFoundError("List not found");
    }

    const existing = await this.db.query.listLikes.findFirst({
      where: and(
        eq(listLikes.userId, userId),
        eq(listLikes.listId, listId)
      ),
    });
    if (existing) {
      return list.userId;
    }

    await this.db.insert(listLikes).values({
      userId,
      listId,
    });
    return list.userId;
  }

  async unlike(userId: string, listId: string): Promise<string> {
    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });
    if (!list) {
      throw new NotFoundError("List not found");
    }

    await this.db
      .delete(listLikes)
      .where(
        and(
          eq(listLikes.userId, userId),
          eq(listLikes.listId, listId)
        )
      );
    return list.userId;
  }

  // ===== Global retrieval =====

  async listAll(type: "my" | "public" | "friends", userId: string, city?: string): Promise<ListResponse[]> {
    const queryConditions = [];

    if (type === "my") {
      const userCollabLists = await this.db
        .select({ listId: listCollaborators.listId })
        .from(listCollaborators)
        .where(eq(listCollaborators.userId, userId));
      
      const collabListIds = userCollabLists.map(c => c.listId);
      
      if (collabListIds.length > 0) {
        queryConditions.push(
          or(
            eq(lists.userId, userId),
            inArray(lists.id, collabListIds)
          )
        );
      } else {
        queryConditions.push(eq(lists.userId, userId));
      }
    } else if (type === "public") {
      queryConditions.push(eq(lists.visibility, "public"));
    } else if (type === "friends") {
      const followers = this.db
        .select({ id: follows.followingId })
        .from(follows)
        .where(eq(follows.followerId, userId))
        .as("followers");

      const mutualFriends = await this.db
        .select({ friendId: follows.followerId })
        .from(follows)
        .innerJoin(followers, eq(follows.followerId, followers.id))
        .where(eq(follows.followingId, userId));
      
      const friendIds = mutualFriends.map(f => f.friendId);
      if (friendIds.length === 0) {
        return [];
      }

      queryConditions.push(
        and(
          inArray(lists.userId, friendIds),
          inArray(lists.visibility, ["public", "friends"])
        )
      );
    }

    if (city) {
      const searchPattern = `%${city.trim()}%`;
      queryConditions.push(
        sql`EXISTS (
          SELECT 1 
          FROM jsonb_array_elements_text(COALESCE(${lists.metadata}->'cities', '[]'::jsonb)) AS c 
          WHERE c ILIKE ${searchPattern}
        )`
      );
    }

    const fetchedLists = await this.db
      .select()
      .from(lists)
      .where(and(...queryConditions))
      .orderBy(desc(lists.createdAt));

    return this.mapListRowsToResponses(fetchedLists, userId);
  }

  async listByCity(
    cityName: string,
    viewerId?: string,
    filter: "public" | "following" = "public"
  ): Promise<ListResponse[]> {
    const searchPattern = `%${cityName.trim()}%`;
    const queryConditions = [
      sql`EXISTS (
        SELECT 1 
        FROM jsonb_array_elements_text(COALESCE(${lists.metadata}->'cities', '[]'::jsonb)) AS c 
        WHERE c ILIKE ${searchPattern}
      )`
    ];

    if (filter === "following") {
      if (!viewerId) {
        return [];
      }
      const followingRows = await this.db
        .select({ id: follows.followingId })
        .from(follows)
        .where(eq(follows.followerId, viewerId));
      const followingIds = followingRows.map((r) => r.id);
      if (followingIds.length === 0) {
        return [];
      }
      queryConditions.push(
        inArray(lists.userId, followingIds),
        inArray(lists.visibility, ["public", "friends"])
      );
    } else {
      const visibilities = viewerId ? ["public", "friends"] : ["public"];
      queryConditions.push(
        inArray(lists.visibility, visibilities)
      );
    }

    const fetchedLists = await this.db
      .select()
      .from(lists)
      .where(and(...queryConditions))
      .orderBy(desc(lists.createdAt));

    return this.mapListRowsToResponses(fetchedLists, viewerId);
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

    return this.mapListRowsToResponses(userLists, viewerId);
  }

  private async mapListRowsToResponses(fetchedLists: any[], viewerId?: string): Promise<ListResponse[]> {
    if (fetchedLists.length === 0) return [];
    const listIds = fetchedLists.map((l) => l.id);

    const creatorIds = Array.from(new Set(fetchedLists.map((l) => l.userId)));
    const creators = await this.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(inArray(users.id, creatorIds));
    const creatorMap = new Map(creators.map((c) => [c.id, c]));

    const itemCounts = await this.db
      .select({
        listId: listItems.listId,
        count: sql<number>`count(*)::int`,
      })
      .from(listItems)
      .where(inArray(listItems.listId, listIds))
      .groupBy(listItems.listId);
    const itemCountMap = new Map<string, number>(itemCounts.map((c) => [c.listId, c.count]));

    const likeCounts = await this.db
      .select({
        listId: listLikes.listId,
        count: sql<number>`count(*)::int`,
      })
      .from(listLikes)
      .where(inArray(listLikes.listId, listIds))
      .groupBy(listLikes.listId);
    const likeCountMap = new Map<string, number>(likeCounts.map((c) => [c.listId, c.count]));

    let likedListIds = new Set<string>();
    if (viewerId) {
      const viewerLikes = await this.db
        .select({ listId: listLikes.listId })
        .from(listLikes)
        .where(
          and(
            eq(listLikes.userId, viewerId),
            inArray(listLikes.listId, listIds)
          )
        );
      likedListIds = new Set(viewerLikes.map((l) => l.listId));
    }

    const collaboratorsRows = await this.db
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
      .where(inArray(listCollaborators.listId, listIds));

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

    return fetchedLists.map((list) => {
      const creator = creatorMap.get(list.userId);
      const colabs = collaboratorsMap.get(list.id) || [];
      return {
        id: list.id,
        user: {
          id: creator?.id ?? "",
          username: creator?.username ?? "",
          display_name: creator?.displayName ?? null,
          avatar_url: creator?.avatarUrl ?? null,
        },
        title: list.title,
        description: list.description,
        visibility: list.visibility as "public" | "friends" | "private",
        cover_image_url: list.coverImageUrl,
        item_count: itemCountMap.get(list.id) ?? 0,
        likes_count: likeCountMap.get(list.id) ?? 0,
        is_liked: likedListIds.has(list.id),
        collaborators: colabs,
        is_collaborative: colabs.length > 0,
        metadata: list.metadata,
        created_at: list.createdAt.toISOString(),
      };
    });
  }

  private async syncListCities(listId: string): Promise<string[]> {
    const items = await this.db
      .select({ city: restaurants.city })
      .from(listItems)
      .innerJoin(restaurants, eq(listItems.restaurantId, restaurants.googlePlaceId))
      .where(eq(listItems.listId, listId));

    const uniqueCities = Array.from(new Set(
      items
        .map(item => item.city)
        .filter(Boolean)
        .map(city => normalizeCityName(city))
    ));

    const list = await this.db.query.lists.findFirst({
      where: eq(lists.id, listId),
    });

    if (list) {
      const currentMetadata = list.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        cities: uniqueCities,
      };

      await this.db
        .update(lists)
        .set({
          metadata: updatedMetadata,
          updatedAt: new Date(),
        })
        .where(eq(lists.id, listId));

      const entry = await this.db.query.tasteEntries.findFirst({
        where: eq(tasteEntries.listId, listId),
      });
      if (entry) {
        await this.db
          .update(tasteEntries)
          .set({
            city: uniqueCities[0] || "Various",
            metadata: {
              ...entry.metadata,
              cities: uniqueCities,
            }
          })
          .where(eq(tasteEntries.id, entry.id));
      }
    }

    return uniqueCities;
  }
}
