import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FootballDataOrgProvider } from "./providers/football-data-org.provider";
import { groupProviderFixturesIntoMatchdays } from "./round-mapping";
import { resolveTeam } from "./team-resolution";
import type { ProviderFixture } from "./providers/sports-data.provider.interface";

const FOOTBALL_DATA_CL_CODE = "CL";
// Neither free data provider has this season's (2026/27) data yet — see
// season-sync.service.ts / ingestion-scheduler.service.ts for the *real*
// season sync. 2025 (the 2025/26 season) is football-data.org's most
// recently completed one, so it's what gets replayed here: real teams, real
// venues, real results, just remapped onto a compressed synthetic schedule
// so the pool's pick/lock/live-score/standings flow can actually be
// exercised over the next few weeks instead of waiting a year.
const REPLAY_SOURCE_SEASON_YEAR = 2025;

// Spacing between each of the 17 matchdays' synthetic kickoff anchors, and
// how long before the first one to give testers time to join/pick.
const MATCHDAY_CADENCE_MS = 2 * 24 * 60 * 60 * 1000;
const FIRST_MATCHDAY_DELAY_MS = 24 * 60 * 60 * 1000;
// How long after synthetic kickoff the real result gets revealed — roughly a
// full match (90 min + stoppage/half-time), matching how long a real fixture
// stays in ingestion-scheduler.service.ts's live-poll window post-kickoff.
const REVEAL_DELAY_AFTER_KICKOFF_MS = 110 * 60 * 1000;

export interface PracticeSeasonSummary {
  seasonId: string;
  matchdaysCreated: number;
  fixturesCreated: number;
}

function earliestKickoff(fixtures: ProviderFixture[]): Date {
  return fixtures.reduce((earliest, f) => (f.kickoffAt < earliest ? f.kickoffAt : earliest), fixtures[0].kickoffAt);
}

/**
 * Seeds a practice League's Season/Matchdays/Fixtures from a real, completed
 * CL season (see REPLAY_SOURCE_SEASON_YEAR), remapped onto a compressed
 * synthetic timeline. Each fixture is created SCHEDULED with no score — the
 * real result is held in ReplayFixtureResult until
 * practice-replay-scheduler.service.ts reveals it, so the fixture behaves
 * like a genuinely live one instead of showing its outcome immediately.
 *
 * isActive is deliberately false: seasons.service.ts's getActive() does a
 * bare findFirst({ isActive: true }) that the real season already owns, and
 * getAll() (used by the league-creation screen) already surfaces inactive
 * seasons precisely so a commissioner can opt into one like this.
 */
@Injectable()
export class PracticeSeasonService {
  private readonly logger = new Logger(PracticeSeasonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: FootballDataOrgProvider,
  ) {}

  async seedPracticeSeason(): Promise<PracticeSeasonSummary> {
    const existing = await this.prisma.season.findFirst({ where: { isPractice: true } });
    if (existing) {
      throw new ConflictException(
        `A practice season already exists (${existing.id}). Delete it before seeding another.`,
      );
    }

    const providerFixtures = await this.provider.getFixtures(FOOTBALL_DATA_CL_CODE, REPLAY_SOURCE_SEASON_YEAR);
    const groups = groupProviderFixturesIntoMatchdays(providerFixtures);
    if (groups.length === 0) {
      throw new Error("football-data.org returned no mappable fixtures for the replay source season");
    }

    const season = await this.prisma.season.create({
      data: {
        name: `Champions League Practice League (${REPLAY_SOURCE_SEASON_YEAR}/${String(REPLAY_SOURCE_SEASON_YEAR + 1).slice(2)} Replay)`,
        year: REPLAY_SOURCE_SEASON_YEAR,
        isActive: false,
        isPractice: true,
      },
    });

    let matchdaysCreated = 0;
    let fixturesCreated = 0;

    for (const [index, group] of groups.entries()) {
      const anchor = new Date(Date.now() + FIRST_MATCHDAY_DELAY_MS + index * MATCHDAY_CADENCE_MS);
      const realAnchor = earliestKickoff(group.fixtures);

      const matchday = await this.prisma.matchday.create({
        data: {
          seasonId: season.id,
          sequence: group.sequence,
          type: group.type,
          roundLabel: group.roundLabel,
          lockAt: anchor,
        },
      });
      matchdaysCreated += 1;

      for (const fixture of group.fixtures) {
        const [homeTeamId, awayTeamId] = await Promise.all([
          resolveTeam(this.prisma, season.id, fixture.homeTeamExternalId, fixture.homeTeamName, fixture.homeTeamCrestUrl),
          resolveTeam(this.prisma, season.id, fixture.awayTeamExternalId, fixture.awayTeamName, fixture.awayTeamCrestUrl),
        ]);

        // Preserves the real fixture's offset within its matchday (e.g.
        // Tuesday-evening vs Wednesday-evening kickoffs) against the new
        // compressed anchor, rather than collapsing every fixture in a
        // matchday onto one identical synthetic time.
        const syntheticKickoff = new Date(anchor.getTime() + (fixture.kickoffAt.getTime() - realAnchor.getTime()));

        const created = await this.prisma.fixture.create({
          data: {
            matchdayId: matchday.id,
            externalId: `replay-${fixture.externalId}`,
            homeTeamId,
            awayTeamId,
            kickoffAt: syntheticKickoff,
            venue: fixture.venue,
            status: "SCHEDULED",
          },
        });

        await this.prisma.replayFixtureResult.create({
          data: {
            fixtureId: created.id,
            homeScore: fixture.homeScore ?? 0,
            awayScore: fixture.awayScore ?? 0,
            revealAt: new Date(syntheticKickoff.getTime() + REVEAL_DELAY_AFTER_KICKOFF_MS),
          },
        });

        fixturesCreated += 1;
      }
    }

    this.logger.log(`Seeded practice season ${season.id}: ${matchdaysCreated} matchdays, ${fixturesCreated} fixtures`);
    return { seasonId: season.id, matchdaysCreated, fixturesCreated };
  }
}
