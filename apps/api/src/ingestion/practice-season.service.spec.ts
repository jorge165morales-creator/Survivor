import { ConflictException } from "@nestjs/common";
import { PracticeSeasonService } from "./practice-season.service";
import { PrismaService } from "../prisma/prisma.service";
import { FootballDataOrgProvider } from "./providers/football-data-org.provider";
import type { ProviderFixture } from "./providers/sports-data.provider.interface";

const NOW = new Date("2026-07-22T12:00:00Z");

function fixture(overrides: Partial<ProviderFixture> = {}): ProviderFixture {
  return {
    externalId: "1",
    homeTeamExternalId: "home-ext",
    awayTeamExternalId: "away-ext",
    homeTeamName: "Home FC",
    awayTeamName: "Away FC",
    homeTeamCrestUrl: null,
    awayTeamCrestUrl: null,
    round: "League Stage - 1",
    kickoffAt: new Date("2025-09-16T18:45:00Z"),
    venue: "Sample Stadium",
    status: "FINISHED",
    homeScore: 2,
    awayScore: 1,
    ...overrides,
  };
}

function makePrisma() {
  const seasonFindFirst = jest.fn().mockResolvedValue(null);
  const seasonCreate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "practice-season-id", ...data }));
  const matchdayCreate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `matchday-${data.sequence}`, ...data }));
  const fixtureCreate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `fixture-${data.externalId}`, ...data }));
  const replayResultCreate = jest.fn().mockResolvedValue(undefined);
  const teamFindUnique = jest.fn().mockResolvedValue(null);
  const teamFindFirst = jest.fn().mockResolvedValue(null);
  const teamCreate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `team-${data.externalId}`, ...data }));

  return {
    prisma: {
      season: { findFirst: seasonFindFirst, create: seasonCreate },
      matchday: { create: matchdayCreate },
      fixture: { create: fixtureCreate },
      replayFixtureResult: { create: replayResultCreate },
      team: { findUnique: teamFindUnique, findFirst: teamFindFirst, create: teamCreate },
    } as unknown as PrismaService,
    seasonFindFirst,
    seasonCreate,
    matchdayCreate,
    fixtureCreate,
    replayResultCreate,
  };
}

function makeProvider(fixtures: ProviderFixture[]) {
  return { getFixtures: jest.fn().mockResolvedValue(fixtures) } as unknown as FootballDataOrgProvider;
}

describe("PracticeSeasonService.seedPracticeSeason", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("refuses to seed a second practice season", async () => {
    const { prisma, seasonFindFirst } = makePrisma();
    seasonFindFirst.mockResolvedValue({ id: "already-exists" });
    const service = new PracticeSeasonService(prisma, makeProvider([fixture()]));

    await expect(service.seedPracticeSeason()).rejects.toThrow(ConflictException);
  });

  it("creates the season inactive but flagged as practice", async () => {
    const { prisma, seasonCreate } = makePrisma();
    const service = new PracticeSeasonService(prisma, makeProvider([fixture()]));

    await service.seedPracticeSeason();

    expect(seasonCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ isActive: false, isPractice: true }),
    });
  });

  it("anchors the first matchday 24h out and spaces subsequent ones by the fixed cadence", async () => {
    const { prisma, matchdayCreate } = makePrisma();
    const fixtures = [
      fixture({ externalId: "1", round: "League Stage - 1", kickoffAt: new Date("2025-09-16T18:45:00Z") }),
      fixture({ externalId: "2", round: "League Stage - 2", kickoffAt: new Date("2025-10-01T18:45:00Z") }),
    ];
    const service = new PracticeSeasonService(prisma, makeProvider(fixtures));

    await service.seedPracticeSeason();

    const md1 = matchdayCreate.mock.calls.find((c) => c[0].data.sequence === 1)[0].data;
    const md2 = matchdayCreate.mock.calls.find((c) => c[0].data.sequence === 2)[0].data;

    expect(md1.lockAt).toEqual(new Date(NOW.getTime() + 24 * 60 * 60 * 1000));
    expect(md2.lockAt).toEqual(new Date(md1.lockAt.getTime() + 2 * 24 * 60 * 60 * 1000));
  });

  it("preserves each fixture's real offset from its matchday's earliest kickoff", async () => {
    const { prisma, fixtureCreate } = makePrisma();
    const fixtures = [
      fixture({ externalId: "1", round: "League Stage - 1", kickoffAt: new Date("2025-09-16T18:45:00Z") }),
      // 26h15m after fixture 1 within the same real matchday
      fixture({ externalId: "2", round: "League Stage - 1", kickoffAt: new Date("2025-09-17T21:00:00Z") }),
    ];
    const service = new PracticeSeasonService(prisma, makeProvider(fixtures));

    await service.seedPracticeSeason();

    const f1 = fixtureCreate.mock.calls.find((c) => c[0].data.externalId === "replay-1")[0].data;
    const f2 = fixtureCreate.mock.calls.find((c) => c[0].data.externalId === "replay-2")[0].data;

    const realOffsetMs = new Date("2025-09-17T21:00:00Z").getTime() - new Date("2025-09-16T18:45:00Z").getTime();
    expect(f2.kickoffAt.getTime() - f1.kickoffAt.getTime()).toBe(realOffsetMs);
  });

  it("stores the real result as a held-back ReplayFixtureResult, revealed ~110 minutes after synthetic kickoff", async () => {
    const { prisma, fixtureCreate, replayResultCreate } = makePrisma();
    const service = new PracticeSeasonService(
      prisma,
      makeProvider([fixture({ externalId: "1", homeScore: 3, awayScore: 0 })]),
    );

    await service.seedPracticeSeason();

    const createdFixture = fixtureCreate.mock.results[0].value;
    expect(fixtureCreate.mock.calls[0][0].data.status).toBe("SCHEDULED");
    await expect(createdFixture).resolves.not.toHaveProperty("homeScore");

    const replayCall = replayResultCreate.mock.calls[0][0].data;
    expect(replayCall).toMatchObject({ homeScore: 3, awayScore: 0 });
    const resolved = await createdFixture;
    expect(replayCall.revealAt.getTime() - resolved.kickoffAt.getTime()).toBe(110 * 60 * 1000);
  });

  it("throws when the provider returns nothing mappable to a matchday", async () => {
    const { prisma } = makePrisma();
    const service = new PracticeSeasonService(prisma, makeProvider([fixture({ round: "3rd Qualifying Round" })]));

    await expect(service.seedPracticeSeason()).rejects.toThrow();
  });
});
