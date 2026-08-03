import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { IngestionService } from "./ingestion.service";
import type { ProviderFixture } from "./providers/sports-data.provider.interface";

/**
 * Drives a practice season's fixtures through SCHEDULED -> LIVE -> FINISHED
 * on their synthetic schedule (see practice-season.service.ts), revealing
 * each fixture's real, already-known result via ReplayFixtureResult instead
 * of polling any external provider — there's nothing left to fetch, the
 * result was captured once at seed time. Kept entirely separate from
 * ingestion-scheduler.service.ts's pollLiveMatchdays, which is for real,
 * still-in-progress matches and deliberately excludes practice seasons.
 */
@Injectable()
export class PracticeReplayScheduler {
  private readonly logger = new Logger(PracticeReplayScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
  ) {}

  @Cron("*/5 * * * *")
  async tick(): Promise<void> {
    await this.markKickedOffFixturesLive();
    await this.revealDueResults();
  }

  private async markKickedOffFixturesLive(): Promise<void> {
    await this.prisma.fixture.updateMany({
      where: {
        status: "SCHEDULED",
        kickoffAt: { lte: new Date() },
        matchday: { season: { isPractice: true } },
      },
      data: { status: "LIVE" },
    });
  }

  private async revealDueResults(): Promise<void> {
    const due = await this.prisma.replayFixtureResult.findMany({
      where: {
        revealAt: { lte: new Date() },
        fixture: { status: { not: "FINISHED" } },
      },
      include: {
        fixture: { include: { homeTeam: true, awayTeam: true } },
      },
    });

    for (const result of due) {
      const { fixture } = result;
      const providerFixture: ProviderFixture = {
        externalId: fixture.externalId,
        homeTeamExternalId: fixture.homeTeam.externalId,
        awayTeamExternalId: fixture.awayTeam.externalId,
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
        homeTeamCrestUrl: fixture.homeTeam.crestUrl,
        awayTeamCrestUrl: fixture.awayTeam.crestUrl,
        round: "",
        kickoffAt: fixture.kickoffAt,
        venue: fixture.venue,
        status: "FINISHED",
        homeScore: result.homeScore,
        awayScore: result.awayScore,
      };
      try {
        await this.ingestion.upsertFixture(fixture.matchdayId, providerFixture);
      } catch (err) {
        this.logger.error(`Failed to reveal replay result for fixture ${fixture.id}`, err instanceof Error ? err.stack : err);
      }
    }
  }
}
