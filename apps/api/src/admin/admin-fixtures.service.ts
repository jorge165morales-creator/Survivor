import { randomUUID } from "node:crypto";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { FixtureResult, FixtureStatus } from "@prisma/client";
import type { AdminFixtureDetail } from "@survivor/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { RecomputeService } from "../game-engine/recompute.service";
import { computeFixtureResult } from "../game-engine/fixture-result";
import { SPORTS_DATA_PROVIDER, type SportsDataProvider } from "../ingestion/providers/sports-data.provider.interface";

@Injectable()
export class AdminFixturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recompute: RecomputeService,
    @Inject(SPORTS_DATA_PROVIDER) private readonly provider: SportsDataProvider,
  ) {}

  // One-time-per-fixture venue fetch (see sports-data.provider.interface.ts)
  // — safe to call repeatedly, since ingestion.service.ts's upsertFixture
  // won't let a later regular sync's null venue overwrite this. Returns the
  // fixture unchanged (not an error) if the provider doesn't support this or
  // genuinely has no venue for this match.
  async backfillVenue(fixtureId: string): Promise<AdminFixtureDetail> {
    const fixture = await this.prisma.fixture.findUnique({ where: { id: fixtureId } });
    if (!fixture) {
      throw new NotFoundException("Fixture not found");
    }
    const venue = (await this.provider.getVenue?.(fixture.externalId)) ?? null;
    const updated = await this.prisma.fixture.update({
      where: { id: fixtureId },
      data: { venue: venue ?? fixture.venue },
      include: { homeTeam: true, awayTeam: true },
    });
    return this.toDetail(updated);
  }

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

  // Debug/support lookup — which league(s) and user(s) have already picked a
  // given fixture, so an admin can decide how to handle a data-cleanup
  // conflict (reassign vs. leave alone) with full information instead of
  // guessing blind.
  async findPicks(fixtureId: string) {
    const picks = await this.prisma.pick.findMany({
      where: { fixtureId },
      include: {
        league: { select: { id: true, name: true } },
        user: { select: { id: true, displayName: true, username: true } },
        team: { select: { name: true } },
      },
    });
    return picks.map((p) => ({
      pickId: p.id,
      league: p.league,
      user: p.user,
      pickedTeam: p.team.name,
    }));
  }

  // Moves every Pick (and its matching UsedTeam burn-record) off a fixture
  // and onto another one representing the same real-world match — the
  // scenario this exists for: a manually-entered fixture/team pair that a
  // later real sync didn't recognize (different externalId/team name) and
  // duplicated instead of reconciled, after a real pick already landed on
  // the manual one. Assumes positional continuity (old home team's picks
  // move to the new fixture's home team, same for away) since both fixtures
  // are the same two clubs on the same real match, just different rows.
  // Once this returns, delete(oldFixtureId) (and the old team rows, via
  // admin-teams.service.ts's delete()) should succeed since nothing
  // references them anymore.
  async reassignPicks(
    oldFixtureId: string,
    newFixtureId: string,
  ): Promise<{ picksMoved: number; usedTeamsMoved: number }> {
    const [oldFixture, newFixture] = await Promise.all([
      this.prisma.fixture.findUnique({ where: { id: oldFixtureId } }),
      this.prisma.fixture.findUnique({ where: { id: newFixtureId } }),
    ]);
    if (!oldFixture || !newFixture) {
      throw new NotFoundException("Fixture not found");
    }
    if (oldFixture.matchdayId !== newFixture.matchdayId) {
      throw new ConflictException("Both fixtures must belong to the same matchday");
    }

    const teamIdMap = new Map<string, string>([
      [oldFixture.homeTeamId, newFixture.homeTeamId],
      [oldFixture.awayTeamId, newFixture.awayTeamId],
    ]);

    const picks = await this.prisma.pick.findMany({ where: { fixtureId: oldFixtureId } });
    let usedTeamsMoved = 0;

    for (const pick of picks) {
      const newTeamId = teamIdMap.get(pick.teamId);
      if (!newTeamId) {
        throw new ConflictException(
          `Pick ${pick.id}'s team isn't the home or away team of the old fixture — refusing to guess`,
        );
      }
      await this.prisma.pick.update({
        where: { id: pick.id },
        data: { fixtureId: newFixtureId, teamId: newTeamId },
      });
      const updated = await this.prisma.usedTeam.updateMany({
        where: { usedInPickId: pick.id },
        data: { teamId: newTeamId },
      });
      usedTeamsMoved += updated.count;
    }

    return { picksMoved: picks.length, usedTeamsMoved };
  }

  // For cleaning up a bad manual entry — most commonly a fixture created by
  // hand (e.g. admin/fixtures POST ahead of a working provider sync) that a
  // later real sync doesn't recognize as the same match (different
  // externalId) and duplicates instead of updating. Refuses to delete a
  // fixture any real Pick already references, rather than silently
  // orphaning someone's pick.
  async delete(fixtureId: string): Promise<void> {
    const fixture = await this.prisma.fixture.findUnique({ where: { id: fixtureId } });
    if (!fixture) {
      throw new NotFoundException("Fixture not found");
    }
    const pickCount = await this.prisma.pick.count({ where: { fixtureId } });
    if (pickCount > 0) {
      throw new ConflictException(`Cannot delete — ${pickCount} pick(s) already reference this fixture`);
    }
    await this.prisma.fixture.delete({ where: { id: fixtureId } });
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
