import { Injectable, NotFoundException } from "@nestjs/common";
import type { MatchdaySummary, SeasonSummary } from "@survivor/shared-types";
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

  async getMatchdays(seasonId: string): Promise<MatchdaySummary[]> {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) {
      throw new NotFoundException("Season not found");
    }
    const matchdays = await this.prisma.matchday.findMany({
      where: { seasonId },
      orderBy: { sequence: "asc" },
    });
    return matchdays.map((m) => ({
      id: m.id,
      sequence: m.sequence,
      type: m.type,
      roundLabel: m.roundLabel,
      lockAt: m.lockAt.toISOString(),
    }));
  }
}
