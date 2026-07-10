import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

export interface AccessTokenPayload {
  sub: string; // userId
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  signAccessToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId },
      { secret: this.config.getOrThrow("JWT_SECRET"), expiresIn: ACCESS_TOKEN_TTL },
    );
  }

  signRefreshToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId },
      { secret: this.config.getOrThrow("JWT_REFRESH_SECRET"), expiresIn: REFRESH_TOKEN_TTL },
    );
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow("JWT_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }

  verifyRefreshToken(token: string): AccessTokenPayload {
    try {
      return this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }
}
