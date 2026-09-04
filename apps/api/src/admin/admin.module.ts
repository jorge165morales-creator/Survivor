import { Module } from "@nestjs/common";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { IngestionModule } from "../ingestion/ingestion.module";
import { LeaguesModule } from "../leagues/leagues.module";
import { AdminFixturesController } from "./admin-fixtures.controller";
import { AdminFixturesService } from "./admin-fixtures.service";
import { AdminSeasonSyncController } from "./admin-season-sync.controller";
import { AdminPracticeLeagueController } from "./admin-practice-league.controller";
import { AdminTeamsController } from "./admin-teams.controller";
import { AdminTeamsService } from "./admin-teams.service";
import { AdminLeaguesController } from "./admin-leagues.controller";

@Module({
  imports: [GameEngineModule, IngestionModule, LeaguesModule],
  controllers: [
    AdminFixturesController,
    AdminSeasonSyncController,
    AdminPracticeLeagueController,
    AdminTeamsController,
    AdminLeaguesController,
  ],
  providers: [AdminFixturesService, AdminTeamsService],
})
export class AdminModule {}
