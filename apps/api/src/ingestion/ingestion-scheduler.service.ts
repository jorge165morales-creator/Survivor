import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { IngestionService } from "./ingestion.service";
import { SeasonSyncService } from "./season-sync.service";
import { SPORTS_DATA_PROVIDER, type SportsDataProvider } from "./providers/sports-data.provider.interface";

// How long before kickoff a fixture enters the live-poll window (catches the
// SCHEDULED -> LIVE transition) and how long after kickoff it stays in the
// window (catches extra time / stoppage without polling matches all night).
const PRE_KICKOFF_WINDOW_MS = 30 * 60 * 1000;
const POST_KICKOFF_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * Only refreshes fixtures that already exist in our DB with a real provider
 * externalId (set by an admin via POST /admin/fixtures — see
 * admin-fixtures.controller.ts) — it doesn't discover new fixtures from the
 * provider's schedule. Auto-discovery would need a mapping from the
 * provider's "round" to our Matchday, which the provider payload doesn't
 * carry; matchday assignment (and knockout-bracket pairing) stays a manual
 * admin step for now.
 *
 * Free-tier-safe: the window query below is a local DB read, so it costs
 * nothing. The provider is only called when that query finds a fixture in
 * its kickoff window, and getLiveResults is called once per distinct
 * competition represented (not once globally — see that method's doc
 * comment on SportsDataProvider) — so a single-competition matchday evening
 * (~9h window, 10-minute cadence) costs ~54 requests, comfortably under
 * API-Football's free-plan 100/day cap. Running N competitions live at once
 * multiplies that by N.
 */
@Injectable()
export class IngestionSchedulerService {
  private readonly logger = new Logger(IngestionSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
    private readonly seasonSync: SeasonSyncService,
    @Inject(SPORTS_DATA_PROVIDER) private readonly provider: SportsDataProvider,
  ) {}

  // Cheap (one provider request per active season, see season-sync.service.ts)
  // and infrequent on purpose: this is how new fixtures/kickoff times get
  // discovered at all — e.g. once a season's draw happens, once knockout
  // pairings are confirmed — not how live scores get polled (that's
  // pollLiveMatchdays below, on its own tight window).
  @Cron("0 6 * * *")
  async syncSeasonFixtures(): Promise<void> {
    const summaries = await this.seasonSync.syncActiveSeasons();
    for (const summary of summaries) {
      this.logger.log(
        `Season sync ${summary.seasonId}: ${summary.matchdaysUpdated} matchdays, ${summary.fixturesSynced} fixtures`,
      );
    }
  }

  @Cron("*/10 * * * *")
  async pollLiveMatchdays(): Promise<void> {
    const now = Date.now();
    const inWindow = await this.prisma.fixture.findMany({
      where: {
        status: { in: ["SCHEDULED", "LIVE"] },
        kickoffAt: {
          gte: new Date(now - POST_KICKOFF_WINDOW_MS),
          lte: new Date(now + PRE_KICKOFF_WINDOW_MS),
        },
        // Practice seasons resolve via practice-replay-scheduler.service.ts,
        // not a real provider poll — their externalIds don't exist in
        // whichever real API this.provider talks to.
        matchday: { season: { isPractice: false } },
      },
      select: {
        externalId: true,
        matchdayId: true,
        // Highlightly's active-provider constant it needs to scope this
        // poll to (see SportsDataProvider.getLiveResults's doc comment) —
        // hardcoded to that field the same way ingestion.module.ts hardcodes
        // HighlightlyProvider as SPORTS_DATA_PROVIDER; both need updating
        // together if the active provider ever changes.
        matchday: { select: { season: { select: { competition: { select: { highlightlyLeagueId: true } } } } } },
      },
    });
    if (inWindow.length === 0) {
      return;
    }

    const matchdayIdByExternalId = new Map(inWindow.map((f) => [f.externalId, f.matchdayId]));
    const externalIdsByCompetition = new Map<string, string[]>();
    for (const f of inWindow) {
      const competitionExternalId = f.matchday.season.competition.highlightlyLeagueId;
      if (!competitionExternalId) continue; // competition not configured for the active provider
      const list = externalIdsByCompetition.get(competitionExternalId);
      if (list) {
        list.push(f.externalId);
      } else {
        externalIdsByCompetition.set(competitionExternalId, [f.externalId]);
      }
    }

    const results: Awaited<ReturnType<SportsDataProvider["getLiveResults"]>> = [];
    for (const [competitionExternalId, fixtureExternalIds] of externalIdsByCompetition) {
      try {
        results.push(...(await this.provider.getLiveResults(competitionExternalId, fixtureExternalIds)));
      } catch (err) {
        // Isolated per-competition so one provider hiccup doesn't stop the
        // poll from covering every other competition's live fixtures too.
        this.logger.error(`Live-window poll failed for competition ${competitionExternalId}`, err instanceof Error ? err.stack : err);
      }
    }

    for (const providerFixture of results) {
      const matchdayId = matchdayIdByExternalId.get(providerFixture.externalId);
      if (!matchdayId) continue; // provider returned something outside what we asked for
      try {
        await this.ingestion.upsertFixture(matchdayId, providerFixture);
      } catch (err) {
        // Isolated per-fixture so one bad mapping (e.g. a team externalId
        // that hasn't been synced to a real provider ID yet) logs and moves
        // on instead of aborting the rest of the matchday's poll.
        this.logger.error(`Failed to upsert fixture ${providerFixture.externalId}`, err instanceof Error ? err.stack : err);
      }
    }
  }
}
