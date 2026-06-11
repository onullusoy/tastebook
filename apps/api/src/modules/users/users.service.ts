import { createDb, users, follows } from "@tastebook/db";
import { eq, and, or, sql } from "drizzle-orm";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import sharp from "sharp";
import { NotFoundError, ValidationError } from "../../shared/errors";
import type { UpdateProfileRequest } from "@tastebook/shared/schemas/users";
import type { UserResponse } from "@tastebook/shared/api-types";
import type { Config } from "../../shared/plugins/config";

export class UsersService {
  constructor(
    private db: ReturnType<typeof createDb>,
    private s3: S3Client,
    private config: Config
  ) {}

  async getProfile(targetUserId: string, viewerId?: string): Promise<UserResponse> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, targetUserId),
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const followerQuery = this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followingId, targetUserId));

    const followingQuery = this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followerId, targetUserId));

    let followerCount = 0;
    let followingCount = 0;
    let isFollowing = false;
    let isFriend = false;

    if (viewerId) {
      const isFollowingQuery = this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, viewerId),
            eq(follows.followingId, targetUserId)
          )
        );

      const isFriendQuery = this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(
          or(
            and(
              eq(follows.followerId, viewerId),
              eq(follows.followingId, targetUserId)
            ),
            and(
              eq(follows.followerId, targetUserId),
              eq(follows.followingId, viewerId)
            )
          )
        );

      const [followerRes, followingRes, isFollowingRes, isFriendRes] = await Promise.all([
        followerQuery,
        followingQuery,
        isFollowingQuery,
        isFriendQuery,
      ]);

      followerCount = followerRes[0]?.count ?? 0;
      followingCount = followingRes[0]?.count ?? 0;
      isFollowing = (isFollowingRes[0]?.count ?? 0) > 0;
      isFriend = (isFriendRes[0]?.count ?? 0) === 2;
    } else {
      const [followerRes, followingRes] = await Promise.all([
        followerQuery,
        followingQuery,
      ]);

      followerCount = followerRes[0]?.count ?? 0;
      followingCount = followingRes[0]?.count ?? 0;
    }

    return {
      id: user.id,
      username: user.username,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
      bio: user.bio,
      created_at: user.createdAt.toISOString(),
      follower_count: followerCount,
      following_count: followingCount,
      is_following: isFollowing,
      is_friend: isFriend,
      gourme_points: user.gourmePoints,
      metadata: user.metadata,
    };
  }

  async updateProfile(userId: string, data: UpdateProfileRequest): Promise<UserResponse> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.display_name !== undefined) {
      updateData.displayName = data.display_name;
    }
    if (data.bio !== undefined) {
      updateData.bio = data.bio;
    }
    if (data.metadata !== undefined) {
      updateData.metadata = data.metadata;
    }

    await this.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    return this.getProfile(userId);
  }

  async uploadAvatar(userId: string, fileBuffer: Buffer, mimeType: string): Promise<string> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (fileBuffer.length > 5 * 1024 * 1024) {
      throw new ValidationError("File size exceeds 5MB limit.");
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

    if (!isJpeg && !isPng && !isWebp) {
      throw new ValidationError("Invalid file type. Magic byte validation failed.");
    }

    let optimizedBuffer: Buffer;
    try {
      optimizedBuffer = await sharp(fileBuffer)
        .resize({ width: 150, height: 150, fit: "cover" })
        .webp({ quality: 85 })
        .toBuffer();
    } catch (error) {
      throw new ValidationError("Failed to optimize avatar image.");
    }

    const key = `avatars/${userId}/${crypto.randomUUID()}.webp`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.MINIO_BUCKET,
        Key: key,
        Body: optimizedBuffer,
        ContentType: "image/webp",
      })
    );

    const oldAvatarUrl = user.avatarUrl;
    if (oldAvatarUrl) {
      const bucketInUrl = `/${this.config.MINIO_BUCKET}/`;
      const index = oldAvatarUrl.indexOf(bucketInUrl);
      if (index !== -1) {
        const oldKey = oldAvatarUrl.substring(index + bucketInUrl.length);
        try {
          await this.s3.send(
            new DeleteObjectCommand({
              Bucket: this.config.MINIO_BUCKET,
              Key: oldKey,
            })
          );
        } catch (e) {}
      }
    }

    const avatarUrl = `http://${this.config.MINIO_ENDPOINT}:${this.config.MINIO_PORT}/${this.config.MINIO_BUCKET}/${key}`;

    await this.db
      .update(users)
      .set({
        avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return avatarUrl;
  }
}
