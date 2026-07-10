import { Body, Controller, HttpCode, Post } from "@nestjs/common";
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
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) {
    return this.auth.register(body.email, body.password, body.displayName);
  }

  @Post("login")
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    return this.auth.login(body.email, body.password);
  }

  @Post("apple")
  @HttpCode(200)
  signInWithApple(@Body(new ZodValidationPipe(appleSignInSchema)) body: AppleSignInInput) {
    return this.auth.signInWithApple(body.identityToken, body.displayName);
  }

  @Post("google")
  @HttpCode(200)
  signInWithGoogle(@Body(new ZodValidationPipe(googleSignInSchema)) body: GoogleSignInInput) {
    return this.auth.signInWithGoogle(body.idToken);
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(refreshTokenSchema)) body: RefreshTokenInput) {
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
