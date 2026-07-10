import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUserId } from "../common/current-user.decorator";
import { StandingsService } from "./standings.service";

@Controller("leagues/:leagueId/standings")
@UseGuards(JwtAuthGuard)
export class StandingsController {
  constructor(private readonly standings: StandingsService) {}

  @Get()
  getStandings(@CurrentUserId() userId: string, @Param("leagueId") leagueId: string) {
    return this.standings.getStandings(leagueId, userId);
  }
}
