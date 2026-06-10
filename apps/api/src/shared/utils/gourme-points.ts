import { users, follows, tasteEntries } from "@tastebook/db";
import { eq, sql, and, inArray } from "drizzle-orm";

/**
 * Recalculates and updates the Gourmet Points (GP) of a user.
 * Can be run inside an existing transaction by passing the transaction client.
 * 
 * @param db Drizzle database client or transaction context
 * @param userId ID of the user whose GP is to be recalculated
 * @returns The new GP score of the user
 */
export async function recalculateUserGP(db: any, userId: string): Promise<number> {
  // 1. Calculate Follower Points (diminishing returns: 15 * sqrt(followers))
  const [followerCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followingId, userId));

  const followerCount = followerCountResult?.count ?? 0;
  const followerPoints = Math.round(15 * Math.sqrt(followerCount));

  // 2. Fetch all public/friends visible taste entries for this user, with counts of media, likes, and external comments
  const entriesWithStats = await db
    .select({
      id: tasteEntries.id,
      notes: tasteEntries.notes,
      ratingAmbience: tasteEntries.ratingAmbience,
      ratingTaste: tasteEntries.ratingTaste,
      ratingService: tasteEntries.ratingService,
      ratingValue: tasteEntries.ratingValue,
      mediaCount: sql<number>`(SELECT COALESCE(count(*), 0)::int FROM entry_media WHERE entry_media.entry_id = taste_entries.id)`,
      likesCount: sql<number>`(SELECT COALESCE(count(*), 0)::int FROM entry_likes WHERE entry_likes.entry_id = taste_entries.id)`,
      commentsCount: sql<number>`(
        SELECT COALESCE(count(*), 0)::int 
        FROM entry_comments 
        WHERE entry_comments.entry_id = taste_entries.id AND entry_comments.user_id != ${userId}
      )`
    })
    .from(tasteEntries)
    .where(
      and(
        eq(tasteEntries.userId, userId),
        inArray(tasteEntries.visibility, ["public", "friends"])
      )
    );

  // 3. Compute the total GP for reviews
  let reviewPointsTotal = 0;

  for (const entry of entriesWithStats) {
    let entryPoints = 5; // Base GP per review

    // Sub-ratings completeness (+1 GP each)
    if (entry.ratingAmbience !== null && entry.ratingAmbience !== undefined) entryPoints += 1;
    if (entry.ratingTaste !== null && entry.ratingTaste !== undefined) entryPoints += 1;
    if (entry.ratingService !== null && entry.ratingService !== undefined) entryPoints += 1;
    if (entry.ratingValue !== null && entry.ratingValue !== undefined) entryPoints += 1;

    // Detailed notes text (+2 GP if note length is > 100 characters)
    if (entry.notes && entry.notes.trim().length > 100) {
      entryPoints += 2;
    }

    // Media bonus (+2 GP per photo, capped at +6 GP)
    const mediaCount = entry.mediaCount ?? 0;
    entryPoints += Math.min(6, mediaCount * 2);

    // Likes received (+1 GP each)
    const likesCount = entry.likesCount ?? 0;
    entryPoints += likesCount * 1;

    // Comments from other users (+2 GP each)
    const commentsCount = entry.commentsCount ?? 0;
    entryPoints += commentsCount * 2;

    reviewPointsTotal += entryPoints;
  }

  const finalGP = followerPoints + reviewPointsTotal;

  // 4. Update the user's denormalized GP field in the database
  await db
    .update(users)
    .set({ gourmePoints: finalGP, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return finalGP;
}
