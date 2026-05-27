import { createDb, users, follows } from "@tastebook/db";
import { eq, and, or, sql, lt, desc, aliasedTable } from "drizzle-orm";
import { NotFoundError, ValidationError, ConflictError } from "../../shared/errors";
import { encodeCursor, decodeCursor } from "../../shared/utils/cursor";
import type { UserResponse, PaginatedResponse } from "@tastebook/shared/api-types";

export class SocialService {
  constructor(private db: ReturnType<typeof createDb>) {}

  async follow(followerId: string, targetId: string): Promise<void> {
    if (followerId === targetId) {
      throw new ValidationError("Cannot follow yourself");
    }
    const targetUser = await this.db.query.users.findFirst({
      where: eq(users.id, targetId),
    });
    if (!targetUser) {
      throw new NotFoundError("User not found");
    }
    const res = await this.db
      .insert(follows)
      .values({
        followerId,
        followingId: targetId,
      })
      .onConflictDoNothing()
      .returning();
    if (res.length === 0) {
      throw new ConflictError("Already following");
    }
  }

  async unfollow(followerId: string, targetId: string): Promise<void> {
    const res = await this.db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, targetId)
        )
      )
      .returning();
    if (res.length === 0) {
      throw new NotFoundError("Not following this user");
    }
  }

  async isFollowing(followerId: string, targetId: string): Promise<boolean> {
    const [res] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, targetId)
        )
      );
    return (res?.count ?? 0) > 0;
  }

  async areFriends(userA: string, userB: string): Promise<boolean> {
    const [res] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .where(
        or(
          and(eq(follows.followerId, userA), eq(follows.followingId, userB)),
          and(eq(follows.followerId, userB), eq(follows.followingId, userA))
        )
      );
    return (res?.count ?? 0) === 2;
  }

  async getFollowerCount(userId: string): Promise<number> {
    const [res] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followingId, userId));
    return res?.count ?? 0;
  }

  async getFollowingCount(userId: string): Promise<number> {
    const [res] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followerId, userId));
    return res?.count ?? 0;
  }

  private async mapUsersToResponses(targetUsers: (typeof users.$inferSelect)[], viewerId?: string): Promise<UserResponse[]> {
    if (targetUsers.length === 0) return [];
    
    return Promise.all(
      targetUsers.map(async (u) => {
        const followerCount = await this.getFollowerCount(u.id);
        const followingCount = await this.getFollowingCount(u.id);
        
        const response: UserResponse = {
          id: u.id,
          username: u.username,
          display_name: u.displayName,
          avatar_url: u.avatarUrl,
          bio: u.bio,
          created_at: u.createdAt.toISOString(),
          follower_count: followerCount,
          following_count: followingCount,
        };
        
        if (viewerId) {
          response.is_following = await this.isFollowing(viewerId, u.id);
          response.is_friend = await this.areFriends(viewerId, u.id);
        } else {
          response.is_following = false;
          response.is_friend = false;
        }
        
        return response;
      })
    );
  }

  async getFollowers(userId: string, cursor?: string, limit = 20, viewerId?: string): Promise<PaginatedResponse<UserResponse>> {
    const userExists = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!userExists) {
      throw new NotFoundError("User not found");
    }

    let cursorCondition;
    if (cursor) {
      const { timestamp: cursorTs, id: cursorId } = decodeCursor(cursor);
      cursorCondition = or(
        lt(follows.createdAt, new Date(cursorTs)),
        and(
          eq(follows.createdAt, new Date(cursorTs)),
          lt(users.id, cursorId)
        )
      );
    }

    const conditions = [eq(follows.followingId, userId)];
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const results = await this.db
      .select({
        user: users,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .where(and(...conditions))
      .orderBy(desc(follows.createdAt), desc(users.id))
      .limit(limit + 1);

    const hasNextPage = results.length > limit;
    const itemsToReturn = hasNextPage ? results.slice(0, limit) : results;
    
    const data = await this.mapUsersToResponses(
      itemsToReturn.map(r => r.user),
      viewerId
    );
    
    let nextCursor: string | undefined;
    if (hasNextPage && itemsToReturn.length > 0) {
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      nextCursor = encodeCursor(lastItem.followedAt, lastItem.user.id);
    }
    
    return {
      data,
      cursor: nextCursor,
    };
  }

  async getFollowing(userId: string, cursor?: string, limit = 20, viewerId?: string): Promise<PaginatedResponse<UserResponse>> {
    const userExists = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!userExists) {
      throw new NotFoundError("User not found");
    }

    let cursorCondition;
    if (cursor) {
      const { timestamp: cursorTs, id: cursorId } = decodeCursor(cursor);
      cursorCondition = or(
        lt(follows.createdAt, new Date(cursorTs)),
        and(
          eq(follows.createdAt, new Date(cursorTs)),
          lt(users.id, cursorId)
        )
      );
    }

    const conditions = [eq(follows.followerId, userId)];
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const results = await this.db
      .select({
        user: users,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followingId, users.id))
      .where(and(...conditions))
      .orderBy(desc(follows.createdAt), desc(users.id))
      .limit(limit + 1);

    const hasNextPage = results.length > limit;
    const itemsToReturn = hasNextPage ? results.slice(0, limit) : results;
    
    const data = await this.mapUsersToResponses(
      itemsToReturn.map(r => r.user),
      viewerId
    );
    
    let nextCursor: string | undefined;
    if (hasNextPage && itemsToReturn.length > 0) {
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      nextCursor = encodeCursor(lastItem.followedAt, lastItem.user.id);
    }
    
    return {
      data,
      cursor: nextCursor,
    };
  }

  async getFriends(userId: string, cursor?: string, limit = 20, viewerId?: string): Promise<PaginatedResponse<UserResponse>> {
    const userExists = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!userExists) {
      throw new NotFoundError("User not found");
    }

    const f1 = aliasedTable(follows, "f1");
    const f2 = aliasedTable(follows, "f2");

    let cursorCondition;
    if (cursor) {
      const { timestamp: cursorTs, id: cursorId } = decodeCursor(cursor);
      cursorCondition = or(
        lt(f1.createdAt, new Date(cursorTs)),
        and(
          eq(f1.createdAt, new Date(cursorTs)),
          lt(users.id, cursorId)
        )
      );
    }

    const conditions = [
      eq(f1.followerId, userId),
      eq(f2.followingId, userId)
    ];
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const results = await this.db
      .select({
        user: users,
        followedAt: f1.createdAt,
      })
      .from(users)
      .innerJoin(f1, and(eq(f1.followingId, users.id), eq(f1.followerId, userId)))
      .innerJoin(f2, and(eq(f2.followerId, users.id), eq(f2.followingId, userId)))
      .where(and(...conditions))
      .orderBy(desc(f1.createdAt), desc(users.id))
      .limit(limit + 1);

    const hasNextPage = results.length > limit;
    const itemsToReturn = hasNextPage ? results.slice(0, limit) : results;
    
    const data = await this.mapUsersToResponses(
      itemsToReturn.map(r => r.user),
      viewerId
    );
    
    let nextCursor: string | undefined;
    if (hasNextPage && itemsToReturn.length > 0) {
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      nextCursor = encodeCursor(lastItem.followedAt, lastItem.user.id);
    }
    
    return {
      data,
      cursor: nextCursor,
    };
  }
}
