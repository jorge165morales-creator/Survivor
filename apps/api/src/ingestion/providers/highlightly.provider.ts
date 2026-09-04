import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ProviderFixture, SportsDataProvider } from "./sports-data.provider.interface";

const API_BASE_URL = "https://soccer.highlightly.net";
const LEAGUE_NAME = "UEFA Champions League";
// The API rejects any limit above this — getFixtures pages through with
// offset to collect a full season (~150-170 matches with the knockout
// rounds included).
const MAX_LIMIT = 100;

// Highlightly's match-state descriptions, mapped to our own FixtureStatus.
// Not exhaustive of every in-play sub-state (e.g. "Extra Time", "Penalties")
// — unrecognized ones fall back to LIVE for the same reason as the other
// providers' STATUS_MAPs: never mistake an in-progress match for
// finished/cancelled and lock it in prematurely.
const STATUS_MAP: Record<string, ProviderFixture["status"]> = {
  "Not started": "SCHEDULED",
  Finished: "FINISHED",
  Postponed: "POSTPONED",
  Cancelled: "CANCELLED",
  Abandoned: "CANCELLED",
};

interface HighlightlyTeam {
  id: number;
  logo: string | null;
  name: string;
}

interface HighlightlyMatch {
  id: number;
  round: string;
  date: string;
  state: {
    description: string;
    score: { current: string | null };
  };
  homeTeam: HighlightlyTeam;
  awayTeam: HighlightlyTeam;
}

interface HighlightlyMatchesResponse {
  data: HighlightlyMatch[];
}

/**
 * Talks to Highlightly's free tier (100 req/day) via the "direct" host
 * (soccer.highlightly.net) — confirmed live against a real key to return
 * "All data available with current plan" for the free BASIC tier, unlike
 * API-Football's free plan, which is season-gated. Filters by leagueName
 * rather than a numeric competition id — competitionExternalId is accepted
 * only to satisfy SportsDataProvider's shared interface and is otherwise
 * unused here.
 *
 * getLiveResults deliberately doesn't filter by id server-side — the API
 * has no ids/round query param (confirmed: both 400 "property ... should
 * not exist"), so a whole matchday's live fixtures are instead fetched with
 * one date-filtered request and then narrowed to the requested ids
 * client-side. That keeps the cost model the polling scheduler already
 * assumes (~1 request per poll, see ingestion-scheduler.service.ts) intact.
 */
@Injectable()
export class HighlightlyProvider implements SportsDataProvider {
  constructor(private readonly config: ConfigService) {}

  async getFixtures(_competitionExternalId: string, seasonYear: number): Promise<ProviderFixture[]> {
    const all: HighlightlyMatch[] = [];
    let offset = 0;
    for (;;) {
      const page = await this.request(
        `/matches?leagueName=${encodeURIComponent(LEAGUE_NAME)}&season=${seasonYear}&limit=${MAX_LIMIT}&offset=${offset}`,
      );
      all.push(...page.data);
      if (page.data.length < MAX_LIMIT) break;
      offset += MAX_LIMIT;
    }
    return all.map(mapMatch);
  }

  async getLiveResults(fixtureExternalIds: string[]): Promise<ProviderFixture[]> {
    if (fixtureExternalIds.length === 0) return [];
    const today = new Date().toISOString().slice(0, 10);
    const page = await this.request(`/matches?leagueName=${encodeURIComponent(LEAGUE_NAME)}&date=${today}`);
    const wanted = new Set(fixtureExternalIds);
    return page.data.filter((m) => wanted.has(String(m.id))).map(mapMatch);
  }

  // Confirmed live (2026-09-03): populated for most matches but not all
  // (notably sparse for neutral-venue knockout legs) — callers should treat
  // a null return as "unknown", not as an error.
  async getVenue(fixtureExternalId: string): Promise<string | null> {
    const res = await fetch(`${API_BASE_URL}/matches/${fixtureExternalId}`, {
      headers: { "x-rapidapi-key": this.config.getOrThrow("HIGHLIGHTLY_API_KEY") },
    });
    if (!res.ok) {
      throw new Error(`Highlightly request failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as Array<{ venue?: { name: string | null; city: string | null } }>;
    const venue = body[0]?.venue;
    if (!venue) return null;
    if (venue.name && venue.city) return `${venue.name}, ${venue.city}`;
    return venue.name ?? venue.city ?? null;
  }

  private async request(path: string): Promise<HighlightlyMatchesResponse> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { "x-rapidapi-key": this.config.getOrThrow("HIGHLIGHTLY_API_KEY") },
    });
    if (!res.ok) {
      throw new Error(`Highlightly request failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<HighlightlyMatchesResponse>;
  }
}

// "1 - 1" -> [1, 1]; null (not yet played) -> [null, null].
function parseScore(current: string | null): [number | null, number | null] {
  if (!current) return [null, null];
  const match = current.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return [null, null];
  return [Number(match[1]), Number(match[2])];
}

function mapMatch(m: HighlightlyMatch): ProviderFixture {
  const [homeScore, awayScore] = parseScore(m.state.score.current);
  return {
    externalId: String(m.id),
    homeTeamExternalId: String(m.homeTeam.id),
    awayTeamExternalId: String(m.awayTeam.id),
    homeTeamName: m.homeTeam.name,
    awayTeamName: m.awayTeam.name,
    homeTeamCrestUrl: m.homeTeam.logo,
    awayTeamCrestUrl: m.awayTeam.logo,
    round: m.round,
    kickoffAt: new Date(m.date),
    // Not present on the list endpoint (only on the per-match detail
    // endpoint) — left null rather than spending extra requests on a
    // per-fixture detail call for every match in a season.
    venue: null,
    status: STATUS_MAP[m.state.description] ?? "LIVE",
    homeScore,
    awayScore,
  };
}
