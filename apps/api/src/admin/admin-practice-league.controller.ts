import { Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { AdminGuard } from "../common/admin.guard";
import { PracticeSeasonService } from "../ingestion/practice-season.service";

// One-shot trigger for practice-season.service.ts — seeds the practice
// league's Season/Matchdays/Fixtures once. Throws (409) if one already
// exists; delete it via the DB before re-seeding.
@Controller("admin/practice-league")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminPracticeLeagueController {
  constructor(private readonly practiceSeason: PracticeSeasonService) {}

  @Post("seed")
  seed() {
    return this.practiceSeason.seedPracticeSeason();
  }
}
