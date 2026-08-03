import { IngestionService } from "./ingestion.service";
import { PrismaService } from "../prisma/prisma.service";
import { RecomputeService } from "../game-engine/recompute.service";
import type { ProviderFixture } from "./providers/sports-data.provider.interface";

const HOME_TEAM = { id: "home-uuid", externalId: "home-ext" };
const AWAY_TEAM = { id: "away-uuid", externalId: "away-ext" };

function makePrisma(existingFixture: Record<string, unknown> | null) {
  return {
    team: {
      findUniqueOrThrow: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(where.externalId === HOME_TEAM.externalId ? HOME_TEAM : AWAY_TEAM),
      ),
    },
    fixture: {
      findUnique: jest.fn().mockResolvedValue(existingFixture),
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({ id: "fixture-uuid", ...create }),
      ),
    },
  } as unknown as PrismaService;
}

function providerFixture(overrides: Partial<ProviderFixture> = {}): ProviderFixture {
  return {
    externalId: "provider-fixture-1",
    homeTeamExternalId: HOME_TEAM.externalId,
    awayTeamExternalId: AWAY_TEAM.externalId,
    homeTeamName: "Home FC",
    awayTeamName: "Away FC",
    homeTeamCrestUrl: null,
    awayTeamCrestUrl: null,
    round: "League Stage - 1",
    kickoffAt: new Date("2026-09-16T18:45:00Z"),
    venue: "Sample Stadium, Sample City",
    status: "SCHEDULED",
    homeScore: null,
    awayScore: null,
    ...overrides,
  };
}

describe("IngestionService.upsertFixture", () => {
  it("creates a new fixture without triggering recompute while still scheduled", async () => {
    const prisma = makePrisma(null);
    const recompute = { recomputeLeaguesForFixture: jest.fn() } as unknown as RecomputeService;
    const service = new IngestionService(prisma, recompute);

    await service.upsertFixture("matchday-1", providerFixture());

    expect(recompute.recomputeLeaguesForFixture).not.toHaveBeenCalled();
  });

  it("triggers recompute when a fixture newly finishes", async () => {
    const prisma = makePrisma(null);
    const recompute = { recomputeLeaguesForFixture: jest.fn() } as unknown as RecomputeService;
    const service = new IngestionService(prisma, recompute);

    await service.upsertFixture(
      "matchday-1",
      providerFixture({ status: "FINISHED", homeScore: 2, awayScore: 1 }),
    );

    expect(recompute.recomputeLeaguesForFixture).toHaveBeenCalledWith("fixture-uuid");
  });

  it("does not re-trigger recompute on a no-op poll of an already-finished fixture", async () => {
    const prisma = makePrisma({ status: "FINISHED", result: "HOME_WIN" });
    const recompute = { recomputeLeaguesForFixture: jest.fn() } as unknown as RecomputeService;
    const service = new IngestionService(prisma, recompute);

    await service.upsertFixture(
      "matchday-1",
      providerFixture({ status: "FINISHED", homeScore: 2, awayScore: 1 }),
    );

    expect(recompute.recomputeLeaguesForFixture).not.toHaveBeenCalled();
  });

  it("re-triggers recompute when a provider corrects an already-finished result", async () => {
    const prisma = makePrisma({ status: "FINISHED", result: "DRAW" });
    const recompute = { recomputeLeaguesForFixture: jest.fn() } as unknown as RecomputeService;
    const service = new IngestionService(prisma, recompute);

    await service.upsertFixture(
      "matchday-1",
      providerFixture({ status: "FINISHED", homeScore: 2, awayScore: 1 }), // now HOME_WIN, not DRAW
    );

    expect(recompute.recomputeLeaguesForFixture).toHaveBeenCalledWith("fixture-uuid");
  });
});
