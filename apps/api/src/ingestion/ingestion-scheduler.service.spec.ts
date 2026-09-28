import { IngestionSchedulerService } from "./ingestion-scheduler.service";
import { PrismaService } from "../prisma/prisma.service";
import { IngestionService } from "./ingestion.service";
import { SeasonSyncService } from "./season-sync.service";
import { VenueBackfillService } from "./venue-backfill.service";
import type { ProviderFixture, SportsDataProvider } from "./providers/sports-data.provider.interface";

function makePrisma(
  fixtures: Array<{ externalId: string; matchdayId: string; highlightlyLeagueId?: string | null }>,
) {
  return {
    fixture: {
      findMany: jest.fn().mockResolvedValue(
        fixtures.map((f) => ({
          externalId: f.externalId,
          matchdayId: f.matchdayId,
          matchday: { season: { competition: { highlightlyLeagueId: f.highlightlyLeagueId ?? "ucl-id" } } },
        })),
      ),
    },
  } as unknown as PrismaService;
}

function makeSeasonSync() {
  return { syncActiveSeasons: jest.fn().mockResolvedValue([]) } as unknown as SeasonSyncService;
}

function makeVenueBackfill() {
  return { backfillUpcomingVenues: jest.fn().mockResolvedValue({ attempted: 0, filled: 0 }) } as unknown as VenueBackfillService;
}

function providerFixture(overrides: Partial<ProviderFixture> = {}): ProviderFixture {
  return {
    externalId: "provider-fixture-1",
    homeTeamExternalId: "home-ext",
    awayTeamExternalId: "away-ext",
    homeTeamName: "Home FC",
    awayTeamName: "Away FC",
    homeTeamCrestUrl: null,
    awayTeamCrestUrl: null,
    round: "League Stage - 1",
    kickoffAt: new Date("2026-09-16T18:45:00Z"),
    venue: "Sample Stadium, Sample City",
    status: "LIVE",
    homeScore: 1,
    awayScore: 0,
    ...overrides,
  };
}

