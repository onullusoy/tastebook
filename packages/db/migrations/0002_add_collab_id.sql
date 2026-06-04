ALTER TABLE "list_collaborators" DROP CONSTRAINT IF EXISTS "list_collaborators_list_id_user_id_pk";
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD CONSTRAINT "list_collaborators_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_list_collaborators_unique" ON "list_collaborators" ("list_id", "user_id");
