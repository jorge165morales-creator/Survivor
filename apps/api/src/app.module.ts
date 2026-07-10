import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { TokenModule } from "./common/token.module";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { LeaguesModule } from "./leagues/leagues.module";
import { SeasonsModule } from "./seasons/seasons.module";
import { AppController } from "./app.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TokenModule,
    UsersModule,
    AuthModule,
    LeaguesModule,
    SeasonsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
