import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { FixtureResult, FixtureStatus } from "@prisma/client";
import type { AdminFixtureDetail } from "@survivor/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { RecomputeService } from "../game-engine/recompute.service";
import { computeFixtureResult } from "../game-engine/fixture-result";

@Injectable()
export class AdminFixturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recompute: RecomputeService,
  ) {}

  async create(
    matchdayId: string,
    homeTeamId: string,
    awayTeamId: string,
    kickoffAt: string,
    externalId?: string,
    venue?: string,
  ): Promise<AdminFixtureDetail> {
    const matchday = await this.prisma.matchday.findUnique({ where: { id: matchdayId } });
    if (!matchday) {
      throw new NotFoundException("Matchday not found");
    }
    const fixture = await this.prisma.fixture.create({
      data: {
        matchdayId,
        homeTeamId,
        awayTeamId,
        kickoffAt: new Date(kickoffAt),
        venue: venue ?? null,
        // Pass the real API-Football fixture id here so the live-ingestion
        // poller (ingestion-scheduler.service.ts) picks this fixture up.
        // Left unset, a manual- prefixed id is generated instead, which can
        // never collide with a real provider id — this fixture then only
        // gets results via the /override endpoint.
        externalId: externalId ?? `manual-${randomUUID()}`,
        status: "SCHEDULED",
      },
      include: { homeTeam: true, awayTeam: true },
    });
    return this.toDetail(fixture);
  }

  async overrideResult(
    fixtureId: string,
    adminUserId: string,
    input: { homeScore: number; awayScore: number; status: FixtureStatus },
  ): Promise<AdminFixtureDetail> {
    const existing = await this.prisma.fixture.findUnique({ where: { id: fixtureId } });
    if (!existing) {
      throw new NotFoundException("Fixture not found");
    }
    const result = input.status === "FINISHED" ? computeFixtureResult(input.homeScore, input.awayScore) : null;

    const fixture = await this.prisma.fixture.update({
      where: { id: fixtureId },
      data: {
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        status: input.status,
        result,
        correctedByAdminId: adminUserId,
        correctedAt: new Date(),
      },
      include: { homeTeam: true, awayTeam: true },
    });

    await this.recompute.recomputeLeaguesForFixture(fixture.id);

    return this.toDetail(fixture);
  }

  private toDetail(fixture: {
    id: string;
    matchdayId: string;
    homeTeam: { id: string; name: string; shortName: string; crestUrl: string | null };
    awayTeam: { id: string; name: string; shortName: string; crestUrl: string | null };
    kickoffAt: Date;
    venue: string | null;
    status: FixtureStatus;
    homeScore: number | null;
    awayScore: number | null;
    result: FixtureResult | null;
  }): AdminFixtureDetail {
    return {
      id: fixture.id,
      matchdayId: fixture.matchdayId,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      kickoffAt: fixture.kickoffAt.toISOString(),
      venue: fixture.venue,
      status: fixture.status,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      result: fixture.result,
    };
  }
}
