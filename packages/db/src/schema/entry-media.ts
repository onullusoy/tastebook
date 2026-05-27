import { pgTable, uuid, varchar, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { tasteEntries } from "./taste-entries";

export const entryMedia = pgTable("entry_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id").references(() => tasteEntries.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  url: text("url").notNull(),
  mimeType: varchar("mime_type", { length: 50 }),
  sizeBytes: integer("size_bytes"),
  orderIndex: integer("order_index").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    idxMediaEntry: index("idx_media_entry").on(table.entryId, table.orderIndex),
    idxMediaOrphan: index("idx_media_orphan")
      .on(table.userId, table.createdAt)
      .where(sql`${table.entryId} IS NULL`),
  };
});
