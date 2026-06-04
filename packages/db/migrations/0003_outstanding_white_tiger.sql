ALTER TABLE "taste_entries" ADD COLUMN IF NOT EXISTS "google_place_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "taste_entries" ADD COLUMN IF NOT EXISTS "formatted_address" varchar(500);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entries_google_place_id" ON "taste_entries" USING btree ("google_place_id");