import { IngestionSchedulerService } from "./ingestion-scheduler.service";
import { PrismaService } from "../prisma/prisma.service";
import { IngestionService } from "./ingestion.service";
import type { ProviderFixture, SportsDataProvider } from "./providers/sports-data.provider.interface";

function makePrisma(fixtures: Array<{ externalId: string; matchdayId: string }>) {
  return {
    fixture: {
      findMany: jest.fn().mockResolvedValue(fixtures),
    },
  } as unknown as PrismaService;
}

function providerFixture(overrides: Partial<ProviderFixture> = {}): ProviderFixture {
  return {
    externalId: "provider-fixture-1",
    homeTeamExternalId: "home-ext",
    awayTeamExternalId: "away-ext",
    kickoffAt: new Date("2026-09-16T18:45:00Z"),
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
    const scheduler = new IngestionSchedulerService(prisma, ingestion, provider);

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
    const scheduler = new IngestionSchedulerService(prisma, ingestion, provider);

    await scheduler.pollLiveMatchdays();

    expect(provider.getLiveResults).toHaveBeenCalledTimes(1);
    expect(provider.getLiveResults).toHaveBeenCalledWith(["fixture-a", "fixture-b"]);
    expect(ingestion.upsertFixture).toHaveBeenCalledWith("matchday-1", expect.objectContaining({ externalId: "fixture-a" }));
    expect(ingestion.upsertFixture).toHaveBeenCalledWith("matchday-1", expect.objectContaining({ externalId: "fixture-b" }));
  });

  it("ignores a provider result for a fixture outside what was requested", async () => {
    const prisma = makePrisma([{ externalId: "fixture-a", matchdayId: "matchday-1" }]);
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const provider = {
      getLiveResults: jest.fn().mockResolvedValue([providerFixture({ externalId: "unrelated-fixture" })]),
      getFixtures: jest.fn(),
    } as unknown as SportsDataProvider;
    const scheduler = new IngestionSchedulerService(prisma, ingestion, provider);

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
    const scheduler = new IngestionSchedulerService(prisma, ingestion, provider);

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
    const scheduler = new IngestionSchedulerService(prisma, ingestion, provider);

    await expect(scheduler.pollLiveMatchdays()).resolves.not.toThrow();
    expect(ingestion.upsertFixture).not.toHaveBeenCalled();
  });
});
