DROP INDEX "idx_media_orphan";--> statement-breakpoint
ALTER TABLE "taste_entries" ALTER COLUMN "atmosphere_tags" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "restaurants" ALTER COLUMN "atmosphere_tags" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gourme_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_media_orphan" ON "entry_media" USING btree ("user_id","created_at") WHERE "entry_media"."entry_id" IS NULL;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "check_self_follow" CHECK ("follows"."follower_id" <> "follows"."following_id");