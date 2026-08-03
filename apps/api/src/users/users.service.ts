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

  createWithPassword(email: string, passwordHash: string, displayName: string): Promise<User> {
    return this.prisma.user.create({ data: { email, passwordHash, displayName } });
  }

  createWithApple(appleSub: string, email: string, displayName: string): Promise<User> {
    return this.prisma.user.create({ data: { appleSub, email, displayName } });
  }

  createWithGoogle(googleSub: string, email: string, displayName: string): Promise<User> {
    return this.prisma.user.create({ data: { googleSub, email, displayName } });
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
}
