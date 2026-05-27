import { pgTable, uuid, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { lists } from "./lists";
import { tasteEntries } from "./taste-entries";

export const listItems = pgTable("list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").references(() => lists.id, { onDelete: "cascade" }).notNull(),
  entryId: uuid("entry_id").references(() => tasteEntries.id, { onDelete: "cascade" }).notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    idxListItemsList: index("idx_list_items_list").on(table.listId, table.orderIndex),
    uniqueListEntry: uniqueIndex("idx_list_items_unique").on(table.listId, table.entryId),
  };
});
