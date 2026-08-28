import { Module } from "@nestjs/common";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { IngestionModule } from "../ingestion/ingestion.module";
import { AdminFixturesController } from "./admin-fixtures.controller";
import { AdminFixturesService } from "./admin-fixtures.service";
import { AdminSeasonSyncController } from "./admin-season-sync.controller";
import { AdminPracticeLeagueController } from "./admin-practice-league.controller";

@Module({
  imports: [GameEngineModule, IngestionModule],
  controllers: [
    AdminFixturesController,
    AdminSeasonSyncController,
    AdminPracticeLeagueController,
  ],
  providers: [AdminFixturesService],
})
export class AdminModule {}
