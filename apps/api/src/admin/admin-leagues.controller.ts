import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { updateLeagueSchema, type UpdateLeagueInput } from "@survivor/shared-validation";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { AdminGuard } from "../common/admin.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LeaguesService } from "../leagues/leagues.service";

// Admin-only access to any league, regardless of who commissions it — for
// support requests (raising a member cap, etc.) on a league the admin
// account doesn't belong to, which is the normal case once the app is in
// real users' hands.
@Controller("admin/leagues")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminLeaguesController {
  constructor(private readonly leagues: LeaguesService) {}

  @Get()
  list(@Query("search") search?: string) {
    return this.leagues.adminList(search);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateLeagueSchema)) body: UpdateLeagueInput) {
    return this.leagues.adminUpdate(id, body);
  }
}
