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
          select: { seasonId: true, paymentRequired: true },
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
          // When to start subjecting this member to the game engine at all.
          // For a normal league it's simply when they joined — without this,
          // anyone joining after matchday 1 has already locked would be
          // "eliminated" the instant a recompute ran for them, having never
          // gotten a chance to pick. For a payment-required league, an unpaid
          // member isn't eligible yet at all (null skips them entirely below);
          // once paid, paidAt plays the same role joinedAt normally would, so
          // matchdays that locked before they were confirmed paid don't count
          // against them either.
          const eligibleFrom = league.paymentRequired
            ? membership.hasPaid
              ? (membership.paidAt ?? membership.joinedAt)
              : null
            : membership.joinedAt;
          if (!eligibleFrom) {
            continue; // Not paid yet — not participating, leave state untouched.
          }

          const picks = await tx.pick.findMany({
            where: { leagueId, userId: membership.userId },
            include: { fixture: true },
          });
          const pickByMatchdayId = new Map(picks.map((p) => [p.matchdayId, p]));

          // Seeded from the persisted value, NOT false: buy-back is an
          // explicit one-time grant (not a derived-fresh-every-pass property
          // like the old tie-forgiveness), so it must stay spent across
          // replay passes even if a later fixture correction reshuffles
          // which matchday would otherwise have eliminated this member.
          let buyBackConsumed = membership.buyBackUsed;
          let eliminatedAtMatchdayId: string | null = null;
          let finalStatus: MembershipStatus = "ACTIVE";

          for (const matchday of matchdays) {
            if (matchday.lockAt < eligibleFrom) {
              continue; // Locked before this member was eligible to play — doesn't count.
            }

            const pick = pickByMatchdayId.get(matchday.id);

            if (!pick) {
              if (now >= matchday.lockAt) {
                // Matchday locked with no pick on record — eliminated.
                if (membership.buyBackAvailable && !buyBackConsumed) {
                  buyBackConsumed = true;
                  continue;
                }
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
            });

            await this.setOutcomeIfChanged(tx, pick.id, pick.outcome, survival.outcome);
            if (survival.eliminatesUser) {
              if (membership.buyBackAvailable && !buyBackConsumed) {
                buyBackConsumed = true;
                continue; // pick.outcome still factually records LOSS above
              }
              finalStatus = "ELIMINATED";
              eliminatedAtMatchdayId = matchday.id;
              break;
            }
          }

          if (
            membership.status !== finalStatus ||
            membership.eliminatedAtMatchdayId !== eliminatedAtMatchdayId ||
            membership.buyBackUsed !== buyBackConsumed
          ) {
            await tx.leagueMembership.update({
              where: { id: membership.id },
              data: { status: finalStatus, eliminatedAtMatchdayId, buyBackUsed: buyBackConsumed },
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
