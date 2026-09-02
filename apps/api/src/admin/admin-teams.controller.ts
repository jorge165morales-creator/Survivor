import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { createTeamSchema, type CreateTeamInput } from "@survivor/shared-validation";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { AdminGuard } from "../common/admin.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdminTeamsService } from "./admin-teams.service";

// Manual team entry — the automated ingestion pipeline (team-resolution.ts)
// is the only other thing that can create a Team row, so this exists for the
// same reason admin-fixtures.controller.ts's create() does: hand-populating
// matchdays ahead of/instead of a working provider sync, for a club that
// wasn't already pre-seeded (prisma/seed.ts's TEAM_NAMES list).
@Controller("admin/teams")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminTeamsController {
  constructor(private readonly adminTeams: AdminTeamsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createTeamSchema)) body: CreateTeamInput) {
    return this.adminTeams.create(body.name, body.seasonId, body.shortName, body.crestUrl, body.externalId);
  }
}
