import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ProviderFixture, SportsDataProvider } from "./sports-data.provider.interface";

const API_BASE_URL = "https://v3.football.api-sports.io";

// API-Football's short status codes, mapped to our own FixtureStatus. Not
// exhaustive of every code the API can return (e.g. penalty-shootout
// sub-states) — unrecognized codes fall back to LIVE so an in-progress match
// is never mistaken for finished/cancelled and locked in prematurely.
const STATUS_MAP: Record<string, ProviderFixture["status"]> = {
  TBD: "SCHEDULED",
  NS: "SCHEDULED",
  "1H": "LIVE",
  HT: "LIVE",
  "2H": "LIVE",
  ET: "LIVE",
  P: "LIVE",
  LIVE: "LIVE",
  FT: "FINISHED",
  AET: "FINISHED",
  PEN: "FINISHED",
  PST: "POSTPONED",
  CANC: "CANCELLED",
  ABD: "CANCELLED",
};

interface ApiFootballFixtureResponse {
  response: Array<{
    fixture: { id: number; date: string; status: { short: string } };
    teams: { home: { id: number }; away: { id: number } };
    goals: { home: number | null; away: number | null };
  }>;
}

/**
 * Talks to API-Football's free plan (100 req/day, 10/min — see
 * ingestion-scheduler.service.ts for how polling stays under that). The
 * mapping logic here is unit-tested against a sample response shape; the
 * live HTTP integration itself needs a real SPORTS_DATA_API_KEY to verify.
 */
@Injectable()
export class ApiFootballProvider implements SportsDataProvider {
  constructor(private readonly config: ConfigService) {}

  async getFixtures(competitionExternalId: string, seasonYear: number): Promise<ProviderFixture[]> {
    const data = await this.request(`/fixtures?league=${competitionExternalId}&season=${seasonYear}`);
    return data.response.map(mapFixture);
  }

  async getLiveResults(fixtureExternalIds: string[]): Promise<ProviderFixture[]> {
    if (fixtureExternalIds.length === 0) return [];
    const data = await this.request(`/fixtures?ids=${fixtureExternalIds.join("-")}`);
    return data.response.map(mapFixture);
  }

  private async request(path: string): Promise<ApiFootballFixtureResponse> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { "x-apisports-key": this.config.getOrThrow("SPORTS_DATA_API_KEY") },
    });
    if (!res.ok) {
      throw new Error(`API-Football request failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<ApiFootballFixtureResponse>;
  }
}

function mapFixture(entry: ApiFootballFixtureResponse["response"][number]): ProviderFixture {
  return {
    externalId: String(entry.fixture.id),
    homeTeamExternalId: String(entry.teams.home.id),
    awayTeamExternalId: String(entry.teams.away.id),
    kickoffAt: new Date(entry.fixture.date),
    status: STATUS_MAP[entry.fixture.status.short] ?? "LIVE",
    homeScore: entry.goals.home,
    awayScore: entry.goals.away,
  };
}
