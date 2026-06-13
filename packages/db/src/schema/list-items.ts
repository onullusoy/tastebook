import { pgTable, uuid, integer, timestamp, index, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { lists } from "./lists";
import { restaurants } from "./restaurants";

export const listItems = pgTable("list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").references(() => lists.id, { onDelete: "cascade" }).notNull(),
  restaurantId: varchar("restaurant_id", { length: 255 })
    .references(() => restaurants.googlePlaceId, { onDelete: "cascade" })
    .notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    idxListItemsList: index("idx_list_items_list").on(table.listId, table.orderIndex),
    uniqueListRestaurant: uniqueIndex("idx_list_items_unique").on(table.listId, table.restaurantId),
  };
});
