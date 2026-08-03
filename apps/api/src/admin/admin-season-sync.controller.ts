import { Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { AdminGuard } from "../common/admin.guard";
import { SeasonSyncService } from "../ingestion/season-sync.service";

// Manual trigger for the same sync the daily cron runs (see
// ingestion-scheduler.service.ts) — useful right after a real-world event
// (the league-stage draw, a knockout pairing being confirmed) instead of
// waiting up to 24h for the next scheduled run.
@Controller("admin/season-sync")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminSeasonSyncController {
  constructor(private readonly seasonSync: SeasonSyncService) {}

  @Post()
  sync() {
    return this.seasonSync.syncActiveSeasons();
  }
}
