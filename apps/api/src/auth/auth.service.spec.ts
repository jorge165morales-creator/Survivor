import { ConflictException, UnauthorizedException } from "@nestjs/common";
import type { User } from "@prisma/client";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/users.service";
import { TokenService } from "../common/token.service";
import { AppleAuthService } from "./providers/apple-auth.service";
import { GoogleAuthService } from "./providers/google-auth.service";
import * as bcrypt from "bcryptjs";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "player@example.com",
    passwordHash: null,
    appleSub: null,
    googleSub: null,
    displayName: "Player One",
    avatarUrl: null,
    isAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("AuthService", () => {
  let users: jest.Mocked<UsersService>;
  let tokens: jest.Mocked<TokenService>;
  let apple: jest.Mocked<AppleAuthService>;
  let google: jest.Mocked<GoogleAuthService>;
  let service: AuthService;

  beforeEach(() => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByAppleSub: jest.fn(),
      findByGoogleSub: jest.fn(),
      createWithPassword: jest.fn(),
      createWithApple: jest.fn(),
      createWithGoogle: jest.fn(),
      linkAppleSub: jest.fn(),
      linkGoogleSub: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    tokens = {
      signAccessToken: jest.fn().mockReturnValue("access-token"),
      signRefreshToken: jest.fn().mockReturnValue("refresh-token"),
      verifyAccessToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
    } as unknown as jest.Mocked<TokenService>;

    apple = { verifyIdentityToken: jest.fn() } as unknown as jest.Mocked<AppleAuthService>;
    google = { verifyIdToken: jest.fn() } as unknown as jest.Mocked<GoogleAuthService>;

    service = new AuthService(users, tokens, apple, google);
  });

  describe("register", () => {
    it("rejects an email that is already registered", async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      await expect(service.register("player@example.com", "password123", "Player One")).rejects.toThrow(
        ConflictException,
      );
    });

    it("creates a new user with a hashed password and returns tokens", async () => {
      users.findByEmail.mockResolvedValue(null);
      const created = makeUser({ passwordHash: "hashed" });
      users.createWithPassword.mockResolvedValue(created);

      const result = await service.register("player@example.com", "password123", "Player One");

      expect(users.createWithPassword).toHaveBeenCalledWith(
        "player@example.com",
        expect.any(String),
        "Player One",
      );
      const [, hashArg] = users.createWithPassword.mock.calls[0];
      expect(hashArg).not.toBe("password123");
      expect(result).toEqual({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        user: { id: created.id, email: created.email, displayName: created.displayName, avatarUrl: null },
      });
    });
  });

  describe("login", () => {
    it("rejects when no user exists for the email", async () => {
      users.findByEmail.mockResolvedValue(null);
      await expect(service.login("nobody@example.com", "password123")).rejects.toThrow(UnauthorizedException);
    });

    it("rejects when the password does not match", async () => {
      const hash = await bcrypt.hash("correct-password", 4);
      users.findByEmail.mockResolvedValue(makeUser({ passwordHash: hash }));
      await expect(service.login("player@example.com", "wrong-password")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("issues tokens when the password matches", async () => {
      const hash = await bcrypt.hash("correct-password", 4);
      const user = makeUser({ passwordHash: hash });
      users.findByEmail.mockResolvedValue(user);

      const result = await service.login("player@example.com", "correct-password");
      expect(result.accessToken).toBe("access-token");
      expect(result.refreshToken).toBe("refresh-token");
    });
  });

  describe("signInWithApple", () => {
    it("links an existing account found by email when no appleSub match exists", async () => {
      apple.verifyIdentityToken.mockResolvedValue({ sub: "apple-sub-1", email: "player@example.com" });
      users.findByAppleSub.mockResolvedValue(null);
      const existing = makeUser();
      users.findByEmail.mockResolvedValue(existing);
      users.linkAppleSub.mockResolvedValue(makeUser({ appleSub: "apple-sub-1" }));

      await service.signInWithApple("id-token");

      expect(users.linkAppleSub).toHaveBeenCalledWith(existing.id, "apple-sub-1");
      expect(users.createWithApple).not.toHaveBeenCalled();
    });

    it("creates a new user when no existing account matches by sub or email", async () => {
      apple.verifyIdentityToken.mockResolvedValue({ sub: "apple-sub-2", email: "new@example.com" });
      users.findByAppleSub.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      users.createWithApple.mockResolvedValue(makeUser({ appleSub: "apple-sub-2", email: "new@example.com" }));

      await service.signInWithApple("id-token", "New Player");

      expect(users.createWithApple).toHaveBeenCalledWith("apple-sub-2", "new@example.com", "New Player");
    });

    it("rejects when Apple provides no email and no account exists yet", async () => {
      apple.verifyIdentityToken.mockResolvedValue({ sub: "apple-sub-3", email: null });
      users.findByAppleSub.mockResolvedValue(null);

      await expect(service.signInWithApple("id-token")).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("refresh", () => {
    it("rejects when the user referenced by the token no longer exists", async () => {
      tokens.verifyRefreshToken.mockReturnValue({ sub: "gone-user" });
      users.findById.mockResolvedValue(null);
      await expect(service.refresh("some-refresh-token")).rejects.toThrow(UnauthorizedException);
    });

    it("issues new tokens for a valid refresh token", async () => {
      tokens.verifyRefreshToken.mockReturnValue({ sub: "user-1" });
      users.findById.mockResolvedValue(makeUser());

      const result = await service.refresh("some-refresh-token");
      expect(result.accessToken).toBe("access-token");
    });
  });
});
