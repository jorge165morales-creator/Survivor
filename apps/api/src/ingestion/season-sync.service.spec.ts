import { SeasonSyncService } from "./season-sync.service";
import { PrismaService } from "../prisma/prisma.service";
import { IngestionService } from "./ingestion.service";
import type { ProviderFixture, SportsDataProvider } from "./providers/sports-data.provider.interface";

function fixture(overrides: Partial<ProviderFixture> = {}): ProviderFixture {
  return {
    externalId: "provider-fixture-1",
    homeTeamExternalId: "home-ext",
    awayTeamExternalId: "away-ext",
    homeTeamName: "Home FC",
    awayTeamName: "Away FC",
    homeTeamCrestUrl: "https://example.com/home.png",
    awayTeamCrestUrl: "https://example.com/away.png",
    round: "League Stage - 1",
    kickoffAt: new Date("2026-09-17T18:45:00Z"),
    venue: "Sample Stadium, Sample City",
    status: "SCHEDULED",
    homeScore: null,
    awayScore: null,
    ...overrides,
  };
}

describe("SeasonSyncService.syncSeason", () => {
  const SEASON_ID = "season-1";
  const MATCHDAY_ID = "matchday-1";

  function makePrisma(overrides: {
    matchday?: { id: string; lockAt: Date } | null;
    teamByExternalId?: Record<string, { id: string }>;
    teamByName?: { id: string; crestUrl: string | null } | null;
  }) {
    const matchday = "matchday" in overrides ? overrides.matchday : { id: MATCHDAY_ID, lockAt: new Date(0) };
    const matchdayFindUnique = jest.fn().mockResolvedValue(matchday);
    const matchdayUpdate = jest.fn();
    const teamFindUnique = jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(overrides.teamByExternalId?.[where.externalId] ?? null),
    );
    const teamFindFirst = jest.fn().mockResolvedValue(overrides.teamByName ?? null);
    const teamUpdate = jest.fn().mockImplementation(({ where, data }) =>
      Promise.resolve({ id: where.id, ...data }),
    );
    const teamCreate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new-team-id", ...data }));

    return {
      prisma: {
        matchday: { findUnique: matchdayFindUnique, update: matchdayUpdate },
        team: { findUnique: teamFindUnique, findFirst: teamFindFirst, update: teamUpdate, create: teamCreate },
      } as unknown as PrismaService,
      matchdayUpdate,
      teamUpdate,
      teamCreate,
    };
  }

  function makeIngestion() {
    return { upsertFixture: jest.fn() } as unknown as IngestionService;
  }

  function makeProvider(fixtures: ProviderFixture[]) {
    return { getFixtures: jest.fn().mockResolvedValue(fixtures), getLiveResults: jest.fn() } as unknown as SportsDataProvider;
  }

  it("resolves a team already linked by externalId without touching the DB row", async () => {
    const { prisma, teamUpdate, teamCreate } = makePrisma({
      teamByExternalId: { "home-ext": { id: "home-uuid" }, "away-ext": { id: "away-uuid" } },
    });
    const ingestion = makeIngestion();
    const provider = makeProvider([fixture()]);
    const service = new SeasonSyncService(prisma, ingestion, provider);

    await service.syncSeason(SEASON_ID, 2026);

    expect(teamUpdate).not.toHaveBeenCalled();
    expect(teamCreate).not.toHaveBeenCalled();
    expect(ingestion.upsertFixture).toHaveBeenCalledWith(MATCHDAY_ID, expect.objectContaining({ externalId: "provider-fixture-1" }));
  });

  it("backfills a pre-seeded placeholder team's externalId and crest when matched by name", async () => {
    const { prisma, teamUpdate, teamCreate } = makePrisma({
      teamByName: { id: "placeholder-uuid", crestUrl: null },
    });
    const ingestion = makeIngestion();
    const provider = makeProvider([fixture()]);
    const service = new SeasonSyncService(prisma, ingestion, provider);

    await service.syncSeason(SEASON_ID, 2026);

    expect(teamUpdate).toHaveBeenCalledWith({
      where: { id: "placeholder-uuid" },
      data: { externalId: "home-ext", crestUrl: "https://example.com/home.png" },
    });
    expect(teamCreate).not.toHaveBeenCalled();
  });

  it("creates a brand new team when neither externalId nor name matches an existing row", async () => {
    const { prisma, teamCreate } = makePrisma({});
    const ingestion = makeIngestion();
    const provider = makeProvider([fixture()]);
    const service = new SeasonSyncService(prisma, ingestion, provider);

    await service.syncSeason(SEASON_ID, 2026);

    expect(teamCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Home FC", externalId: "home-ext" }),
      }),
    );
  });

  it("sets the matchday's lockAt to the earliest kickoff among its fixtures", async () => {
    const { prisma, matchdayUpdate } = makePrisma({
      teamByExternalId: { "home-ext": { id: "h" }, "away-ext": { id: "a" } },
    });
    const ingestion = makeIngestion();
    const provider = makeProvider([
      fixture({ externalId: "f1", kickoffAt: new Date("2026-09-17T21:00:00Z") }),
      fixture({ externalId: "f2", kickoffAt: new Date("2026-09-17T18:45:00Z") }), // earliest
    ]);
    const service = new SeasonSyncService(prisma, ingestion, provider);

    await service.syncSeason(SEASON_ID, 2026);

    expect(matchdayUpdate).toHaveBeenCalledWith({
      where: { id: MATCHDAY_ID },
      data: { lockAt: new Date("2026-09-17T18:45:00Z") },
    });
  });

  it("does not write to the matchday when lockAt is already correct", async () => {
    const { prisma, matchdayUpdate } = makePrisma({
      matchday: { id: MATCHDAY_ID, lockAt: new Date("2026-09-17T18:45:00Z") },
      teamByExternalId: { "home-ext": { id: "h" }, "away-ext": { id: "a" } },
    });
    const ingestion = makeIngestion();
    const provider = makeProvider([fixture({ kickoffAt: new Date("2026-09-17T18:45:00Z") })]);
    const service = new SeasonSyncService(prisma, ingestion, provider);

    await service.syncSeason(SEASON_ID, 2026);

    expect(matchdayUpdate).not.toHaveBeenCalled();
  });

  it("skips a group with no matching matchday instead of throwing", async () => {
    const { prisma } = makePrisma({ matchday: null });
    const ingestion = makeIngestion();
    const provider = makeProvider([fixture()]);
    const service = new SeasonSyncService(prisma, ingestion, provider);

    const summary = await service.syncSeason(SEASON_ID, 2026);

    expect(summary).toEqual({ seasonId: SEASON_ID, matchdaysUpdated: 0, fixturesSynced: 0 });
    expect(ingestion.upsertFixture).not.toHaveBeenCalled();
  });

  it("ignores fixtures from unmapped rounds (e.g. qualifying) entirely", async () => {
    const { prisma } = makePrisma({});
    const ingestion = makeIngestion();
    const provider = makeProvider([fixture({ round: "2nd Qualifying Round" })]);
    const service = new SeasonSyncService(prisma, ingestion, provider);

    const summary = await service.syncSeason(SEASON_ID, 2026);

    expect(summary.fixturesSynced).toBe(0);
    expect(ingestion.upsertFixture).not.toHaveBeenCalled();
  });
});

describe("SeasonSyncService.syncActiveSeasons", () => {
  it("only syncs seasons flagged isActive, and isolates a per-season failure", async () => {
    const prisma = {
      season: {
        findMany: jest.fn().mockResolvedValue([
          { id: "active-1", year: 2026, isActive: true },
          { id: "active-2", year: 2027, isActive: true },
        ]),
      },
      matchday: { findUnique: jest.fn().mockResolvedValue(null) },
      team: {},
    } as unknown as PrismaService;
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const provider = {
      getFixtures: jest
        .fn()
        .mockRejectedValueOnce(new Error("API-Football request failed: 500"))
        .mockResolvedValueOnce([]),
      getLiveResults: jest.fn(),
    } as unknown as SportsDataProvider;
    const service = new SeasonSyncService(prisma, ingestion, provider);

    const summaries = await service.syncActiveSeasons();

    // First season's provider call rejected — logged and skipped, not thrown.
    expect(summaries).toEqual([{ seasonId: "active-2", matchdaysUpdated: 0, fixturesSynced: 0 }]);
    expect(prisma.season.findMany).toHaveBeenCalledWith({ where: { isActive: true } });
  });
});
