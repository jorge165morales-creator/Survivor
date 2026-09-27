import { Inject, Injectable, Logger } from "@nestjs/common";
import type { CompetitionStructure } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { IngestionService } from "./ingestion.service";
import { groupProviderFixturesIntoMatchdays } from "./round-mapping";
import { resolveTeam } from "./team-resolution";
import { SPORTS_DATA_PROVIDER, type ProviderFixture, type SportsDataProvider } from "./providers/sports-data.provider.interface";

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
 * provider rounds map to a season's pre-seeded matchdays, which vary in
 * count and shape by competition — 17 for the Champions League's
 * group-and-knockout format, 38 for a round robin), and resolves/creates
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
    const seasons = await this.prisma.season.findMany({
      where: { isActive: true },
      include: { competition: true },
    });
    const summaries: SeasonSyncSummary[] = [];
    for (const season of seasons) {
      try {
        // Hardcoded to the same field ingestion-scheduler.service.ts reads —
        // both need updating together if the active provider ever changes
        // (see ingestion.module.ts's SPORTS_DATA_PROVIDER wiring).
        const competitionExternalId = season.competition.highlightlyLeagueId;
        if (!competitionExternalId) {
          this.logger.warn(`Season ${season.id}: competition "${season.competition.slug}" has no highlightlyLeagueId — skipping`);
          summaries.push({ seasonId: season.id, matchdaysUpdated: 0, fixturesSynced: 0, error: "No provider id configured" });
          continue;
        }
        summaries.push(await this.syncSeason(season.id, competitionExternalId, season.year, season.competition.structure));
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

  async syncSeason(
    seasonId: string,
    competitionExternalId: string,
    seasonYear: number,
    structure: CompetitionStructure = "GROUP_AND_KNOCKOUT",
  ): Promise<SeasonSyncSummary> {
    const providerFixtures = await this.provider.getFixtures(competitionExternalId, seasonYear);
    const groups = groupProviderFixturesIntoMatchdays(providerFixtures, structure);

    let matchdaysUpdated = 0;
    let fixturesSynced = 0;

    for (const group of groups) {
      const matchday = await this.prisma.matchday.findUnique({
        where: { seasonId_sequence: { seasonId, sequence: group.sequence } },
      });
      if (!matchday) {
        // Shouldn't happen once the season's matchdays have been pre-created
        // (one per Competition.matchdayCount — see seasons.service.ts /
        // prisma/seed.ts). Logged and skipped rather than thrown so one bad
        // sequence doesn't abort the rest of the sync.
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
