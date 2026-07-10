import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

@Injectable()
export class GoogleAuthService {
  private readonly jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

  constructor(private readonly config: ConfigService) {}

  async verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    const audience = this.config.get<string>("GOOGLE_CLIENT_ID");
    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: GOOGLE_ISSUERS,
        ...(audience ? { audience } : {}),
      });
      if (typeof payload.sub !== "string") {
        throw new Error("missing sub claim");
      }
      return {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email : null,
        name: typeof payload.name === "string" ? payload.name : null,
        picture: typeof payload.picture === "string" ? payload.picture : null,
      };
    } catch {
      throw new UnauthorizedException("Invalid Google ID token");
    }
  }
}
