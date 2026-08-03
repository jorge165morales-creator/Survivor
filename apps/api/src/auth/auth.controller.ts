import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import {
  appleSignInSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  googleSignInSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  type AppleSignInInput,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type GoogleSignInInput,
  type LoginInput,
  type RefreshTokenInput,
  type RegisterInput,
  type ResetPasswordInput,
} from "@survivor/shared-validation";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUserId } from "../common/current-user.decorator";
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

  @Post("forgot-password")
  @HttpCode(204)
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput) {
    return this.auth.forgotPassword(body.email);
  }

  @Post("reset-password")
  @HttpCode(204)
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    return this.auth.resetPassword(body.token, body.newPassword);
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  changePassword(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    return this.auth.changePassword(userId, body.currentPassword, body.newPassword);
  }

  @Post("logout")
  @HttpCode(204)
  logout() {
    // Stateless JWT v1: the client discards its tokens. Nothing to invalidate
    // server-side until a refresh-token revocation store is added (tracked for
    // a later phase if we need forced logout / "sign out of all devices").
  }
}
