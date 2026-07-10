import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AppleAuthService } from "./providers/apple-auth.service";
import { GoogleAuthService } from "./providers/google-auth.service";

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, AppleAuthService, GoogleAuthService],
})
export class AuthModule {}
