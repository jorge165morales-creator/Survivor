import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import {
  adminFixtureOverrideSchema,
  createFixtureSchema,
  type AdminFixtureOverrideInput,
  type CreateFixtureInput,
} from "@survivor/shared-validation";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { AdminGuard } from "../common/admin.guard";
import { CurrentUserId } from "../common/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdminFixturesService } from "./admin-fixtures.service";

@Controller("admin/fixtures")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminFixturesController {
  constructor(private readonly adminFixtures: AdminFixturesService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createFixtureSchema)) body: CreateFixtureInput) {
    return this.adminFixtures.create(
      body.matchdayId,
      body.homeTeamId,
      body.awayTeamId,
      body.kickoffAt,
      body.externalId,
      body.venue,
    );
  }

  @Post(":id/override")
  override(
    @CurrentUserId() adminUserId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(adminFixtureOverrideSchema)) body: AdminFixtureOverrideInput,
  ) {
    return this.adminFixtures.overrideResult(id, adminUserId, body);
  }

  @Delete(":id")
  @HttpCode(204)
  delete(@Param("id") id: string) {
    return this.adminFixtures.delete(id);
  }
}
