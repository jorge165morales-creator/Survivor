import { ForbiddenException, Injectable } from "@nestjs/common";
import type { StandingsResponse } from "@survivor/shared-types";
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

    const memberships = await this.prisma.leagueMembership.findMany({
      where: { leagueId, status: { not: "LEFT" } },
      include: { user: true, eliminatedAtMatchday: { select: { sequence: true } } },
    });

    // Alive members first; among eliminated members, the one knocked out
    // latest (higher matchday sequence) ranks above one knocked out earlier.
    const entries = memberships
      .map((m) => ({
        userId: m.userId,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        status: m.status,
        eliminatedAtMatchdaySequence: m.eliminatedAtMatchday?.sequence ?? null,
        tieForgivenessUsed: m.tieForgivenessUsed,
      }))
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "ACTIVE" ? -1 : 1;
        }
        return (b.eliminatedAtMatchdaySequence ?? 0) - (a.eliminatedAtMatchdaySequence ?? 0);
      });

    return { leagueId, entries };
  }
}
