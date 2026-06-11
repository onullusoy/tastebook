import { pgTable, uuid, varchar, text, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users";

export const lists = pgTable("lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: varchar("description", { length: 1000 }),
  visibility: varchar("visibility", { length: 20 }).default("public").notNull(),
  coverImageUrl: text("cover_image_url"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    idxListsUser: index("idx_lists_user").on(table.userId, table.createdAt),
  };
});
