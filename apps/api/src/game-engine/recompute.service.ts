import { Injectable, Logger } from "@nestjs/common";
import type { MembershipStatus, PickOutcome, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { computeSurvival } from "./survival.service";

/**
 * Triggered after ingestion marks a fixture FINISHED or an admin corrects a
 * result. Rather than patching individual rows, it replays a league's ENTIRE
 * season from matchday 1 forward inside one transaction and writes whatever
 * state that replay converges to. That's what makes a late result
 * correction — or an out-of-order admin override — safe to just re-run: the
 * replay always starts from a clean slate, so there's no drift between
 * "what actually happened" and "what we last wrote."
 *
 * Product rule (not explicitly specified by the user, decided here): a
 * matchday that locks with no pick submitted eliminates the user, same as a
 * loss — this is standard survivor-pool behavior. Adjust here if that's not
 * the intended rule.
 */
@Injectable()
export class RecomputeService {
  private readonly logger = new Logger(RecomputeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recomputeLeaguesForFixture(fixtureId: string): Promise<void> {
    const fixture = await this.prisma.fixture.findUniqueOrThrow({
      where: { id: fixtureId },
      include: { matchday: true },
    });
    const leagues = await this.prisma.league.findMany({
      where: { seasonId: fixture.matchday.seasonId },
      select: { id: true },
    });
    for (const league of leagues) {
      await this.recomputeLeague(league.id);
    }
  }

  async recomputeLeague(leagueId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        // Advisory lock scoped to this transaction: serializes concurrent
        // recompute triggers for the same league (e.g. an ingestion poll and
        // an admin override racing) without needing a separate lock table.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${leagueId}))`;

        const league = await tx.league.findUniqueOrThrow({
          where: { id: leagueId },
          select: { seasonId: true },
        });
        const matchdays = await tx.matchday.findMany({
          where: { seasonId: league.seasonId },
          orderBy: { sequence: "asc" },
        });
        const memberships = await tx.leagueMembership.findMany({
          where: { leagueId, status: { not: "LEFT" } },
        });

        const now = new Date();

        for (const membership of memberships) {
          const picks = await tx.pick.findMany({
            where: { leagueId, userId: membership.userId },
            include: { fixture: true },
          });
          const pickByMatchdayId = new Map(picks.map((p) => [p.matchdayId, p]));

          let tieForgivenessUsed = false;
          let eliminatedAtMatchdayId: string | null = null;
          let finalStatus: MembershipStatus = "ACTIVE";

          for (const matchday of matchdays) {
            const pick = pickByMatchdayId.get(matchday.id);

            if (!pick) {
              if (now >= matchday.lockAt) {
                // Matchday locked with no pick on record — eliminated.
                finalStatus = "ELIMINATED";
                eliminatedAtMatchdayId = matchday.id;
              }
              break; // Either eliminated here, or this matchday hasn't happened yet.
            }

            const fixture = pick.fixture;
            if (!fixture || fixture.status !== "FINISHED" || !fixture.result) {
              await this.setOutcomeIfChanged(tx, pick.id, pick.outcome, "PENDING");
              break; // Undetermined — don't evaluate matchdays past this one.
            }

            const survival = computeSurvival({
              pickedTeamId: pick.teamId,
              fixtureHomeTeamId: fixture.homeTeamId,
              fixtureAwayTeamId: fixture.awayTeamId,
              result: fixture.result,
              tieForgivenessAlreadyUsed: tieForgivenessUsed,
            });

            await this.setOutcomeIfChanged(tx, pick.id, pick.outcome, survival.outcome);
            if (survival.consumesTieForgiveness) {
              tieForgivenessUsed = true;
            }
            if (survival.eliminatesUser) {
              finalStatus = "ELIMINATED";
              eliminatedAtMatchdayId = matchday.id;
              break;
            }
          }

          if (
            membership.status !== finalStatus ||
            membership.eliminatedAtMatchdayId !== eliminatedAtMatchdayId ||
            membership.tieForgivenessUsed !== tieForgivenessUsed
          ) {
            await tx.leagueMembership.update({
              where: { id: membership.id },
              data: { status: finalStatus, eliminatedAtMatchdayId, tieForgivenessUsed },
            });
          }
        }
      },
      { timeout: 30_000 },
    );
    this.logger.log(`Recomputed league ${leagueId}`);
  }

  private async setOutcomeIfChanged(
    tx: Prisma.TransactionClient,
    pickId: string,
    current: PickOutcome,
    next: PickOutcome,
  ): Promise<void> {
    if (current !== next) {
      await tx.pick.update({ where: { id: pickId }, data: { outcome: next } });
    }
  }
}
