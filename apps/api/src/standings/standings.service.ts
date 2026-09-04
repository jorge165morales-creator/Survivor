import { ForbiddenException, Injectable } from "@nestjs/common";
import type { StandingsGridResponse, StandingsResponse } from "@survivor/shared-types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class StandingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStandings(leagueId: string, userId: string): Promise<StandingsResponse> {
    const membership = await this.prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });
    if (!membership || membership.status === "LEFT") {
      throw new ForbiddenException("You are not a member of this league");
    }

    const league = await this.prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { paymentRequired: true },
    });

    const memberships = (
      await this.prisma.leagueMembership.findMany({
        where: { leagueId, status: { not: "LEFT" } },
        include: { user: true, eliminatedAtMatchday: { select: { sequence: true } } },
      })
    ).filter((m) => !league.paymentRequired || m.hasPaid);

    // Alive members first; among eliminated members, the one knocked out
    // latest (higher matchday sequence) ranks above one knocked out earlier.
    const entries = memberships
      .map((m) => ({
        userId: m.userId,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        status: m.status,
        eliminatedAtMatchdaySequence: m.eliminatedAtMatchday?.sequence ?? null,
        buyBackAvailable: m.buyBackAvailable,
        buyBackUsed: m.buyBackUsed,
      }))
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "ACTIVE" ? -1 : 1;
        }
        const eliminatedDiff = (b.eliminatedAtMatchdaySequence ?? 0) - (a.eliminatedAtMatchdaySequence ?? 0);
        if (eliminatedDiff !== 0) {
          return eliminatedDiff;
        }
        // Tie-break: between two members level on matchday (both eliminated
        // the same round, or both still alive), the one who hasn't spent
        // their buy-back ranks above the one who has.
        if (a.buyBackUsed !== b.buyBackUsed) {
          return a.buyBackUsed ? 1 : -1;
        }
        return 0;
      });

    return { leagueId, entries };
  }

  async getStandingsGrid(leagueId: string, userId: string): Promise<StandingsGridResponse> {
    const membership = await this.prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });
    if (!membership || membership.status === "LEFT") {
      throw new ForbiddenException("You are not a member of this league");
    }

    const league = await this.prisma.league.findUniqueOrThrow({ where: { id: leagueId } });

    const [matchdays, allMemberships, picks] = await Promise.all([
      this.prisma.matchday.findMany({
        where: { seasonId: league.seasonId },
        orderBy: { sequence: "asc" },
      }),
      this.prisma.leagueMembership.findMany({
        where: { leagueId, status: { not: "LEFT" } },
        include: { user: true, eliminatedAtMatchday: { select: { sequence: true } } },
      }),
      this.prisma.pick.findMany({
        where: { leagueId },
        include: { team: true, fixture: { include: { homeTeam: true, awayTeam: true } } },
      }),
    ]);
    const memberships = allMemberships.filter((m) => !league.paymentRequired || m.hasPaid);

    // A matchday locks all at once at its earliest fixture's kickoff (see
    // picks.service.ts) specifically so no one can use info from earlier in
    // the round to inform a later pick. Showing someone else's pick before
    // their own matchday has locked would defeat that the same way an early
    // result would, so every member's row only reveals a pick once its
    // matchday has locked — except the requesting user's own row, which
    // always shows their own picks back to them.
    const now = new Date();
    const lockAtByMatchday = new Map(matchdays.map((m) => [m.id, m.lockAt]));

    const picksByUser = new Map<string, Map<string, (typeof picks)[number]>>();
    for (const pick of picks) {
      if (pick.userId !== userId) {
        const lockAt = lockAtByMatchday.get(pick.matchdayId);
        if (!lockAt || now < lockAt) continue;
      }
      const forUser = picksByUser.get(pick.userId) ?? new Map();
      forUser.set(pick.matchdayId, pick);
      picksByUser.set(pick.userId, forUser);
    }

    // Same ordering as getStandings: alive members first, then eliminated
    // members ranked by the matchday they went out on (latest first).
    const rows = memberships
      .map((m) => {
        const userPicks = picksByUser.get(m.userId);
        const picksRecord: StandingsGridResponse["rows"][number]["picks"] = {};
        if (userPicks) {
          for (const [matchdayId, pick] of userPicks) {
            // submitPick always sets fixtureId to the matched fixture, so this
            // is just satisfying the schema's nullable relation, not a real case.
            if (!pick.fixture) continue;
            picksRecord[matchdayId] = {
              team: {
                id: pick.team.id,
                name: pick.team.name,
                shortName: pick.team.shortName,
                crestUrl: pick.team.crestUrl,
              },
              outcome: pick.outcome,
              fixture: {
                id: pick.fixture.id,
                homeTeam: {
                  id: pick.fixture.homeTeam.id,
                  name: pick.fixture.homeTeam.name,
                  shortName: pick.fixture.homeTeam.shortName,
                  crestUrl: pick.fixture.homeTeam.crestUrl,
                },
                awayTeam: {
                  id: pick.fixture.awayTeam.id,
                  name: pick.fixture.awayTeam.name,
                  shortName: pick.fixture.awayTeam.shortName,
                  crestUrl: pick.fixture.awayTeam.crestUrl,
                },
                kickoffAt: pick.fixture.kickoffAt.toISOString(),
                venue: pick.fixture.venue,
                status: pick.fixture.status,
                homeScore: pick.fixture.homeScore,
                awayScore: pick.fixture.awayScore,
                result: pick.fixture.result,
              },
            };
          }
        }
        return {
          userId: m.userId,
          displayName: m.user.displayName,
          status: m.status,
          eliminatedAtMatchdaySequence: m.eliminatedAtMatchday?.sequence ?? null,
          buyBackAvailable: m.buyBackAvailable,
          buyBackUsed: m.buyBackUsed,
          picks: picksRecord,
        };
      })
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "ACTIVE" ? -1 : 1;
        }
        const eliminatedDiff = (b.eliminatedAtMatchdaySequence ?? 0) - (a.eliminatedAtMatchdaySequence ?? 0);
        if (eliminatedDiff !== 0) {
          return eliminatedDiff;
        }
        // Tie-break: between two members level on matchday (both eliminated
        // the same round, or both still alive), the one who hasn't spent
        // their buy-back ranks above the one who has.
        if (a.buyBackUsed !== b.buyBackUsed) {
          return a.buyBackUsed ? 1 : -1;
        }
        return 0;
      });

    return {
      leagueId,
      matchdays: matchdays.map((m) => ({
        id: m.id,
        sequence: m.sequence,
        type: m.type,
        roundLabel: m.roundLabel,
      })),
      rows,
    };
  }
}
