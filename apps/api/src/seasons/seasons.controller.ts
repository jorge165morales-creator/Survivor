import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { SeasonsService } from "./seasons.service";

@Controller("seasons")
@UseGuards(JwtAuthGuard)
export class SeasonsController {
  constructor(private readonly seasons: SeasonsService) {}

  @Get("active")
  getActive() {
    return this.seasons.getActive();
  }
}
