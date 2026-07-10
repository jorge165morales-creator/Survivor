import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { FixturesService } from "./fixtures.service";

@Controller("matchdays")
@UseGuards(JwtAuthGuard)
export class FixturesController {
  constructor(private readonly fixtures: FixturesService) {}

  @Get(":matchdayId/fixtures")
  listForMatchday(@Param("matchdayId") matchdayId: string) {
    return this.fixtures.listForMatchday(matchdayId);
  }
}
