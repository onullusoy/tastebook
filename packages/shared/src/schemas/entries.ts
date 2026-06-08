import { z } from "zod";

export const ATMOSPHERE_TAGS = [
  "romantic",
  "local",
  "luxury",
  "student-friendly",
  "family-friendly",
  "casual",
  "fine-dining",
  "cozy",
  "trendy",
  "outdoor",
  "rooftop",
  "historic",
  "live-music",
  "pet-friendly",
] as const;

export type AtmosphereTag = typeof ATMOSPHERE_TAGS[number];

const subRating = z.number().int().min(0).max(10).optional();

export const foodItemSchema = z.object({
  name: z.string().min(1).max(200),
  notes: z.string().max(500).optional(),
});

export const createEntrySchema = z.object({
  // Location (all required)
  restaurant_name: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  country: z.string().min(1).max(100),

  // Google Places API Integration (optional)
  google_place_id: z.string().max(255).optional(),
  session_token: z.string().uuid().optional(),
  formatted_address: z.string().max(500).optional(),

  // Atmosphere tags (multiple choice)
  atmosphere_tags: z.array(z.enum(ATMOSPHERE_TAGS)).default([]),

  // Pricing (required, 1-5)
  price_level: z.number().int().min(1).max(5),

  // Ratings
  rating: z.number().int().min(0).max(10),           // overall (required)
  rating_ambience: subRating,
  rating_taste: subRating,
  rating_service: subRating,
  rating_value: subRating,

  // Food items (optional)
  food_items: z.array(foodItemSchema).min(0).max(20).default([]),

  // Commentary
  notes: z.string().max(2000).optional(),

  // Privacy
  visibility: z.enum(["public", "friends", "private"]).default("public"),

  // Media
  media_ids: z.array(z.string().uuid()).max(5).default([]),

  // Optional list association
  list_id: z.string().uuid().optional(),
});

export const updateEntrySchema = createEntrySchema
  .partial()
  .omit({ media_ids: true, food_items: true })
  .extend({
    // food_items on update: provide full replacement array (optional)
    food_items: z.array(foodItemSchema).min(0).max(20).optional(),
  });

export type CreateEntryRequest = z.infer<typeof createEntrySchema>;
export type UpdateEntryRequest = z.infer<typeof updateEntrySchema>;
export type FoodItemInput = z.infer<typeof foodItemSchema>;

export const cityFeedQuerySchema = z.object({
  scope: z.enum(["following", "public"]).default("following"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CityFeedQuery = z.infer<typeof cityFeedQuerySchema>;

export const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export type CreateCommentRequest = z.infer<typeof createCommentSchema>;


