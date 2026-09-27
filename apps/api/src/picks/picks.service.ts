import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PickHistoryResponse, PickOptionsResponse } from "@survivor/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { validatePick, type PickRejectionReason } from "../game-engine/pick-validation.service";
import { cycleIndexForSequence } from "../game-engine/team-cycle";
import { RecomputeService } from "../game-engine/recompute.service";

function rejectionToException(reason: PickRejectionReason): Error {
  switch (reason) {
    case "ALREADY_ELIMINATED":
      return new ForbiddenException("You're no longer active in this league");
    case "MATCHDAY_LOCKED":
      return new ForbiddenException("Picks are locked for this matchday");
    case "TEAM_ALREADY_USED":
      return new BadRequestException("You've already used this team in this league");
  }
}

@Injectable()
export class PicksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recompute: RecomputeService,
  ) {}

  // How many distinct teams a player must cycle through before a used team
  // becomes available again — see team-cycle.ts. Queried per-season rather
  // than read off Competition.matchdayCount (which is a matchday count, not
  // a team count, and the two aren't always the same competition-to-
  // competition) or cached, since this is a cheap count query and team
  // rosters only ever change between seasons, not within one.
  private teamCountForSeason(seasonId: string): Promise<number> {
    return this.prisma.team.count({ where: { seasons: { some: { id: seasonId } } } });
  }

  private async requireMembership(leagueId: string, userId: string) {
    const membership = await this.prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });
    if (!membership || membership.status === "LEFT") {
      throw new ForbiddenException("You are not a member of this league");
    }
    return membership;
  }

  async getPickOptions(leagueId: string, matchdayId: string, userId: string): Promise<PickOptionsResponse> {
    await this.requireMembership(leagueId, userId);

    const matchday = await this.prisma.matchday.findUnique({
      where: { id: matchdayId },
      include: { fixtures: { include: { homeTeam: true, awayTeam: true }, orderBy: { kickoffAt: "asc" } } },
    });
    if (!matchday) {
      throw new NotFoundException("Matchday not found");
    }

    const [usedTeams, currentPick, teamCount] = await Promise.all([
      this.prisma.usedTeam.findMany({
        where: { leagueId, userId },
        include: { usedInPick: { select: { matchdayId: true, matchday: { select: { sequence: true } } } } },
      }),
      this.prisma.pick.findUnique({ where: { leagueId_userId_matchdayId: { leagueId, userId, matchdayId } } }),
      this.teamCountForSeason(matchday.seasonId),
    ]);
    const currentCycle = cycleIndexForSequence(matchday.sequence, teamCount);

    return {
      matchdayId: matchday.id,
      sequence: matchday.sequence,
      type: matchday.type,
      lockAt: matchday.lockAt.toISOString(),
      isLocked: new Date() >= matchday.lockAt,
      fixtures: matchday.fixtures.map((f) => ({
        id: f.id,
        homeTeam: { id: f.homeTeam.id, name: f.homeTeam.name, shortName: f.homeTeam.shortName, crestUrl: f.homeTeam.crestUrl },
        awayTeam: { id: f.awayTeam.id, name: f.awayTeam.name, shortName: f.awayTeam.shortName, crestUrl: f.awayTeam.crestUrl },
        kickoffAt: f.kickoffAt.toISOString(),
        venue: f.venue,
        status: f.status,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        result: f.result,
      })),
      usedTeamIds: usedTeams
        .filter((u) => u.usedInPick.matchdayId !== matchdayId)
        // Only teams burned within the current cycle still block a pick —
        // see team-cycle.ts. A no-op filter for any competition that never
        // plays enough matchdays to complete one (e.g. the 17-matchday
        // Champions League), since every matchday is cycle 0 there.
        .filter((u) => cycleIndexForSequence(u.usedInPick.matchday.sequence, teamCount) === currentCycle)
        .map((u) => u.teamId),
      currentPick: currentPick ? { teamId: currentPick.teamId, submittedAt: currentPick.submittedAt.toISOString() } : null,
    };
  }

  async submitPick(leagueId: string, matchdayId: string, userId: string, teamId: string) {
    const membership = await this.requireMembership(leagueId, userId);

    // Browsing (getPickOptions) is allowed while unpaid — "look at the
    // teams" — but actually submitting a pick is the "enter the league"
    // action a paymentRequired league gates on the commissioner's say-so.
    const league = await this.prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { paymentRequired: true },
    });
    if (league.paymentRequired && !membership.hasPaid) {
      throw new ForbiddenException("Waiting for the commissioner to confirm your payment");
    }

    const matchday = await this.prisma.matchday.findUnique({
      where: { id: matchdayId },
      include: { fixtures: true },
    });
    if (!matchday) {
      throw new NotFoundException("Matchday not found");
    }
    const fixture = matchday.fixtures.find((f) => f.homeTeamId === teamId || f.awayTeamId === teamId);
    if (!fixture) {
      throw new BadRequestException("This team is not playing in this matchday");
    }

    const existingPick = await this.prisma.pick.findUnique({
      where: { leagueId_userId_matchdayId: { leagueId, userId, matchdayId } },
    });

    const teamCount = await this.teamCountForSeason(matchday.seasonId);
    const cycleIndex = cycleIndexForSequence(matchday.sequence, teamCount);

    // Scoped to the current cycle (see team-cycle.ts) — a team used in an
    // earlier, already-completed cycle doesn't block a repeat pick. A no-op
    // restriction for a competition that never plays enough matchdays to
    // complete one, since cycleIndex is always 0 there.
    const usedTeamRows = await this.prisma.usedTeam.findMany({
      where: {
        leagueId,
        userId,
        cycleIndex,
        ...(existingPick ? { NOT: { usedInPickId: existingPick.id } } : {}),
      },
    });

    const validation = validatePick({
      membershipStatus: membership.status,
      matchdayLockAt: matchday.lockAt,
      now: new Date(),
      usedTeamIdsExcludingCurrentMatchday: new Set(usedTeamRows.map((u) => u.teamId)),
      requestedTeamId: teamId,
    });
    if (!validation.ok) {
      throw rejectionToException(validation.reason);
    }

    try {
      const pick = await this.prisma.$transaction(async (tx) => {
        const pick = existingPick
          ? await tx.pick.update({
              where: { id: existingPick.id },
              data: {
                teamId,
                fixtureId: fixture.id,
                submittedAt: new Date(),
                lockedAt: matchday.lockAt,
                outcome: "PENDING",
              },
            })
          : await tx.pick.create({
              data: {
                leagueId,
                userId,
                matchdayId,
                teamId,
                fixtureId: fixture.id,
                lockedAt: matchday.lockAt,
                outcome: "PENDING",
              },
            });

        if (existingPick) {
          await tx.usedTeam.update({ where: { usedInPickId: pick.id }, data: { teamId, cycleIndex } });
        } else {
          await tx.usedTeam.create({ data: { leagueId, userId, teamId, cycleIndex, usedInPickId: pick.id } });
        }

        return pick;
      });

      // Usually a no-op (the picked fixture hasn't been played yet, so this
      // just reconfirms PENDING) — but it's what lets a pick against an
      // already-finished fixture (e.g. the historical test season, seeded
      // fully resolved) resolve immediately instead of sitting PENDING
      // forever with nothing left to trigger a recompute later.
      await this.recompute.recomputeLeague(leagueId);

      return pick;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // The UsedTeam unique constraint is the concurrency backstop for the
        // TEAM_ALREADY_USED check above — this only fires on a genuine race
        // (e.g. a double-tap submitting the same new team twice at once).
        throw new ConflictException("You've already used this team in this league");
      }
      throw err;
    }
  }

  async getMyPicks(leagueId: string, userId: string): Promise<PickHistoryResponse> {
    await this.requireMembership(leagueId, userId);

    const picks = await this.prisma.pick.findMany({
      where: { leagueId, userId },
      include: { team: true, matchday: true },
      orderBy: { matchday: { sequence: "asc" } },
    });

    return {
      entries: picks.map((p) => ({
        matchdaySequence: p.matchday.sequence,
        matchdayType: p.matchday.type,
        roundLabel: p.matchday.roundLabel,
        team: { id: p.team.id, name: p.team.name, shortName: p.team.shortName, crestUrl: p.team.crestUrl },
        outcome: p.outcome,
        submittedAt: p.submittedAt.toISOString(),
      })),
    };
  }
}
