import { pgTable, uuid, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { tasteEntries } from "./taste-entries";

export const entryLikes = pgTable("entry_likes", {
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  entryId: uuid("entry_id")
    .references(() => tasteEntries.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.entryId] }),
  idxLikesEntry: index("idx_likes_entry").on(table.entryId),
}));

