CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_restaurants_name_trgm ON "restaurants" USING GiST (name gist_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_restaurants_city_lower ON "restaurants" (lower(city));
