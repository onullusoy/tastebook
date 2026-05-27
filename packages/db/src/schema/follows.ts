import { pgTable, uuid, timestamp, primaryKey, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const follows = pgTable("follows", {
  followerId: uuid("follower_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  followingId: uuid("following_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.followerId, table.followingId] }),
    checkSelfFollow: check("check_self_follow", sql`${table.followerId} <> ${table.followingId}`),
    idxFollowsFollower: index("idx_follows_follower").on(table.followerId, table.followingId),
    idxFollowsFollowing: index("idx_follows_following").on(table.followingId, table.followerId),
  };
});
