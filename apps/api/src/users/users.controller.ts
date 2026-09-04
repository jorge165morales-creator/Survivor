import { Body, Controller, Get, HttpCode, NotFoundException, Post, UseGuards } from "@nestjs/common";
import type { AuthUser } from "@survivor/shared-types";
import { registerPushTokenSchema, type RegisterPushTokenInput } from "@survivor/shared-validation";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUserId } from "../common/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post("push-token")
  @HttpCode(204)
  registerPushToken(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(registerPushTokenSchema)) body: RegisterPushTokenInput,
  ) {
    return this.users.registerPushToken(userId, body.token, body.platform);
  }

  @Get("me")
  async me(@CurrentUserId() userId: string): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException("User no longer exists");
    }
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };
  }
}
