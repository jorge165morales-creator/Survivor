import { Module } from "@nestjs/common";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { IngestionService } from "./ingestion.service";
import { IngestionSchedulerService } from "./ingestion-scheduler.service";
import { SeasonSyncService } from "./season-sync.service";
import { PracticeSeasonService } from "./practice-season.service";
import { PracticeReplayScheduler } from "./practice-replay-scheduler.service";
import { ApiFootballProvider } from "./providers/api-football.provider";
import { FootballDataOrgProvider } from "./providers/football-data-org.provider";
import { SPORTS_DATA_PROVIDER } from "./providers/sports-data.provider.interface";

@Module({
  imports: [GameEngineModule],
  providers: [
    IngestionService,
    IngestionSchedulerService,
    SeasonSyncService,
    PracticeSeasonService,
    PracticeReplayScheduler,
    FootballDataOrgProvider,
    { provide: SPORTS_DATA_PROVIDER, useClass: ApiFootballProvider },
  ],
  exports: [IngestionService, SeasonSyncService, PracticeSeasonService],
})
export class IngestionModule {}
