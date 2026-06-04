import { pgTable, uuid, varchar, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { lists } from "./lists";
import { restaurants } from "./restaurants";

export const tasteEntries = pgTable("taste_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),

  // Location (all required)
  restaurantName: varchar("restaurant_name", { length: 200 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),

  // Atmosphere (multiple choice — stored as text array)
  atmosphereTags: text("atmosphere_tags").array().default([]),

  // Pricing (required, 1-5)
  priceLevel: integer("price_level").notNull(),

  // Ratings
  rating: integer("rating").notNull(),              // overall 0-10 (required)
  ratingAmbience: integer("rating_ambience"),        // 0-10 optional sub-rating
  ratingTaste: integer("rating_taste"),              // 0-10 optional sub-rating
  ratingService: integer("rating_service"),          // 0-10 optional sub-rating
  ratingValue: integer("rating_value"),              // 0-10 optional sub-rating

  // Commentary
  notes: varchar("notes", { length: 2000 }),

  // Privacy
  visibility: varchar("visibility", { length: 20 }).default("public").notNull(),

  // Direct list association (optional)
  listId: uuid("list_id").references(() => lists.id, { onDelete: "set null" }),

  // Google Places API Integration (nullable)
  googlePlaceId: varchar("google_place_id", { length: 255 }).references(() => restaurants.googlePlaceId, { onDelete: "set null" }),
  formattedAddress: varchar("formatted_address", { length: 500 }),

  // Denormalized engagement counters
  likesCount: integer("likes_count").default(0).notNull(),
  commentsCount: integer("comments_count").default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    idxEntriesUserCreated: index("idx_entries_user_created").on(table.userId, table.createdAt, table.id),
    idxEntriesCreated: index("idx_entries_created").on(table.createdAt, table.id),
    idxEntriesVisibility: index("idx_entries_visibility").on(table.visibility, table.createdAt),
    idxEntriesCity: index("idx_entries_city").on(table.city, table.createdAt),
    idxEntriesListId: index("idx_entries_list_id").on(table.listId),
    idxEntriesGooglePlaceId: index("idx_entries_google_place_id").on(table.googlePlaceId),
    idxEntriesCityPlace: index("idx_entries_city_place").on(table.city, table.googlePlaceId),
  };
});
