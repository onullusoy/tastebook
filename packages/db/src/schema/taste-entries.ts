import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const tasteEntries = pgTable("taste_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  dishName: varchar("dish_name", { length: 200 }).notNull(),
  restaurantName: varchar("restaurant_name", { length: 200 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  priceLevel: integer("price_level"),
  rating: integer("rating").notNull(),
  notes: varchar("notes", { length: 2000 }),
  visibility: varchar("visibility", { length: 20 }).default("public").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    idxEntriesUserCreated: index("idx_entries_user_created").on(table.userId, table.createdAt, table.id),
    idxEntriesCreated: index("idx_entries_created").on(table.createdAt, table.id),
    idxEntriesVisibility: index("idx_entries_visibility").on(table.visibility, table.createdAt),
  };
});
