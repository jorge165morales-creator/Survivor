import { Body, Controller, HttpCode, Post, UsePipes } from "@nestjs/common";
import {
  appleSignInSchema,
  googleSignInSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  type AppleSignInInput,
  type GoogleSignInInput,
  type LoginInput,
  type RefreshTokenInput,
  type RegisterInput,
} from "@survivor/shared-validation";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() body: RegisterInput) {
    return this.auth.register(body.email, body.password, body.displayName);
  }

  @Post("login")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: LoginInput) {
    return this.auth.login(body.email, body.password);
  }

  @Post("apple")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(appleSignInSchema))
  signInWithApple(@Body() body: AppleSignInInput) {
    return this.auth.signInWithApple(body.identityToken, body.displayName);
  }

  @Post("google")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(googleSignInSchema))
  signInWithGoogle(@Body() body: GoogleSignInInput) {
    return this.auth.signInWithGoogle(body.idToken);
  }

  @Post("refresh")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(refreshTokenSchema))
  refresh(@Body() body: RefreshTokenInput) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(204)
  logout() {
    // Stateless JWT v1: the client discards its tokens. Nothing to invalidate
    // server-side until a refresh-token revocation store is added (tracked for
    // a later phase if we need forced logout / "sign out of all devices").
  }
}
