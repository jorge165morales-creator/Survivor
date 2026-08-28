import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IngestionService } from "./ingestion.service";
import { groupProviderFixturesIntoMatchdays } from "./round-mapping";
import { resolveTeam } from "./team-resolution";
import { SPORTS_DATA_PROVIDER, type ProviderFixture, type SportsDataProvider } from "./providers/sports-data.provider.interface";

// This app is UEFA Champions League-only — no per-season/competition config
// exists anywhere else in the schema, so hardcoding API-Football's league id
// here matches that rather than adding a column nothing else would use.
const UEFA_CHAMPIONS_LEAGUE_ID = "2";

export interface SeasonSyncSummary {
  seasonId: string;
  matchdaysUpdated: number;
  fixturesSynced: number;
  error?: string;
}

/**
 * Pulls the full competition schedule for a season from the sports-data
 * provider and reconciles it into our schema: derives each matchday's
 * lockAt from its fixtures' real kickoff times (see round-mapping.ts for how
 * provider rounds map to our pre-seeded 17 matchdays), and resolves/creates
 * the Team rows each fixture references.
 *
 * Deliberately only ever touches the *active* season — the historical test
 * season (prisma/seed.ts) is intentionally frozen, hand-seeded data with
 * fake externalIds, and re-syncing it against the real provider would
 * duplicate its fixtures.
 */
@Injectable()
export class SeasonSyncService {
  private readonly logger = new Logger(SeasonSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
    @Inject(SPORTS_DATA_PROVIDER) private readonly provider: SportsDataProvider,
  ) {}

  async syncActiveSeasons(): Promise<SeasonSyncSummary[]> {
    const seasons = await this.prisma.season.findMany({ where: { isActive: true } });
    const summaries: SeasonSyncSummary[] = [];
    for (const season of seasons) {
      try {
        summaries.push(await this.syncSeason(season.id, season.year));
      } catch (err) {
        this.logger.error(`Season sync failed for ${season.id}`, err instanceof Error ? err.stack : err);
        summaries.push({
          seasonId: season.id,
          matchdaysUpdated: 0,
          fixturesSynced: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return summaries;
  }

  async syncSeason(seasonId: string, seasonYear: number): Promise<SeasonSyncSummary> {
    const providerFixtures = await this.provider.getFixtures(UEFA_CHAMPIONS_LEAGUE_ID, seasonYear);
    const groups = groupProviderFixturesIntoMatchdays(providerFixtures);

    let matchdaysUpdated = 0;
    let fixturesSynced = 0;

    for (const group of groups) {
      const matchday = await this.prisma.matchday.findUnique({
        where: { seasonId_sequence: { seasonId, sequence: group.sequence } },
      });
      if (!matchday) {
        // Shouldn't happen once prisma/seed.ts has run — all 17 matchdays for
        // an active season are pre-created. Logged and skipped rather than
        // thrown so one bad sequence doesn't abort the rest of the sync.
        this.logger.warn(`No matchday at sequence ${group.sequence} for season ${seasonId} — skipping`);
        continue;
      }

      const lockAt = earliestKickoff(group.fixtures);
      if (lockAt.getTime() !== matchday.lockAt.getTime()) {
        await this.prisma.matchday.update({ where: { id: matchday.id }, data: { lockAt } });
      }
      matchdaysUpdated += 1;

      for (const fixture of group.fixtures) {
        await resolveTeam(this.prisma, seasonId, fixture.homeTeamExternalId, fixture.homeTeamName, fixture.homeTeamCrestUrl);
        await resolveTeam(this.prisma, seasonId, fixture.awayTeamExternalId, fixture.awayTeamName, fixture.awayTeamCrestUrl);
        await this.ingestion.upsertFixture(matchday.id, fixture);
        fixturesSynced += 1;
      }
    }

    return { seasonId, matchdaysUpdated, fixturesSynced };
  }
}

function earliestKickoff(fixtures: ProviderFixture[]): Date {
  return fixtures.reduce((earliest, f) => (f.kickoffAt < earliest ? f.kickoffAt : earliest), fixtures[0].kickoffAt);
}
