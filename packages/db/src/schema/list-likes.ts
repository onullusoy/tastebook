import { pgTable, uuid, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { lists } from "./lists";

export const listLikes = pgTable("list_likes", {
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  listId: uuid("list_id")
    .references(() => lists.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.listId] }),
  idxLikesList: index("idx_likes_list").on(table.listId),
}));
