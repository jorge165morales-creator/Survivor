import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  createLeagueSchema,
  joinLeagueSchema,
  markPaidSchema,
  updateLeagueSchema,
  type CreateLeagueInput,
  type JoinLeagueInput,
  type MarkPaidInput,
  type UpdateLeagueInput,
} from "@survivor/shared-validation";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUserId } from "../common/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LeaguesService } from "./leagues.service";

@Controller("leagues")
@UseGuards(JwtAuthGuard)
export class LeaguesController {
  constructor(private readonly leagues: LeaguesService) {}

  @Post()
  create(@CurrentUserId() userId: string, @Body(new ZodValidationPipe(createLeagueSchema)) body: CreateLeagueInput) {
    return this.leagues.create(userId, body.name, body.seasonId, body.buyBackEnabled, body.paymentRequired);
  }

  @Get("mine")
  listMine(@CurrentUserId() userId: string) {
    return this.leagues.listMine(userId);
  }

  @Post("join")
  @HttpCode(200)
  join(@CurrentUserId() userId: string, @Body(new ZodValidationPipe(joinLeagueSchema)) body: JoinLeagueInput) {
    return this.leagues.joinByInviteCode(userId, body.inviteCode);
  }

  @Get(":id")
  getById(@CurrentUserId() userId: string, @Param("id") id: string) {
    return this.leagues.getById(id, userId);
  }

  @Patch(":id")
  update(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLeagueSchema)) body: UpdateLeagueInput,
  ) {
    return this.leagues.update(id, userId, body);
  }

  @Post(":id/invite-link")
  @HttpCode(200)
  getInviteLink(@CurrentUserId() userId: string, @Param("id") id: string) {
    return this.leagues.getInviteLink(id, userId);
  }

  @Delete(":id/members/me")
  @HttpCode(204)
  leave(@CurrentUserId() userId: string, @Param("id") id: string) {
    return this.leagues.leave(id, userId);
  }

  @Delete(":id")
  @HttpCode(204)
  archive(@CurrentUserId() userId: string, @Param("id") id: string) {
    return this.leagues.archive(id, userId);
  }

  @Post(":id/members/:userId/grant-buy-back")
  @HttpCode(200)
  grantBuyBack(
    @CurrentUserId() commissionerUserId: string,
    @Param("id") id: string,
    @Param("userId") targetUserId: string,
  ) {
    return this.leagues.grantBuyBack(id, commissionerUserId, targetUserId);
  }

  @Post(":id/members/:userId/mark-paid")
  @HttpCode(200)
  markPaid(
    @CurrentUserId() commissionerUserId: string,
    @Param("id") id: string,
    @Param("userId") targetUserId: string,
    @Body(new ZodValidationPipe(markPaidSchema)) body: MarkPaidInput,
  ) {
    return this.leagues.markMemberPaid(id, commissionerUserId, targetUserId, body.hasPaid);
  }
}
