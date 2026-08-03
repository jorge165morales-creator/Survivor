import { PracticeReplayScheduler } from "./practice-replay-scheduler.service";
import { PrismaService } from "../prisma/prisma.service";
import { IngestionService } from "./ingestion.service";

function makePrisma(dueResults: unknown[] = []) {
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  const findMany = jest.fn().mockResolvedValue(dueResults);
  return {
    prisma: {
      fixture: { updateMany },
      replayFixtureResult: { findMany },
    } as unknown as PrismaService,
    updateMany,
    findMany,
  };
}

function replayResult(overrides: Partial<{ homeScore: number; awayScore: number }> = {}) {
  return {
    id: "replay-1",
    homeScore: 2,
    awayScore: 1,
    ...overrides,
    fixture: {
      id: "fixture-1",
      externalId: "replay-551981",
      matchdayId: "matchday-1",
      kickoffAt: new Date("2026-08-01T18:45:00Z"),
      venue: "Sample Stadium",
      homeTeam: { externalId: "77", name: "Athletic Club", crestUrl: null },
      awayTeam: { externalId: "57", name: "Arsenal FC", crestUrl: null },
    },
  };
}

describe("PracticeReplayScheduler.tick", () => {
  it("flips practice fixtures at or past their synthetic kickoff to LIVE, scoped to isPractice seasons", async () => {
    const { prisma, updateMany } = makePrisma([]);
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const scheduler = new PracticeReplayScheduler(prisma, ingestion);

    await scheduler.tick();

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: "SCHEDULED",
        kickoffAt: { lte: expect.any(Date) },
        matchday: { season: { isPractice: true } },
      },
      data: { status: "LIVE" },
    });
  });

  it("reveals a due result by upserting the real score as FINISHED", async () => {
    const { prisma } = makePrisma([replayResult({ homeScore: 3, awayScore: 0 })]);
    const ingestion = { upsertFixture: jest.fn() } as unknown as IngestionService;
    const scheduler = new PracticeReplayScheduler(prisma, ingestion);

    await scheduler.tick();

    expect(ingestion.upsertFixture).toHaveBeenCalledWith(
      "matchday-1",
      expect.objectContaining({
        externalId: "replay-551981",
        homeTeamExternalId: "77",
        awayTeamExternalId: "57",
        status: "FINISHED",
        homeScore: 3,
        awayScore: 0,
      }),
    );
  });

  it("isolates a failure revealing one fixture from the rest", async () => {
    const { prisma } = makePrisma([replayResult(), { ...replayResult(), id: "replay-2", fixture: { ...replayResult().fixture, id: "fixture-2", externalId: "replay-2" } }]);
    const ingestion = {
      upsertFixture: jest.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined),
    } as unknown as IngestionService;
    const scheduler = new PracticeReplayScheduler(prisma, ingestion);

    await expect(scheduler.tick()).resolves.not.toThrow();
    expect(ingestion.upsertFixture).toHaveBeenCalledTimes(2);
  });
});
