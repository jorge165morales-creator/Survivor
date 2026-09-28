import { Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { AdminGuard } from "../common/admin.guard";
import { SeasonSyncService } from "../ingestion/season-sync.service";
import { VenueBackfillService } from "../ingestion/venue-backfill.service";

// Manual trigger for the same sync the daily cron runs (see
// ingestion-scheduler.service.ts's syncSeasonFixtures) — useful right after
// a real-world event (the league-stage draw, a knockout pairing being
// confirmed) instead of waiting up to 24h for the next scheduled run.
@Controller("admin/season-sync")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminSeasonSyncController {
  constructor(
    private readonly seasonSync: SeasonSyncService,
    private readonly venueBackfill: VenueBackfillService,
  ) {}

  @Post()
  async sync() {
    const seasons = await this.seasonSync.syncActiveSeasons();
    const venues = await this.venueBackfill.backfillUpcomingVenues();
    return { seasons, venues };
  }
}
