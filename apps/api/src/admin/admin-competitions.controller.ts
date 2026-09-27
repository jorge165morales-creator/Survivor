import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { AdminGuard } from "../common/admin.guard";
import { CompetitionProvisioningService, type ProvisionSeasonInput } from "../ingestion/competition-provisioning.service";

// One-shot setup for adding a brand-new season to a competition already
// known to competitions.ts (e.g. La Liga, Premier League) — creates the
// Season + placeholder matchdays. Follow up with a POST to
// admin/season-sync (or wait for the daily cron) to pull real fixtures and
// overwrite the placeholder lockAt times.
@Controller("admin/competitions")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminCompetitionsController {
  constructor(private readonly provisioning: CompetitionProvisioningService) {}

  @Post("provision-season")
  provisionSeason(@Body() body: ProvisionSeasonInput) {
    return this.provisioning.provisionSeason(body);
  }
}
