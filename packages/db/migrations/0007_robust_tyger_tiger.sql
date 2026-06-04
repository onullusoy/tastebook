CREATE INDEX IF NOT EXISTS "idx_comments_entry" ON "entry_comments" ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comments_user" ON "entry_comments" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_likes_entry" ON "entry_likes" ("entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entries_city_place" ON "taste_entries" ("city","google_place_id");