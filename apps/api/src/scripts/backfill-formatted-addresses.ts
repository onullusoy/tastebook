import { createDb, tasteEntries } from "@tastebook/db";
import { isNull, sql } from "drizzle-orm";
import { z } from "zod";

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

  console.log("Starting backfill for legacy formatted addresses...");

  await db.update(tasteEntries)
    .set({
      formattedAddress: sql`${tasteEntries.restaurantName} || ', ' || ${tasteEntries.city} || ', ' || ${tasteEntries.country}`
    })
    .where(isNull(tasteEntries.formattedAddress));

  console.log("Backfill completed successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error during backfill:", err);
  process.exit(1);
});
