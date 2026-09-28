import { Module } from "@nestjs/common";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { IngestionService } from "./ingestion.service";
import { IngestionSchedulerService } from "./ingestion-scheduler.service";
import { SeasonSyncService } from "./season-sync.service";
import { CompetitionProvisioningService } from "./competition-provisioning.service";
import { VenueBackfillService } from "./venue-backfill.service";
import { PracticeSeasonService } from "./practice-season.service";
import { PracticeReplayScheduler } from "./practice-replay-scheduler.service";
import { ApiFootballProvider } from "./providers/api-football.provider";
import { FootballDataOrgProvider } from "./providers/football-data-org.provider";
import { HighlightlyProvider } from "./providers/highlightly.provider";
import { SPORTS_DATA_PROVIDER } from "./providers/sports-data.provider.interface";

@Module({
  imports: [GameEngineModule],
  providers: [
    IngestionService,
    IngestionSchedulerService,
    SeasonSyncService,
    CompetitionProvisioningService,
    VenueBackfillService,
    PracticeSeasonService,
    PracticeReplayScheduler,
    FootballDataOrgProvider,
    ApiFootballProvider,
    // Confirmed live (2026-09-03) that Highlightly's free BASIC tier has no
    // season restriction, unlike API-Football's — "All data available with
    // current plan." See highlightly.provider.ts for the cost-model caveats
    // this swap required (no ids/round filter, worked around via date
    // filtering in getLiveResults).
    { provide: SPORTS_DATA_PROVIDER, useClass: HighlightlyProvider },
  ],
  exports: [
    IngestionService,
    SeasonSyncService,
    CompetitionProvisioningService,
    VenueBackfillService,
    PracticeSeasonService,
    SPORTS_DATA_PROVIDER,
  ],
})
export class IngestionModule {}
