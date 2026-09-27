import { Injectable, NotFoundException } from "@nestjs/common";
import type { CompetitionStructure, MatchdaySummary, SeasonSummary } from "@survivor/shared-types";
import type { Competition, Season } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

// Shared with leagues.service.ts, which nests a SeasonSummary on every
// LeagueSummary/LeagueDetail — one mapping so both stay in sync.
export function toSeasonSummary(season: Season & { competition: Competition }): SeasonSummary {
  return {
    id: season.id,
    name: season.name,
    year: season.year,
    isActive: season.isActive,
    competition: {
      slug: season.competition.slug,
      name: season.competition.name,
      structure: season.competition.structure as CompetitionStructure,
      matchdayCount: season.competition.matchdayCount,
    },
  };
}

@Injectable()
export class SeasonsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActive(): Promise<SeasonSummary> {
    const season = await this.prisma.season.findFirst({ where: { isActive: true }, include: { competition: true } });
    if (!season) {
      throw new NotFoundException("No active season");
    }
    return toSeasonSummary(season);
  }

  // Includes inactive seasons (e.g. a completed season seeded with real
  // historical results purely for testing) so a commissioner can choose to
  // create a league against one instead of only the live active season.
  async getAll(): Promise<SeasonSummary[]> {
    const seasons = await this.prisma.season.findMany({
      orderBy: { year: "desc" },
      include: { competition: true },
    });
    return seasons.map(toSeasonSummary);
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
