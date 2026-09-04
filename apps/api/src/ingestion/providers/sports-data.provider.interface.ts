export interface ProviderFixture {
  externalId: string;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  // Name/crest travel with every fixture response (not just a dedicated
  // /teams call) — season-sync.service.ts uses them to resolve/backfill our
  // Team rows without a second API request.
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCrestUrl: string | null;
  awayTeamCrestUrl: string | null;
  // The provider's own round label (e.g. "League Stage - 3", "Round of 16").
  // Only meaningful to season-sync.service.ts's matchday grouping — the live
  // score poll (ingestion-scheduler.service.ts) already knows the matchday
  // and ignores this field.
  round: string;
  kickoffAt: Date;
  venue: string | null;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";
  homeScore: number | null;
  awayScore: number | null;
}

/**
 * Abstraction over whichever sports-data API actually supplies fixtures and
 * results, so the rest of ingestion never talks to a specific vendor's
 * response shape directly — swapping providers means writing one new class,
 * not touching the sync/upsert logic in ingestion.service.ts.
 */
export interface SportsDataProvider {
  /** Full fixture list for a competition/season — the infrequent off-matchday sync. */
  getFixtures(competitionExternalId: string, seasonYear: number): Promise<ProviderFixture[]>;
  /** Targeted refresh for fixtures already known to be in progress — the tight matchday-window poll. */
  getLiveResults(fixtureExternalIds: string[]): Promise<ProviderFixture[]>;
  /**
   * One fixture's venue, if the provider has it — optional because it's
   * costly (one request per fixture on providers like Highlightly, where
   * venue only lives on a per-match detail endpoint, not the list one) so
   * it's deliberately not part of the regular sync; see
   * admin-fixtures.service.ts's backfillVenue for the one-time-per-fixture
   * call site. A provider that doesn't support this at all can omit it.
   */
  getVenue?(fixtureExternalId: string): Promise<string | null>;
}

export const SPORTS_DATA_PROVIDER = Symbol("SPORTS_DATA_PROVIDER");
