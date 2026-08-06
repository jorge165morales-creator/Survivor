import { Injectable } from "@nestjs/common";
import type { PasswordResetToken, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findByAppleSub(appleSub: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { appleSub } });
  }

  findByGoogleSub(googleSub: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleSub } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  createWithPassword(email: string, passwordHash: string, displayName: string, username: string): Promise<User> {
    return this.prisma.user.create({ data: { email, passwordHash, displayName, username } });
  }

  async createWithApple(appleSub: string, email: string, displayName: string): Promise<User> {
    const username = await this.generateUniqueUsername(displayName || email);
    return this.prisma.user.create({ data: { appleSub, email, displayName, username } });
  }

  async createWithGoogle(googleSub: string, email: string, displayName: string): Promise<User> {
    const username = await this.generateUniqueUsername(displayName || email);
    return this.prisma.user.create({ data: { googleSub, email, displayName, username } });
  }

  // Apple/Google sign-in don't collect a username, so derive one from
  // whatever name/email they did provide and disambiguate on collision —
  // this is a fallback handle, not user-facing branding.
  private async generateUniqueUsername(seed: string): Promise<string> {
    const base = seed.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15) || "player";
    let candidate = base;
    let suffix = 0;
    while (await this.findByUsername(candidate)) {
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
    return candidate;
  }

  linkAppleSub(userId: string, appleSub: string): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { appleSub } });
  }

  linkGoogleSub(userId: string, googleSub: string): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { googleSub } });
  }

  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
  }

  findValidPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  async resetPasswordWithToken(tokenId: string, userId: string, passwordHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: tokenId }, data: { usedAt: new Date() } }),
    ]);
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  // Scrubs PII rather than hard-deleting the row: league standings, pick
  // history, and any leagues this user commissions must keep working for
  // other members, so the id and its relations stay intact — only the
  // identifying fields are wiped.
  async anonymizeAccount(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.pushToken.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@survivor.invalid`,
          username: `deleted_${userId.slice(0, 8)}`,
          displayName: "Deleted User",
          passwordHash: null,
          appleSub: null,
          googleSub: null,
          avatarUrl: null,
        },
      }),
    ]);
  }
}
