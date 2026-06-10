import { createDb, users } from "@tastebook/db";
import { z } from "zod";
import { recalculateUserGP } from "../shared/utils/gourme-points";

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
});

async function main() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.errors);
    process.exit(1);
  }
  const config = result.data;

  const db = createDb(config.DATABASE_URL);

  console.log("Fetching all users in the database...");
  const allUsers = await db.select({ id: users.id, username: users.username }).from(users);
  console.log(`Found ${allUsers.length} users. Starting Gourmet Points backfill...`);

  let successCount = 0;
  for (const user of allUsers) {
    try {
      const newGP = await recalculateUserGP(db, user.id);
      console.log(`Successfully backfilled GP for ${user.username} (${user.id}): ${newGP} GP`);
      successCount++;
    } catch (err) {
      console.error(`Failed to backfill GP for user ${user.username} (${user.id}):`, err);
    }
  }

  console.log(`Backfill completed. Successfully processed ${successCount}/${allUsers.length} users.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error during GP backfill:", err);
  process.exit(1);
});
