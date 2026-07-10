import { Injectable, NotFoundException } from "@nestjs/common";
import type { SeasonSummary } from "@survivor/shared-types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SeasonsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActive(): Promise<SeasonSummary> {
    const season = await this.prisma.season.findFirst({ where: { isActive: true } });
    if (!season) {
      throw new NotFoundException("No active season");
    }
    return { id: season.id, name: season.name, year: season.year };
  }
}
