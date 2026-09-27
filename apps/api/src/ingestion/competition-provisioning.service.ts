import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { MatchdayType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ensureCompetition, isKnownCompetitionSlug } from "./competitions";
import { buildMatchdayCalendar, type MatchdaySeed } from "../../prisma/seed";

export interface ProvisionSeasonInput {
  competitionSlug: string;
  name: string;
  year: number;
}

export interface ProvisionSeasonResult {
  seasonId: string;
  competitionId: string;
  matchdaysCreated: number;
}

/**
 * One-time setup step for adding a brand-new season for a competition that
 * isn't already running — the League Stage/knockout equivalent of
 * prisma/seed.ts's seedUpcomingSeason, but usable for any competition in
 * competitions.ts, not just the Champions League. Creates the Season row
 * plus its matchdays with placeholder, evenly-spaced lockAt times; the very
 * next admin/season-sync run (or the daily cron) overwrites them with real
 * kickoff times as soon as the provider has fixtures for the season — same
 * as how seedUpcomingSeason's placeholder teams get backfilled by
 * season-sync.service.ts's team resolution.
 */
@Injectable()
export class CompetitionProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async provisionSeason(input: ProvisionSeasonInput): Promise<ProvisionSeasonResult> {
    if (!isKnownCompetitionSlug(input.competitionSlug)) {
      throw new NotFoundException(`Unknown competition slug "${input.competitionSlug}"`);
    }
    const { id: competitionId } = await ensureCompetition(this.prisma, input.competitionSlug);
    const competition = await this.prisma.competition.findUniqueOrThrow({ where: { id: competitionId } });

    const existing = await this.prisma.season.findFirst({
      where: { competitionId, year: input.year },
    });
    if (existing) {
      throw new ConflictException(`A season for "${competition.name}" ${input.year} already exists (${existing.id})`);
    }

    const season = await this.prisma.season.create({
      data: { name: input.name, year: input.year, isActive: true, competitionId },
    });

    const matchdays = buildPlaceholderCalendar(competition.structure, competition.matchdayCount);
    await this.prisma.matchday.createMany({
      data: matchdays.map((m) => ({ ...m, seasonId: season.id })),
    });

    return { seasonId: season.id, competitionId, matchdaysCreated: matchdays.length };
  }
}

function buildPlaceholderCalendar(structure: string, matchdayCount: number): MatchdaySeed[] {
  if (structure === "ROUND_ROBIN") {
    const base = addDays(new Date(), 7);
    return Array.from({ length: matchdayCount }, (_, i) => ({
      sequence: i + 1,
      type: "GROUP" as MatchdayType,
      roundLabel: `Matchday ${i + 1}`,
      lockAt: addDays(base, i * 7),
    }));
  }

  // GROUP_AND_KNOCKOUT's calendar shape (8 group matchdays + 4 two-legged
  // knockout rounds + a final) is specific to exactly 17 matchdays — the
  // Champions League's current format. A different group-and-knockout
  // competition with a different matchdayCount would need its own bespoke
  // calendar, so this deliberately refuses to guess one rather than produce
  // a silently wrong shape.
  if (matchdayCount !== 17) {
    throw new Error(
      `No placeholder calendar builder for a GROUP_AND_KNOCKOUT competition with matchdayCount ${matchdayCount} — write one, same as prisma/seed.ts's buildMatchdayCalendar.`,
    );
  }
  return buildMatchdayCalendar();
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
