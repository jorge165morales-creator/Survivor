import { ConflictException, NotFoundException } from "@nestjs/common";
import { CompetitionProvisioningService } from "./competition-provisioning.service";
import { PrismaService } from "../prisma/prisma.service";

function makePrisma(overrides: {
  existingSeason?: { id: string } | null;
  competitionRow?: { id: string; name: string; structure: string; matchdayCount: number };
} = {}) {
  const competitionUpsert = jest.fn().mockResolvedValue({ id: "competition-id" });
  const competitionFindUniqueOrThrow = jest.fn().mockResolvedValue(
    overrides.competitionRow ?? { id: "competition-id", name: "La Liga", structure: "ROUND_ROBIN", matchdayCount: 38 },
  );
  const seasonFindFirst = jest.fn().mockResolvedValue(overrides.existingSeason ?? null);
  const seasonCreate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new-season-id", ...data }));
  const matchdayCreateMany = jest.fn().mockResolvedValue({ count: 0 });

  return {
    prisma: {
      competition: { upsert: competitionUpsert, findUniqueOrThrow: competitionFindUniqueOrThrow },
      season: { findFirst: seasonFindFirst, create: seasonCreate },
      matchday: { createMany: matchdayCreateMany },
    } as unknown as PrismaService,
    seasonCreate,
    matchdayCreateMany,
  };
}

describe("CompetitionProvisioningService.provisionSeason", () => {
  it("rejects a competition slug that isn't in the known registry", async () => {
    const { prisma } = makePrisma();
    const service = new CompetitionProvisioningService(prisma);

    await expect(service.provisionSeason({ competitionSlug: "nfl", name: "NFL 2026", year: 2026 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("rejects when a season for that competition/year already exists", async () => {
    const { prisma } = makePrisma({ existingSeason: { id: "existing-season-id" } });
    const service = new CompetitionProvisioningService(prisma);

    await expect(
      service.provisionSeason({ competitionSlug: "la-liga", name: "La Liga 2026/27", year: 2026 }),
    ).rejects.toThrow(ConflictException);
  });

  it("creates a season and pre-creates matchdayCount round-robin matchdays, sequenced from 1", async () => {
    const { prisma, seasonCreate, matchdayCreateMany } = makePrisma();
    const service = new CompetitionProvisioningService(prisma);

    const result = await service.provisionSeason({ competitionSlug: "la-liga", name: "La Liga 2026/27", year: 2026 });

    expect(seasonCreate).toHaveBeenCalledWith({
      data: { name: "La Liga 2026/27", year: 2026, isActive: true, competitionId: "competition-id" },
    });
    expect(result).toEqual({ seasonId: "new-season-id", competitionId: "competition-id", matchdaysCreated: 38 });

    const createdMatchdays = matchdayCreateMany.mock.calls[0][0].data;
    expect(createdMatchdays).toHaveLength(38);
    expect(createdMatchdays[0]).toMatchObject({ sequence: 1, type: "GROUP", roundLabel: "Matchday 1", seasonId: "new-season-id" });
    expect(createdMatchdays[37]).toMatchObject({ sequence: 38, type: "GROUP", roundLabel: "Matchday 38" });
  });

  it("reuses prisma/seed.ts's exact 17-matchday calendar for a GROUP_AND_KNOCKOUT competition", async () => {
    const { prisma, matchdayCreateMany } = makePrisma({
      competitionRow: { id: "ucl-id", name: "UEFA Champions League", structure: "GROUP_AND_KNOCKOUT", matchdayCount: 17 },
    });
    const service = new CompetitionProvisioningService(prisma);

    const result = await service.provisionSeason({ competitionSlug: "ucl", name: "UEFA Champions League 2027/28", year: 2027 });

    expect(result.matchdaysCreated).toBe(17);
    const createdMatchdays = matchdayCreateMany.mock.calls[0][0].data;
    expect(createdMatchdays.find((m: { sequence: number }) => m.sequence === 17)).toMatchObject({
      type: "FINAL",
      roundLabel: "Final",
    });
  });

  it("refuses to guess a calendar for a GROUP_AND_KNOCKOUT competition with an unfamiliar matchdayCount", async () => {
    const { prisma } = makePrisma({
      competitionRow: { id: "weird-id", name: "Weird Cup", structure: "GROUP_AND_KNOCKOUT", matchdayCount: 21 },
    });
    const service = new CompetitionProvisioningService(prisma);

    await expect(
      service.provisionSeason({ competitionSlug: "ucl", name: "Weird Cup 2026", year: 2026 }),
    ).rejects.toThrow(/No placeholder calendar builder/);
  });
});
