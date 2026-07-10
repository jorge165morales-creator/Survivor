import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecomputeService } from "../game-engine/recompute.service";
import { computeFixtureResult } from "../game-engine/fixture-result";
import type { ProviderFixture } from "./providers/sports-data.provider.interface";

/**
 * Upserts one provider fixture into our schema and triggers a recompute if
 * it just became FINISHED (or its result changed on a later poll — e.g. a
 * post-match VAR correction from the provider). This is deliberately the
 * same "upsert result, then recompute" shape as the admin override path
 * (admin-fixtures.service.ts) — one way results get applied, whether from a
 * live provider or a manual correction.
 *
 * What's NOT here yet: the scheduler (cron cadence, matchday-window
 * detection) and the mapping from a provider's "round" to our Matchday —
 * both need a real provider key to build against and test, which is still
 * an open decision (see the build plan's flagged open items). This service
 * is provider-agnostic and fully unit-tested against a fake provider in the
 * meantime.
 */
@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recompute: RecomputeService,
  ) {}

  async upsertFixture(matchdayId: string, providerFixture: ProviderFixture): Promise<void> {
    const [homeTeam, awayTeam] = await Promise.all([
      this.prisma.team.findUniqueOrThrow({ where: { externalId: providerFixture.homeTeamExternalId } }),
      this.prisma.team.findUniqueOrThrow({ where: { externalId: providerFixture.awayTeamExternalId } }),
    ]);

    const result =
      providerFixture.status === "FINISHED"
        ? computeFixtureResult(providerFixture.homeScore ?? 0, providerFixture.awayScore ?? 0)
        : null;

    const existing = await this.prisma.fixture.findUnique({
      where: { externalId: providerFixture.externalId },
    });

    const fixture = await this.prisma.fixture.upsert({
      where: { externalId: providerFixture.externalId },
      create: {
        matchdayId,
        externalId: providerFixture.externalId,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        kickoffAt: providerFixture.kickoffAt,
        status: providerFixture.status,
        homeScore: providerFixture.homeScore,
        awayScore: providerFixture.awayScore,
        result,
        lastSyncedAt: new Date(),
      },
      update: {
        status: providerFixture.status,
        homeScore: providerFixture.homeScore,
        awayScore: providerFixture.awayScore,
        result,
        lastSyncedAt: new Date(),
      },
    });

    const justFinishedOrChanged =
      providerFixture.status === "FINISHED" &&
      (!existing || existing.status !== "FINISHED" || existing.result !== result);

    if (justFinishedOrChanged) {
      await this.recompute.recomputeLeaguesForFixture(fixture.id);
    }
  }
}
