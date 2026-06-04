import { pgTable, uuid, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entryComments } from "./entry-comments";

export const commentLikes = pgTable("comment_likes", {
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  commentId: uuid("comment_id")
    .references(() => entryComments.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.commentId] }),
  idxLikesComment: index("idx_likes_comment").on(table.commentId),
}));
