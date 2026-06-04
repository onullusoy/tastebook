import { createDb, entryMedia, users } from "@tastebook/db";
import { eq, and, ne, isNotNull } from "drizzle-orm";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import sharp from "sharp";
import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.preprocess((val) => Number(val), z.number()),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET: z.string(),
  MINIO_USE_SSL: z.preprocess((val) => val === "true" || val === true, z.boolean()),
});

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function objectExists(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function main() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.errors);
    process.exit(1);
  }
  const config = result.data;

  const db = createDb(config.DATABASE_URL);
  const s3 = new S3Client({
    endpoint: `http://${config.MINIO_ENDPOINT}:${config.MINIO_PORT}`,
    region: "us-east-1",
    credentials: {
      accessKeyId: config.MINIO_ACCESS_KEY,
      secretAccessKey: config.MINIO_SECRET_KEY,
    },
    forcePathStyle: true,
  });

  console.log("Starting legacy image optimization sweep...");

  // 1. Sweep entry_media
  const mediaRows = await db.select().from(entryMedia);
  console.log(`Found ${mediaRows.length} entry media records to check.`);

  for (const row of mediaRows) {
    try {
      const isWebp = row.mimeType === "image/webp" || row.url.endsWith(".webp");
      const thumbKey = row.url.replace(/\.webp$/, "_thumb.webp");
      const hasThumb = await objectExists(s3, config.MINIO_BUCKET, thumbKey);

      if (isWebp && hasThumb) {
        console.log(`[Media] Skip optimized: ${row.url}`);
        continue;
      }

      const mainExists = await objectExists(s3, config.MINIO_BUCKET, row.url);
      if (!mainExists) {
        console.warn(`[Media] Warning: Main file not found in S3, skipping: ${row.url}`);
        continue;
      }

      console.log(`[Media] Optimizing: ${row.url} (isWebp: ${isWebp}, hasThumb: ${hasThumb})`);

      // Download original
      const getObjRes = await s3.send(new GetObjectCommand({
        Bucket: config.MINIO_BUCKET,
        Key: row.url,
      }));
      if (!getObjRes.Body) {
        console.warn(`[Media] Empty body for ${row.url}, skipping.`);
        continue;
      }
      const originalBuffer = await streamToBuffer(getObjRes.Body as Readable);

      // Process
      const optimizedBuffer = await sharp(originalBuffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const thumbBuffer = await sharp(originalBuffer)
        .resize({ width: 400, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();

      // Determine keys
      const newKey = row.url.endsWith(".webp") ? row.url : `${row.url.substring(0, row.url.lastIndexOf("."))}.webp`;
      const newThumbKey = newKey.replace(/\.webp$/, "_thumb.webp");

      // Upload
      await Promise.all([
        s3.send(new PutObjectCommand({
          Bucket: config.MINIO_BUCKET,
          Key: newKey,
          Body: optimizedBuffer,
          ContentType: "image/webp",
        })),
        s3.send(new PutObjectCommand({
          Bucket: config.MINIO_BUCKET,
          Key: newThumbKey,
          Body: thumbBuffer,
          ContentType: "image/webp",
        })),
      ]);

      // Update DB
      await db.update(entryMedia).set({
        url: newKey,
        mimeType: "image/webp",
        sizeBytes: optimizedBuffer.length,
      }).where(eq(entryMedia.id, row.id));

      // Clean up old key if it was different
      if (newKey !== row.url) {
        await s3.send(new DeleteObjectCommand({
          Bucket: config.MINIO_BUCKET,
          Key: row.url,
        })).catch(() => {});
      }

      console.log(`[Media] Successfully optimized and generated thumbnail for ${row.url} -> ${newKey}`);
    } catch (err: any) {
      console.error(`[Media] Error processing row ${row.id} (${row.url}):`, err.message || err);
    }
  }

  // 2. Sweep user avatars
  const userRows = await db.select().from(users).where(isNotNull(users.avatarUrl));
  console.log(`Found ${userRows.length} users with avatars to check.`);

  const bucketInUrl = `/${config.MINIO_BUCKET}/`;

  for (const user of userRows) {
    if (!user.avatarUrl) continue;
    try {
      const isWebp = user.avatarUrl.endsWith(".webp");
      if (isWebp) {
        console.log(`[Avatar] Skip optimized: ${user.avatarUrl}`);
        continue;
      }

      const index = user.avatarUrl.indexOf(bucketInUrl);
      if (index === -1) {
        console.log(`[Avatar] Skip non-local/external avatar: ${user.avatarUrl}`);
        continue;
      }

      const oldKey = user.avatarUrl.substring(index + bucketInUrl.length);
      const mainExists = await objectExists(s3, config.MINIO_BUCKET, oldKey);
      if (!mainExists) {
        console.warn(`[Avatar] Warning: Avatar not found in S3, skipping: ${oldKey}`);
        continue;
      }

      console.log(`[Avatar] Optimizing avatar for user ${user.username}: ${oldKey}`);

      // Download
      const getObjRes = await s3.send(new GetObjectCommand({
        Bucket: config.MINIO_BUCKET,
        Key: oldKey,
      }));
      if (!getObjRes.Body) continue;
      const originalBuffer = await streamToBuffer(getObjRes.Body as Readable);

      // Optimize (150x150 cover WebP)
      const optimizedBuffer = await sharp(originalBuffer)
        .resize({ width: 150, height: 150, fit: "cover" })
        .webp({ quality: 85 })
        .toBuffer();

      const newKey = `${oldKey.substring(0, oldKey.lastIndexOf("."))}.webp`;

      // Upload
      await s3.send(new PutObjectCommand({
        Bucket: config.MINIO_BUCKET,
        Key: newKey,
        Body: optimizedBuffer,
        ContentType: "image/webp",
      }));

      const newAvatarUrl = `http://${config.MINIO_ENDPOINT}:${config.MINIO_PORT}/${config.MINIO_BUCKET}/${newKey}`;

      // Update DB
      await db.update(users).set({
        avatarUrl: newAvatarUrl,
      }).where(eq(users.id, user.id));

      // Delete old if key changed
      if (newKey !== oldKey) {
        await s3.send(new DeleteObjectCommand({
          Bucket: config.MINIO_BUCKET,
          Key: oldKey,
        })).catch(() => {});
      }

      console.log(`[Avatar] Successfully optimized avatar for user ${user.username} -> ${newAvatarUrl}`);
    } catch (err: any) {
      console.error(`[Avatar] Error processing avatar for user ${user.username}:`, err.message || err);
    }
  }

  console.log("Legacy image optimization sweep completed successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error during sweep:", err);
  process.exit(1);
});
