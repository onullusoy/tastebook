import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { tasteEntries } from "./taste-entries";

export const entryComments = pgTable("entry_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id")
    .references(() => tasteEntries.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  idxCommentsEntry: index("idx_comments_entry").on(table.entryId, table.createdAt),
  idxCommentsUser: index("idx_comments_user").on(table.userId),
}));

