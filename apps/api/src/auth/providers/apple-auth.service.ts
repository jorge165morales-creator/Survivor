import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";

export interface AppleIdentity {
  sub: string;
  email: string | null;
}

@Injectable()
export class AppleAuthService {
  private readonly jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

  constructor(private readonly config: ConfigService) {}

  async verifyIdentityToken(identityToken: string): Promise<AppleIdentity> {
    const audience = this.config.get<string>("APPLE_CLIENT_ID");
    try {
      const { payload } = await jwtVerify(identityToken, this.jwks, {
        issuer: APPLE_ISSUER,
        ...(audience ? { audience } : {}),
      });
      if (typeof payload.sub !== "string") {
        throw new Error("missing sub claim");
      }
      return {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email : null,
      };
    } catch {
      throw new UnauthorizedException("Invalid Apple identity token");
    }
  }
}
