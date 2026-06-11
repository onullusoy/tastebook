import { pgTable, varchar, text, integer, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";

export const restaurants = pgTable("restaurants", {
  googlePlaceId: varchar("google_place_id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }).default("").notNull(),

  // Cached aggregations
  ratingAvg: numeric("rating_avg", { precision: 3, scale: 1 }).default("0.0").notNull(),
  ratingCount: integer("rating_count").default(0).notNull(),
  priceLevelAvg: numeric("price_level_avg", { precision: 2, scale: 1 }).default("0.0").notNull(),
  atmosphereTags: text("atmosphere_tags").array().default([]).notNull(),

  metadata: jsonb("metadata").$type<Record<string, any>>().default({}).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
