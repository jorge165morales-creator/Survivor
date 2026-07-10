import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { submitPickSchema, type SubmitPickInput } from "@survivor/shared-validation";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUserId } from "../common/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PicksService } from "./picks.service";

@Controller("leagues/:leagueId")
@UseGuards(JwtAuthGuard)
export class PicksController {
  constructor(private readonly picks: PicksService) {}

  @Get("matchdays/:matchdayId/pick-options")
  getPickOptions(
    @CurrentUserId() userId: string,
    @Param("leagueId") leagueId: string,
    @Param("matchdayId") matchdayId: string,
  ) {
    return this.picks.getPickOptions(leagueId, matchdayId, userId);
  }

  @Post("matchdays/:matchdayId/picks")
  submitPick(
    @CurrentUserId() userId: string,
    @Param("leagueId") leagueId: string,
    @Param("matchdayId") matchdayId: string,
    @Body(new ZodValidationPipe(submitPickSchema)) body: SubmitPickInput,
  ) {
    return this.picks.submitPick(leagueId, matchdayId, userId, body.teamId);
  }

  @Put("matchdays/:matchdayId/picks")
  changePick(
    @CurrentUserId() userId: string,
    @Param("leagueId") leagueId: string,
    @Param("matchdayId") matchdayId: string,
    @Body(new ZodValidationPipe(submitPickSchema)) body: SubmitPickInput,
  ) {
    return this.picks.submitPick(leagueId, matchdayId, userId, body.teamId);
  }

  @Get("picks/me")
  getMyPicks(@CurrentUserId() userId: string, @Param("leagueId") leagueId: string) {
    return this.picks.getMyPicks(leagueId, userId);
  }
}