describe("IngestionSchedulerService.pollLiveMatchdays", () => {
  it("skips calling the provider entirely when no fixture is in the kickoff window", async () => {
    const prisma = makePrisma([]);
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const provider = {
      getLiveResults: jest.fn(),
      getFixtures: jest.fn(),
    } as unknown as SportsDataProvider;
    const scheduler = new IngestionSchedulerService(prisma, ingestion, makeSeasonSync(), makeVenueBackfill(), provider);

    await scheduler.pollLiveMatchdays();

    expect(provider.getLiveResults).not.toHaveBeenCalled();
    expect(ingestion.upsertFixture).not.toHaveBeenCalled();
  });

  it("calls getLiveResults once with every fixture in the window, then upserts each result", async () => {
    const prisma = makePrisma([
      { externalId: "fixture-a", matchdayId: "matchday-1" },
      { externalId: "fixture-b", matchdayId: "matchday-1" },
    ]);
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const provider = {
      getLiveResults: jest.fn().mockResolvedValue([
        providerFixture({ externalId: "fixture-a" }),
        providerFixture({ externalId: "fixture-b" }),
      ]),
      getFixtures: jest.fn(),
    } as unknown as SportsDataProvider;
    const scheduler = new IngestionSchedulerService(prisma, ingestion, makeSeasonSync(), makeVenueBackfill(), provider);

    await scheduler.pollLiveMatchdays();

    expect(provider.getLiveResults).toHaveBeenCalledTimes(1);
    expect(provider.getLiveResults).toHaveBeenCalledWith("ucl-id", ["fixture-a", "fixture-b"]);
    expect(ingestion.upsertFixture).toHaveBeenCalledWith("matchday-1", expect.objectContaining({ externalId: "fixture-a" }));
    expect(ingestion.upsertFixture).toHaveBeenCalledWith("matchday-1", expect.objectContaining({ externalId: "fixture-b" }));
  });

  it("calls getLiveResults once per distinct competition when multiple are live at once", async () => {
    const prisma = makePrisma([
      { externalId: "fixture-a", matchdayId: "matchday-1", highlightlyLeagueId: "ucl-id" },
      { externalId: "fixture-b", matchdayId: "matchday-2", highlightlyLeagueId: "epl-id" },
    ]);
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const provider = {
      getLiveResults: jest
        .fn()
        .mockResolvedValueOnce([providerFixture({ externalId: "fixture-a" })])
        .mockResolvedValueOnce([providerFixture({ externalId: "fixture-b" })]),
      getFixtures: jest.fn(),
    } as unknown as SportsDataProvider;
    const scheduler = new IngestionSchedulerService(prisma, ingestion, makeSeasonSync(), makeVenueBackfill(), provider);

    await scheduler.pollLiveMatchdays();

    expect(provider.getLiveResults).toHaveBeenCalledTimes(2);
    expect(provider.getLiveResults).toHaveBeenCalledWith("ucl-id", ["fixture-a"]);
    expect(provider.getLiveResults).toHaveBeenCalledWith("epl-id", ["fixture-b"]);
    expect(ingestion.upsertFixture).toHaveBeenCalledWith("matchday-1", expect.objectContaining({ externalId: "fixture-a" }));
    expect(ingestion.upsertFixture).toHaveBeenCalledWith("matchday-2", expect.objectContaining({ externalId: "fixture-b" }));
  });

  it("isolates one competition's poll failure from another's", async () => {
    const prisma = makePrisma([
      { externalId: "fixture-a", matchdayId: "matchday-1", highlightlyLeagueId: "ucl-id" },
      { externalId: "fixture-b", matchdayId: "matchday-2", highlightlyLeagueId: "epl-id" },
    ]);
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const provider = {
      getLiveResults: jest
        .fn()
        .mockRejectedValueOnce(new Error("Highlightly request failed: 500"))
        .mockResolvedValueOnce([providerFixture({ externalId: "fixture-b" })]),
      getFixtures: jest.fn(),
    } as unknown as SportsDataProvider;
    const scheduler = new IngestionSchedulerService(prisma, ingestion, makeSeasonSync(), makeVenueBackfill(), provider);

    await expect(scheduler.pollLiveMatchdays()).resolves.not.toThrow();

    expect(ingestion.upsertFixture).toHaveBeenCalledTimes(1);
    expect(ingestion.upsertFixture).toHaveBeenCalledWith("matchday-2", expect.objectContaining({ externalId: "fixture-b" }));
  });

  it("ignores a provider result for a fixture outside what was requested", async () => {
    const prisma = makePrisma([{ externalId: "fixture-a", matchdayId: "matchday-1" }]);
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const provider = {
      getLiveResults: jest.fn().mockResolvedValue([providerFixture({ externalId: "unrelated-fixture" })]),
      getFixtures: jest.fn(),
    } as unknown as SportsDataProvider;
    const scheduler = new IngestionSchedulerService(prisma, ingestion, makeSeasonSync(), makeVenueBackfill(), provider);

    await scheduler.pollLiveMatchdays();

    expect(ingestion.upsertFixture).not.toHaveBeenCalled();
  });

  it("logs and continues when one fixture's upsert fails, without aborting the rest", async () => {
    const prisma = makePrisma([
      { externalId: "fixture-a", matchdayId: "matchday-1" },
      { externalId: "fixture-b", matchdayId: "matchday-1" },
    ]);
    const ingestion = {
      upsertFixture: jest
        .fn()
        .mockRejectedValueOnce(new Error("team externalId not found"))
        .mockResolvedValueOnce(undefined),
    } as unknown as IngestionService;
    const provider = {
      getLiveResults: jest.fn().mockResolvedValue([
        providerFixture({ externalId: "fixture-a" }),
        providerFixture({ externalId: "fixture-b" }),
      ]),
      getFixtures: jest.fn(),
    } as unknown as SportsDataProvider;
    const scheduler = new IngestionSchedulerService(prisma, ingestion, makeSeasonSync(), makeVenueBackfill(), provider);

    await expect(scheduler.pollLiveMatchdays()).resolves.not.toThrow();

    expect(ingestion.upsertFixture).toHaveBeenCalledTimes(2);
  });

  it("does not throw when the provider call itself fails", async () => {
    const prisma = makePrisma([{ externalId: "fixture-a", matchdayId: "matchday-1" }]);
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const provider = {
      getLiveResults: jest.fn().mockRejectedValue(new Error("API-Football request failed: 429")),
      getFixtures: jest.fn(),
    } as unknown as SportsDataProvider;
    const scheduler = new IngestionSchedulerService(prisma, ingestion, makeSeasonSync(), makeVenueBackfill(), provider);

    await expect(scheduler.pollLiveMatchdays()).resolves.not.toThrow();
    expect(ingestion.upsertFixture).not.toHaveBeenCalled();
  });
});

describe("IngestionSchedulerService.syncSeasonFixtures", () => {
  it("backfills upcoming venues right after syncing active seasons", async () => {
    const prisma = makePrisma([]);
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const provider = { getLiveResults: jest.fn(), getFixtures: jest.fn() } as unknown as SportsDataProvider;
    const seasonSync = { syncActiveSeasons: jest.fn().mockResolvedValue([]) } as unknown as SeasonSyncService;
    const venueBackfill = {
      backfillUpcomingVenues: jest.fn().mockResolvedValue({ attempted: 5, filled: 3 }),
    } as unknown as VenueBackfillService;
    const scheduler = new IngestionSchedulerService(prisma, ingestion, seasonSync, venueBackfill, provider);

    await scheduler.syncSeasonFixtures();

    expect(seasonSync.syncActiveSeasons).toHaveBeenCalledTimes(1);
    expect(venueBackfill.backfillUpcomingVenues).toHaveBeenCalledTimes(1);
  });

  it("still runs the venue backfill even when no season needed a fixture sync", async () => {
    const prisma = makePrisma([]);
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const provider = { getLiveResults: jest.fn(), getFixtures: jest.fn() } as unknown as SportsDataProvider;
    const scheduler = new IngestionSchedulerService(prisma, ingestion, makeSeasonSync(), makeVenueBackfill(), provider);

    await expect(scheduler.syncSeasonFixtures()).resolves.not.toThrow();
  });
});
