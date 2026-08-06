import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import type { AuthTokensResponse, AuthUser } from "@survivor/shared-types";
import type { User } from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { UsersService } from "../users/users.service";
import { TokenService } from "../common/token.service";
import { AppleAuthService } from "./providers/apple-auth.service";
import { GoogleAuthService } from "./providers/google-auth.service";

const BCRYPT_SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly apple: AppleAuthService,
    private readonly google: GoogleAuthService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private issueTokens(user: User): AuthTokensResponse {
    return {
      accessToken: this.tokens.signAccessToken(user.id),
      refreshToken: this.tokens.signRefreshToken(user.id),
      user: toAuthUser(user),
    };
  }

  async register(email: string, password: string, displayName: string, username: string): Promise<AuthTokensResponse> {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }
    const usernameTaken = await this.users.findByUsername(username);
    if (usernameTaken) {
      throw new ConflictException("This username is already taken");
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = await this.users.createWithPassword(email, passwordHash, displayName, username);
    return this.issueTokens(user);
  }

  async login(email: string, password: string): Promise<AuthTokensResponse> {
    const user = await this.users.findByEmail(email);
    if (!user?.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.issueTokens(user);
  }

  async signInWithApple(identityToken: string, displayName?: string): Promise<AuthTokensResponse> {
    const identity = await this.apple.verifyIdentityToken(identityToken);

    let user = await this.users.findByAppleSub(identity.sub);
    if (!user && identity.email) {
      const byEmail = await this.users.findByEmail(identity.email);
      if (byEmail) {
        user = await this.users.linkAppleSub(byEmail.id, identity.sub);
      }
    }
    if (!user) {
      if (!identity.email) {
        throw new UnauthorizedException("Apple did not provide an email for this account");
      }
      user = await this.users.createWithApple(identity.sub, identity.email, displayName ?? "Player");
    }
    return this.issueTokens(user);
  }

  async signInWithGoogle(idToken: string): Promise<AuthTokensResponse> {
    const identity = await this.google.verifyIdToken(idToken);
    if (!identity.email) {
      throw new UnauthorizedException("Google did not provide an email for this account");
    }

    let user = await this.users.findByGoogleSub(identity.sub);
    if (!user) {
      const byEmail = await this.users.findByEmail(identity.email);
      user = byEmail
        ? await this.users.linkGoogleSub(byEmail.id, identity.sub)
        : await this.users.createWithGoogle(identity.sub, identity.email, identity.name ?? "Player");
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    const payload = this.tokens.verifyRefreshToken(refreshToken);
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }
    return this.issueTokens(user);
  }

  // Always resolves the same way whether or not the email is registered, and
  // whether the send succeeds — the response can't be used to enumerate
  // accounts, and the client shows one generic "check your email" message
  // regardless of outcome.
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;

    if (!user.passwordHash) {
      await this.mail.sendOAuthOnlyAccountNotice(user.email, user.appleSub ? "Apple" : "Google");
      return;
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await this.users.createPasswordResetToken(user.id, hashResetToken(rawToken), expiresAt);

    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:8081";
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
    await this.mail.sendPasswordResetEmail(user.email, resetUrl);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const record = await this.users.findValidPasswordResetToken(hashResetToken(rawToken));
    if (!record) {
      throw new UnauthorizedException("This reset link is invalid or has expired");
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.users.resetPasswordWithToken(record.id, record.userId, passwordHash);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user?.passwordHash) {
      throw new BadRequestException("This account signs in with Apple or Google and has no password to change");
    }
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.users.updatePasswordHash(userId, passwordHash);
  }

  async deleteAccount(userId: string, currentPassword?: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }
    if (user.passwordHash) {
      if (!currentPassword) {
        throw new BadRequestException("Enter your current password to delete your account");
      }
      const matches = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!matches) {
        throw new UnauthorizedException("Current password is incorrect");
      }
    }
    await this.users.anonymizeAccount(userId);
  }
}
