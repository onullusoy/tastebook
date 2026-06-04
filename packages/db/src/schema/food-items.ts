import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { tasteEntries } from "./taste-entries";

export const foodItems = pgTable("food_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id").references(() => tasteEntries.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  notes: varchar("notes", { length: 500 }),
  orderIndex: integer("order_index").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    idxFoodItemsEntry: index("idx_food_items_entry").on(table.entryId, table.orderIndex),
  };
});
