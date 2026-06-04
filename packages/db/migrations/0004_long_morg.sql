CREATE TABLE IF NOT EXISTS "restaurants" (
	"google_place_id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"city" varchar(100) NOT NULL,
	"country" varchar(100) NOT NULL,
	"rating_avg" numeric(3, 1) DEFAULT '0.0' NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"price_level_avg" numeric(2, 1) DEFAULT '0.0' NOT NULL,
	"atmosphere_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "restaurants" ("google_place_id", "name", "city", "country", "rating_avg", "rating_count", "price_level_avg", "atmosphere_tags")
SELECT DISTINCT ON (google_place_id)
  google_place_id,
  restaurant_name,
  city,
  country,
  '0.0'::numeric(3,1),
  0,
  '0.0'::numeric(2,1),
  '{}'::text[]
FROM taste_entries
WHERE google_place_id IS NOT NULL
ON CONFLICT (google_place_id) DO NOTHING;
--> statement-breakpoint
UPDATE "restaurants" r
SET
  rating_count = sub.cnt,
  rating_avg = ROUND(sub.avg_rating, 1),
  price_level_avg = ROUND(sub.avg_price, 1)
FROM (
  SELECT
    google_place_id,
    COUNT(*) as cnt,
    AVG(rating) as avg_rating,
    AVG(price_level) as avg_price
  FROM taste_entries
  WHERE google_place_id IS NOT NULL
  GROUP BY google_place_id
) sub
WHERE r.google_place_id = sub.google_place_id;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taste_entries" ADD CONSTRAINT "taste_entries_google_place_id_restaurants_google_place_id_fk" FOREIGN KEY ("google_place_id") REFERENCES "public"."restaurants"("google_place_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
