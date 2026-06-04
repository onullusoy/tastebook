import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { lists } from "./lists";
import { users } from "./users";

export const listCollaborators = pgTable("list_collaborators", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").references(() => lists.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: varchar("role", { length: 20 }).default("contributor").notNull(), // 'contributor' | 'editor'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    uniqueListUser: uniqueIndex("idx_list_collaborators_unique").on(table.listId, table.userId),
    idxCollabUser: index("idx_list_collaborators_user").on(table.userId),
  };
});
