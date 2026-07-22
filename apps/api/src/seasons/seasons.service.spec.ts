import { NotFoundException } from "@nestjs/common";
import { SeasonsService } from "./seasons.service";
import { PrismaService } from "../prisma/prisma.service";

type MockPrisma = {
  season: { findFirst: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock };
  matchday: { findMany: jest.Mock };
};

function makePrisma(): MockPrisma {
  return {
    season: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    matchday: { findMany: jest.fn() },
  };
}

const SEASON = { id: "season-1", name: "UEFA Champions League 2026/27", year: 2026, isActive: true };

describe("SeasonsService", () => {
  let prisma: MockPrisma;
  let service: SeasonsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SeasonsService(prisma as unknown as PrismaService);
  });

  describe("getMatchdays", () => {
    it("throws NotFoundException when the season doesn't exist", async () => {
      prisma.season.findUnique.mockResolvedValue(null);
      await expect(service.getMatchdays("missing")).rejects.toThrow(NotFoundException);
    });

    it("returns matchdays ordered by sequence, mapped to summaries", async () => {
      prisma.season.findUnique.mockResolvedValue(SEASON);
      prisma.matchday.findMany.mockResolvedValue([
        {
          id: "md-1",
          sequence: 1,
          type: "GROUP",
          roundLabel: "Matchday 1",
          lockAt: new Date("2026-09-16T18:45:00.000Z"),
        },
      ]);

      const result = await service.getMatchdays(SEASON.id);

      expect(prisma.matchday.findMany).toHaveBeenCalledWith({
        where: { seasonId: SEASON.id },
        orderBy: { sequence: "asc" },
      });
      expect(result).toEqual([
        {
          id: "md-1",
          sequence: 1,
          type: "GROUP",
          roundLabel: "Matchday 1",
          lockAt: "2026-09-16T18:45:00.000Z",
        },
      ]);
    });
  });

  describe("getAll", () => {
    it("includes inactive seasons, ordered by year descending", async () => {
      const historical = { id: "season-2", name: "UEFA Champions League 2025/26 (Test Data)", year: 2025, isActive: false };
      prisma.season.findMany.mockResolvedValue([SEASON, historical]);

      const result = await service.getAll();

      expect(prisma.season.findMany).toHaveBeenCalledWith({ orderBy: { year: "desc" } });
      expect(result).toEqual([
        { id: SEASON.id, name: SEASON.name, year: SEASON.year, isActive: true },
        { id: historical.id, name: historical.name, year: historical.year, isActive: false },
      ]);
    });
  });
});
