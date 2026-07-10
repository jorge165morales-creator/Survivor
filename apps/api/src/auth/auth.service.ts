import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { AuthTokensResponse, AuthUser } from "@survivor/shared-types";
import type { User } from "@prisma/client";
import { UsersService } from "../users/users.service";
import { TokenService } from "../common/token.service";
import { AppleAuthService } from "./providers/apple-auth.service";
import { GoogleAuthService } from "./providers/google-auth.service";

const BCRYPT_SALT_ROUNDS = 12;

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
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
  ) {}

  private issueTokens(user: User): AuthTokensResponse {
    return {
      accessToken: this.tokens.signAccessToken(user.id),
      refreshToken: this.tokens.signRefreshToken(user.id),
      user: toAuthUser(user),
    };
  }

  async register(email: string, password: string, displayName: string): Promise<AuthTokensResponse> {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = await this.users.createWithPassword(email, passwordHash, displayName);
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
}
