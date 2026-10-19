import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { updateLeagueSchema, type UpdateLeagueInput } from "@survivor/shared-validation";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { AdminGuard } from "../common/admin.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LeaguesService } from "../leagues/leagues.service";
import { RecomputeService } from "../game-engine/recompute.service";

// Admin-only access to any league, regardless of who commissions it — for
// support requests (raising a member cap, etc.) on a league the admin
// account doesn't belong to, which is the normal case once the app is in
// real users' hands.
@Controller("admin/leagues")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminLeaguesController {
  constructor(
    private readonly leagues: LeaguesService,
    private readonly recompute: RecomputeService,
  ) {}

  @Get()
  list(@Query("search") search?: string) {
    return this.leagues.adminList(search);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateLeagueSchema)) body: UpdateLeagueInput) {
    return this.leagues.adminUpdate(id, body);
  }

  // Forces a replay of the whole league right now instead of waiting for the
  // next natural trigger (a fixture result landing, a buy-back grant) — the
  // normal case is a data fix (e.g. a backfill migration) that needs its
  // effect applied immediately. Safe to call anytime: recompute.service.ts's
  // replay-from-scratch design makes it idempotent.
  @Post(":id/recompute")
  @HttpCode(200)
  async forceRecompute(@Param("id") id: string) {
    await this.recompute.recomputeLeague(id);
    return { ok: true };
  }
}
