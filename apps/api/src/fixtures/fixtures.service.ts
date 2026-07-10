import { Injectable, NotFoundException } from "@nestjs/common";
import type { FixtureSummary } from "@survivor/shared-types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FixturesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForMatchday(matchdayId: string): Promise<FixtureSummary[]> {
    const matchday = await this.prisma.matchday.findUnique({ where: { id: matchdayId } });
    if (!matchday) {
      throw new NotFoundException("Matchday not found");
    }
    const fixtures = await this.prisma.fixture.findMany({
      where: { matchdayId },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: "asc" },
    });
    return fixtures.map((f) => ({
      id: f.id,
      homeTeam: { id: f.homeTeam.id, name: f.homeTeam.name, shortName: f.homeTeam.shortName, crestUrl: f.homeTeam.crestUrl },
      awayTeam: { id: f.awayTeam.id, name: f.awayTeam.name, shortName: f.awayTeam.shortName, crestUrl: f.awayTeam.crestUrl },
      kickoffAt: f.kickoffAt.toISOString(),
      status: f.status,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
      result: f.result,
    }));
  }
}
