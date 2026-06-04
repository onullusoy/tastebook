CREATE TABLE IF NOT EXISTS "food_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"notes" varchar(500),
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "list_collaborators" (
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'contributor' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "list_collaborators_list_id_user_id_pk" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "taste_entries" DROP COLUMN IF EXISTS "dish_name";
--> statement-breakpoint
ALTER TABLE "taste_entries" ADD COLUMN IF NOT EXISTS "atmosphere_tags" text[] DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE "taste_entries" ADD COLUMN "rating_ambience" integer;
--> statement-breakpoint
ALTER TABLE "taste_entries" ADD COLUMN "rating_taste" integer;
--> statement-breakpoint
ALTER TABLE "taste_entries" ADD COLUMN "rating_service" integer;
--> statement-breakpoint
ALTER TABLE "taste_entries" ADD COLUMN "rating_value" integer;
--> statement-breakpoint
ALTER TABLE "taste_entries" ADD COLUMN "list_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_items" ADD CONSTRAINT "food_items_entry_id_taste_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."taste_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "list_collaborators" ADD CONSTRAINT "list_collaborators_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "list_collaborators" ADD CONSTRAINT "list_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taste_entries" ADD CONSTRAINT "taste_entries_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_food_items_entry" ON "food_items" ("entry_id","order_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_list_collaborators_user" ON "list_collaborators" ("user_id");