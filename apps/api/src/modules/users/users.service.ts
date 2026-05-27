import { createDb, users, follows } from "@tastebook/db";
import { eq, and, or, sql } from "drizzle-orm";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
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

    const [followerRes] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followingId, targetUserId));

    const [followingRes] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followerId, targetUserId));

    const response: UserResponse = {
      id: user.id,
      username: user.username,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
      bio: user.bio,
      created_at: user.createdAt.toISOString(),
      follower_count: followerRes?.count ?? 0,
      following_count: followingRes?.count ?? 0,
    };

    if (viewerId) {
      const [isFollowingRes] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, viewerId),
            eq(follows.followingId, targetUserId)
          )
        );

      response.is_following = (isFollowingRes?.count ?? 0) > 0;

      const [isFriendRes] = await this.db
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

      response.is_friend = (isFriendRes?.count ?? 0) === 2;
    } else {
      response.is_following = false;
      response.is_friend = false;
    }

    return response;
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

    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimes.includes(mimeType)) {
      throw new ValidationError("Invalid file type. Only JPEG, PNG, and WebP are allowed.");
    }

    const header = fileBuffer.subarray(0, 4).toString("hex").toUpperCase();
    const isJpeg = header.startsWith("FFD8FF");
    const isPng = header.startsWith("89504E47");
    const isWebp = header.startsWith("52494646");

    if (!isJpeg && !isPng && !isWebp) {
      throw new ValidationError("Invalid file type. Magic byte validation failed.");
    }

    let ext = "jpg";
    if (isPng) ext = "png";
    if (isWebp) ext = "webp";

    const key = `avatars/${userId}/${crypto.randomUUID()}.${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.MINIO_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
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
