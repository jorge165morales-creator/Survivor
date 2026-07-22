import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { TokenModule } from "./common/token.module";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { LeaguesModule } from "./leagues/leagues.module";
import { SeasonsModule } from "./seasons/seasons.module";
import { FixturesModule } from "./fixtures/fixtures.module";
import { PicksModule } from "./picks/picks.module";
import { StandingsModule } from "./standings/standings.module";
import { GameEngineModule } from "./game-engine/game-engine.module";
import { IngestionModule } from "./ingestion/ingestion.module";
import { AdminModule } from "./admin/admin.module";
import { AppController } from "./app.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    TokenModule,
    UsersModule,
    AuthModule,
    LeaguesModule,
    SeasonsModule,
    FixturesModule,
    GameEngineModule,
    IngestionModule,
    PicksModule,
    StandingsModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
