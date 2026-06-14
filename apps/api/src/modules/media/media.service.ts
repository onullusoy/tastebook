import { createDb, entryMedia } from "@tastebook/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import sharp from "sharp";
import { ValidationError } from "../../shared/errors";
import type { MediaResponse } from "@tastebook/shared/api-types";
import type { Config } from "../../shared/plugins/config";

export class MediaService {
  constructor(
    private db: ReturnType<typeof createDb>,
    private s3: S3Client,
    private config: Config
  ) {}

  async uploadImage(userId: string, fileBuffer: Buffer, mimeType: string): Promise<MediaResponse> {
    if (fileBuffer.length > 40 * 1024 * 1024) {
      throw new ValidationError("File size exceeds 40MB limit.");
    }

    const header = fileBuffer.subarray(0, 4).toString("hex").toUpperCase();
    const isJpeg = header.startsWith("FFD8FF");
    const isPng = header.startsWith("89504E47");
    const isWebp = header.startsWith("52494646");

    let detectedMime = mimeType.toLowerCase();

    // Fallback to magic bytes if the client MIME type is generic or unknown
    if (detectedMime === "application/octet-stream" || !detectedMime.startsWith("image/")) {
      if (isJpeg) detectedMime = "image/jpeg";
      else if (isPng) detectedMime = "image/png";
      else if (isWebp) detectedMime = "image/webp";
    }

    const validMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validMimes.includes(detectedMime)) {
      throw new ValidationError("Invalid file type. Only JPEG, PNG, and WebP are allowed.");
    }

    if ((detectedMime === "image/jpeg" || detectedMime === "image/jpg") && !isJpeg) {
      throw new ValidationError("Magic byte validation failed for JPEG.");
    }
    if (detectedMime === "image/png" && !isPng) {
      throw new ValidationError("Magic byte validation failed for PNG.");
    }
    if (detectedMime === "image/webp" && !isWebp) {
      throw new ValidationError("Magic byte validation failed for WebP.");
    }

    let optimizedBuffer: Buffer;
    let thumbBuffer: Buffer;
    try {
      optimizedBuffer = await sharp(fileBuffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      thumbBuffer = await sharp(fileBuffer)
        .resize({ width: 400, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
    } catch (error) {
      console.error("Image optimization error:", error);
      throw new ValidationError("Failed to optimize image.");
    }

    const mediaId = crypto.randomUUID();
    const objectKey = `entries/${userId}/${mediaId}.webp`;
    const thumbKey = `entries/${userId}/${mediaId}_thumb.webp`;

    await Promise.all([
      this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.MINIO_BUCKET,
          Key: objectKey,
          Body: optimizedBuffer,
          ContentType: "image/webp",
        })
      ),
      this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.MINIO_BUCKET,
          Key: thumbKey,
          Body: thumbBuffer,
          ContentType: "image/webp",
        })
      )
    ]);

    const [row] = await this.db
      .insert(entryMedia)
      .values({
        userId,
        url: objectKey,
        mimeType: "image/webp",
        sizeBytes: optimizedBuffer.length,
        orderIndex: 0,
      })
      .returning();

    return {
      id: row.id,
      url: this.getMediaUrl(objectKey),
      thumbnail_url: this.getMediaUrl(thumbKey),
      mime_type: "image/webp",
      order_index: row.orderIndex,
    };
  }

  async attachMediaToEntry(mediaIds: string[], entryId: string, userId: string): Promise<void> {
    if (mediaIds.length === 0) {
      return;
    }

    const rows = await this.db
      .select()
      .from(entryMedia)
      .where(
        and(
          eq(entryMedia.userId, userId),
          isNull(entryMedia.entryId),
          inArray(entryMedia.id, mediaIds)
        )
      );

    if (rows.length !== mediaIds.length) {
      throw new ValidationError("Invalid or unauthorized media IDs.");
    }

    for (let i = 0; i < mediaIds.length; i++) {
      await this.db
        .update(entryMedia)
        .set({
          entryId,
          orderIndex: i,
        })
        .where(eq(entryMedia.id, mediaIds[i]));
    }
  }

  async deleteMediaByEntryId(entryId: string, userId: string): Promise<void> {
    const mediaRows = await this.db
      .select()
      .from(entryMedia)
      .where(and(eq(entryMedia.entryId, entryId), eq(entryMedia.userId, userId)));

    for (const row of mediaRows) {
      try {
        const thumbKey = row.url.replace(/\.webp$/, "_thumb.webp");
        await Promise.all([
          this.s3.send(
            new DeleteObjectCommand({
              Bucket: this.config.MINIO_BUCKET,
              Key: row.url,
            })
          ),
          this.s3.send(
            new DeleteObjectCommand({
              Bucket: this.config.MINIO_BUCKET,
              Key: thumbKey,
            })
          ).catch(() => {})
        ]);
      } catch (e) {}
    }

    await this.db
      .delete(entryMedia)
      .where(and(eq(entryMedia.entryId, entryId), eq(entryMedia.userId, userId)));
  }

  getMediaUrl(objectKey: string): string {
    let apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || `http://localhost:${this.config.API_PORT}/api`;
    if (apiBaseUrl && !apiBaseUrl.endsWith("/api") && !apiBaseUrl.endsWith("/api/")) {
      apiBaseUrl = `${apiBaseUrl.replace(/\/$/, "")}/api`;
    }
    return `${apiBaseUrl.replace(/\/$/, "")}/media/file/${objectKey}`;
  }

  getThumbnailUrl(objectKey: string): string {
    const thumbKey = objectKey.replace(/\.webp$/, "_thumb.webp");
    return this.getMediaUrl(thumbKey);
  }

  async getMediaStream(objectKey: string) {
    const command = new GetObjectCommand({
      Bucket: this.config.MINIO_BUCKET,
      Key: objectKey,
    });
    return this.s3.send(command);
  }
}
