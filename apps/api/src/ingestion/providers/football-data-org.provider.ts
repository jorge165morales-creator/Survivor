import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ProviderFixture, SportsDataProvider } from "./sports-data.provider.interface";

const API_BASE_URL = "https://api.football-data.org/v4";

// football-data.org's match status values, mapped to our own FixtureStatus.
// Unrecognized values fall back to LIVE for the same reason as
// api-football.provider.ts's STATUS_MAP — never mistake an in-progress match
// for finished/cancelled and lock it in prematurely.
const STATUS_MAP: Record<string, ProviderFixture["status"]> = {
  SCHEDULED: "SCHEDULED",
  TIMED: "SCHEDULED",
  IN_PLAY: "LIVE",
  PAUSED: "LIVE",
  SUSPENDED: "LIVE",
  FINISHED: "FINISHED",
  AWARDED: "FINISHED",
  POSTPONED: "POSTPONED",
  CANCELLED: "CANCELLED",
};

// football-data.org's competition "stage" values, normalized to the same
// provider-round vocabulary round-mapping.ts already expects from
// API-Football (see round-mapping.ts's LEAGUE_STAGE_RE/KNOCKOUT_ROUNDS) — so
// grouping fixtures into our 17 matchdays works identically regardless of
// which provider they came from. Stages outside this map (qualifying rounds)
// are returned as-is and left unmapped by round-mapping.ts, same as before.
function normalizeRound(stage: string, matchday: number | null): string {
  if (stage === "LEAGUE_STAGE" && matchday !== null) return `League Stage - ${matchday}`;
  if (stage === "PLAYOFFS") return "Knockout Round Play-offs";
  if (stage === "LAST_16") return "Round of 16";
  if (stage === "QUARTER_FINALS") return "Quarter-finals";
  if (stage === "SEMI_FINALS") return "Semi-finals";
  if (stage === "FINAL") return "Final";
  return stage;
}

interface FootballDataTeam {
  id: number;
  name: string;
  crest: string | null;
}

interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  stage: string;
  homeTeam: FootballDataTeam;
  awayTeam: FootballDataTeam;
  score: { fullTime: { home: number | null; away: number | null } };
}

interface FootballDataMatchesResponse {
  matches: FootballDataMatch[];
}

interface FootballDataTeamsResponse {
  teams: Array<{ id: number; venue: string | null }>;
}

/**
 * Talks to football-data.org's free tier. Unlike ApiFootballProvider, this is
 * not wired to SPORTS_DATA_PROVIDER — it's used directly by
 * practice-season.service.ts to seed a practice league from a real, already-
 * completed CL season (see that file for why: neither provider's free tier
 * has the *current* season's data yet). getLiveResults is implemented for
 * interface completeness but isn't part of that flow, so it doesn't carry
 * venue enrichment the way getFixtures does.
 */
@Injectable()
export class FootballDataOrgProvider implements SportsDataProvider {
  constructor(private readonly config: ConfigService) {}

  async getFixtures(competitionExternalId: string, seasonYear: number): Promise<ProviderFixture[]> {
    const [matchesData, teamsData] = await Promise.all([
      this.request<FootballDataMatchesResponse>(`/competitions/${competitionExternalId}/matches?season=${seasonYear}`),
      this.request<FootballDataTeamsResponse>(`/competitions/${competitionExternalId}/teams?season=${seasonYear}`),
    ]);

    const venueByTeamId = new Map(teamsData.teams.map((t) => [t.id, t.venue]));
    return matchesData.matches.map((m) => mapMatch(m, venueByTeamId));
  }

  async getLiveResults(fixtureExternalIds: string[]): Promise<ProviderFixture[]> {
    if (fixtureExternalIds.length === 0) return [];
    const data = await this.request<FootballDataMatchesResponse>(`/matches?ids=${fixtureExternalIds.join(",")}`);
    return data.matches.map((m) => mapMatch(m, new Map()));
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { "X-Auth-Token": this.config.getOrThrow("FOOTBALL_DATA_API_KEY") },
    });
    if (!res.ok) {
      throw new Error(`football-data.org request failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }
}

function mapMatch(match: FootballDataMatch, venueByTeamId: Map<number, string | null>): ProviderFixture {
  return {
    externalId: String(match.id),
    homeTeamExternalId: String(match.homeTeam.id),
    awayTeamExternalId: String(match.awayTeam.id),
    homeTeamName: match.homeTeam.name,
    awayTeamName: match.awayTeam.name,
    homeTeamCrestUrl: match.homeTeam.crest,
    awayTeamCrestUrl: match.awayTeam.crest,
    round: normalizeRound(match.stage, match.matchday),
    kickoffAt: new Date(match.utcDate),
    // The final is played at a neutral venue, not either finalist's home
    // ground — leave it unknown rather than misattribute it.
    venue: match.stage === "FINAL" ? null : (venueByTeamId.get(match.homeTeam.id) ?? null),
    status: STATUS_MAP[match.status] ?? "LIVE",
    homeScore: match.score.fullTime.home,
    awayScore: match.score.fullTime.away,
  };
}
