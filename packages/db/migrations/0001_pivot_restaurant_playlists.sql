DELETE FROM "list_items";
--> statement-breakpoint
CREATE TABLE "list_likes" (
	"user_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "list_likes_user_id_list_id_pk" PRIMARY KEY("user_id","list_id")
);
--> statement-breakpoint
ALTER TABLE "list_items" DROP CONSTRAINT IF EXISTS "list_items_entry_id_taste_entries_id_fk";
--> statement-breakpoint
ALTER TABLE "list_items" DROP COLUMN IF EXISTS "entry_id";
--> statement-breakpoint
ALTER TABLE "list_items" ADD COLUMN "restaurant_id" varchar(255) NOT NULL;
--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_restaurant_id_restaurants_google_place_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("google_place_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_list_items_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_list_items_unique" ON "list_items" USING btree ("list_id","restaurant_id");
--> statement-breakpoint
ALTER TABLE "list_likes" ADD CONSTRAINT "list_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "list_likes" ADD CONSTRAINT "list_likes_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_likes_list" ON "list_likes" USING btree ("list_id");