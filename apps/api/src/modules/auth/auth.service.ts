import { createDb, users, refreshTokens } from "@tastebook/db";
import { eq, or } from "drizzle-orm";
import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { ConflictError, UnauthorizedError } from "../../shared/errors";
import type { RegisterRequest, LoginRequest } from "@tastebook/shared/schemas/auth";
import type { UserResponse } from "@tastebook/shared/api-types";

export class AuthService {
  constructor(
    private db: ReturnType<typeof createDb>,
    private jwt: { sign: (payload: any, options?: any) => string }
  ) {}

  async register(data: RegisterRequest): Promise<{ user: UserResponse; accessToken: string; refreshToken: string }> {
    const existing = await this.db.query.users.findFirst({
      where: or(
        eq(users.email, data.email.toLowerCase()),
        eq(users.username, data.username.toLowerCase())
      ),
    });

    if (existing) {
      if (existing.email.toLowerCase() === data.email.toLowerCase()) {
        throw new ConflictError("Email already registered");
      }
      if (existing.username.toLowerCase() === data.username.toLowerCase()) {
        throw new ConflictError("Username already taken");
      }
    }

    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });

    const [user] = await this.db
      .insert(users)
      .values({
        username: data.username,
        email: data.email.toLowerCase(),
        passwordHash,
      })
      .returning();

    const { accessToken, refreshToken } = await this.generateTokens(user.id);

    return {
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
        bio: user.bio,
        created_at: user.createdAt.toISOString(),
      },
      accessToken,
      refreshToken,
    };
  }

  async login(data: LoginRequest): Promise<{ user: UserResponse; accessToken: string; refreshToken: string }> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, data.email.toLowerCase()),
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await argon2.verify(user.passwordHash, data.password);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const { accessToken, refreshToken } = await this.generateTokens(user.id);

    return {
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
        bio: user.bio,
        created_at: user.createdAt.toISOString(),
      },
      accessToken,
      refreshToken,
    };
  }

  async refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = createHash("sha256").update(rawRefreshToken).digest("hex");

    const storedToken = await this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });

    if (!storedToken || new Date() > storedToken.expiresAt) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    await this.db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));

    const tokens = await this.generateTokens(storedToken.userId);

    return tokens;
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = createHash("sha256").update(rawRefreshToken).digest("hex");
    await this.db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  }

  private async generateTokens(userId: string) {
    const accessToken = this.jwt.sign({ sub: userId }, { expiresIn: "15m" });
    const rawRefreshToken = randomBytes(64).toString("hex");
    const tokenHash = createHash("sha256").update(rawRefreshToken).digest("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }
}
