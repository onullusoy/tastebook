CREATE TABLE IF NOT EXISTS "comment_likes" (
	"user_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comment_likes_user_id_comment_id_pk" PRIMARY KEY("user_id","comment_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_entry_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."entry_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_likes_comment" ON "comment_likes" ("comment_id");