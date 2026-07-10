export interface ProviderFixture {
  externalId: string;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  kickoffAt: Date;
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
}

export const SPORTS_DATA_PROVIDER = Symbol("SPORTS_DATA_PROVIDER");
