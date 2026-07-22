import { ForbiddenException } from "@nestjs/common";
import { StandingsService } from "./standings.service";
import { PrismaService } from "../prisma/prisma.service";

type MockPrisma = {
  leagueMembership: { findUnique: jest.Mock; findMany: jest.Mock };
  league: { findUniqueOrThrow: jest.Mock };
  matchday: { findMany: jest.Mock };
  pick: { findMany: jest.Mock };
};

function makePrisma(): MockPrisma {
  return {
    leagueMembership: { findUnique: jest.fn(), findMany: jest.fn() },
    league: { findUniqueOrThrow: jest.fn() },
    matchday: { findMany: jest.fn() },
    pick: { findMany: jest.fn() },
  };
}

const TEAM_A = { id: "team-a", name: "Arsenal", shortName: "ARS", crestUrl: null };
const TEAM_B = { id: "team-b", name: "Barcelona", shortName: "BAR", crestUrl: null };

describe("StandingsService.getStandingsGrid", () => {
  let prisma: MockPrisma;
  let service: StandingsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new StandingsService(prisma as unknown as PrismaService);
  });

  it("rejects a caller who isn't a member of the league", async () => {
    prisma.leagueMembership.findUnique.mockResolvedValue(null);

    await expect(service.getStandingsGrid("league-1", "user-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("builds one column per matchday and maps each member's picks by matchday id", async () => {
    prisma.leagueMembership.findUnique.mockResolvedValue({ status: "ACTIVE" });
    prisma.league.findUniqueOrThrow.mockResolvedValue({ id: "league-1", seasonId: "season-1" });
    prisma.matchday.findMany.mockResolvedValue([
      { id: "md-1", sequence: 1, type: "GROUP", roundLabel: "League Phase Matchday 1" },
      { id: "md-2", sequence: 2, type: "GROUP", roundLabel: "League Phase Matchday 2" },
    ]);
    prisma.leagueMembership.findMany.mockResolvedValue([
      {
        userId: "user-1",
        user: { displayName: "Alice" },
        status: "ACTIVE",
        eliminatedAtMatchday: null,
        buyBackAvailable: false,
        buyBackUsed: false,
      },
      {
        userId: "user-2",
        user: { displayName: "Bob" },
        status: "ELIMINATED",
        eliminatedAtMatchday: { sequence: 1 },
        buyBackAvailable: false,
        buyBackUsed: false,
      },
    ]);
    const FIXTURE_1 = {
      id: "fixture-1",
      homeTeam: TEAM_A,
      awayTeam: TEAM_B,
      kickoffAt: new Date("2026-01-01T20:00:00Z"),
      status: "FINISHED",
      homeScore: 2,
      awayScore: 1,
      result: "HOME_WIN",
    };
    prisma.pick.findMany.mockResolvedValue([
      { userId: "user-1", matchdayId: "md-1", team: TEAM_A, outcome: "WIN", fixture: FIXTURE_1 },
      { userId: "user-2", matchdayId: "md-1", team: TEAM_B, outcome: "LOSS", fixture: FIXTURE_1 },
    ]);

    const result = await service.getStandingsGrid("league-1", "user-1");

    expect(result.matchdays).toEqual([
      { id: "md-1", sequence: 1, type: "GROUP", roundLabel: "League Phase Matchday 1" },
      { id: "md-2", sequence: 2, type: "GROUP", roundLabel: "League Phase Matchday 2" },
    ]);
    // Alive member ranks first regardless of array order from Prisma.
    expect(result.rows.map((r) => r.userId)).toEqual(["user-1", "user-2"]);
    const expectedFixture = {
      id: "fixture-1",
      homeTeam: TEAM_A,
      awayTeam: TEAM_B,
      kickoffAt: "2026-01-01T20:00:00.000Z",
      status: "FINISHED",
      homeScore: 2,
      awayScore: 1,
      result: "HOME_WIN",
    };
    expect(result.rows[0].picks).toEqual({ "md-1": { team: TEAM_A, outcome: "WIN", fixture: expectedFixture } });
    // No pick was ever made for md-2 — the key is simply absent, not null.
    expect(result.rows[0].picks["md-2"]).toBeUndefined();
    expect(result.rows[1].picks).toEqual({ "md-1": { team: TEAM_B, outcome: "LOSS", fixture: expectedFixture } });
  });

  it("ranks eliminated members by latest elimination first, alive members always on top", async () => {
    prisma.leagueMembership.findUnique.mockResolvedValue({ status: "ACTIVE" });
    prisma.league.findUniqueOrThrow.mockResolvedValue({ id: "league-1", seasonId: "season-1" });
    prisma.matchday.findMany.mockResolvedValue([]);
    prisma.leagueMembership.findMany.mockResolvedValue([
      {
        userId: "out-early",
        user: { displayName: "Out Early" },
        status: "ELIMINATED",
        eliminatedAtMatchday: { sequence: 1 },
        buyBackAvailable: false,
        buyBackUsed: false,
      },
      {
        userId: "alive",
        user: { displayName: "Still Alive" },
        status: "ACTIVE",
        eliminatedAtMatchday: null,
        buyBackAvailable: false,
        buyBackUsed: false,
      },
      {
        userId: "out-late",
        user: { displayName: "Out Late" },
        status: "ELIMINATED",
        eliminatedAtMatchday: { sequence: 3 },
        buyBackAvailable: false,
        buyBackUsed: false,
      },
    ]);
    prisma.pick.findMany.mockResolvedValue([]);

    const result = await service.getStandingsGrid("league-1", "alive");

    expect(result.rows.map((r) => r.userId)).toEqual(["alive", "out-late", "out-early"]);
  });

  it("excludes unpaid members from a paymentRequired league entirely", async () => {
    prisma.leagueMembership.findUnique.mockResolvedValue({ status: "ACTIVE" });
    prisma.league.findUniqueOrThrow.mockResolvedValue({
      id: "league-1",
      seasonId: "season-1",
      paymentRequired: true,
    });
    prisma.matchday.findMany.mockResolvedValue([]);
    prisma.leagueMembership.findMany.mockResolvedValue([
      {
        userId: "paid-up",
        user: { displayName: "Paid Up" },
        status: "ACTIVE",
        eliminatedAtMatchday: null,
        buyBackAvailable: false,
        buyBackUsed: false,
        hasPaid: true,
      },
      {
        userId: "still-owes",
        user: { displayName: "Still Owes" },
        status: "ACTIVE",
        eliminatedAtMatchday: null,
        buyBackAvailable: false,
        buyBackUsed: false,
        hasPaid: false,
      },
    ]);
    prisma.pick.findMany.mockResolvedValue([]);

    const result = await service.getStandingsGrid("league-1", "paid-up");

    expect(result.rows.map((r) => r.userId)).toEqual(["paid-up"]);
  });
});

describe("StandingsService.getStandings", () => {
  let prisma: MockPrisma;
  let service: StandingsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new StandingsService(prisma as unknown as PrismaService);
  });

  it("excludes unpaid members from a paymentRequired league entirely", async () => {
    prisma.leagueMembership.findUnique.mockResolvedValue({ status: "ACTIVE" });
    prisma.league.findUniqueOrThrow.mockResolvedValue({ paymentRequired: true });
    prisma.leagueMembership.findMany.mockResolvedValue([
      {
        userId: "paid-up",
        user: { displayName: "Paid Up" },
        status: "ACTIVE",
        eliminatedAtMatchday: null,
        buyBackAvailable: false,
        buyBackUsed: false,
        hasPaid: true,
      },
      {
        userId: "still-owes",
        user: { displayName: "Still Owes" },
        status: "ACTIVE",
        eliminatedAtMatchday: null,
        buyBackAvailable: false,
        buyBackUsed: false,
        hasPaid: false,
      },
    ]);

    const result = await service.getStandings("league-1", "paid-up");

    expect(result.entries.map((e) => e.userId)).toEqual(["paid-up"]);
  });

  it("includes everyone when the league doesn't require payment", async () => {
    prisma.leagueMembership.findUnique.mockResolvedValue({ status: "ACTIVE" });
    prisma.league.findUniqueOrThrow.mockResolvedValue({ paymentRequired: false });
    prisma.leagueMembership.findMany.mockResolvedValue([
      {
        userId: "user-1",
        user: { displayName: "Alice" },
        status: "ACTIVE",
        eliminatedAtMatchday: null,
        buyBackAvailable: false,
        buyBackUsed: false,
        hasPaid: false,
      },
    ]);

    const result = await service.getStandings("league-1", "user-1");

    expect(result.entries.map((e) => e.userId)).toEqual(["user-1"]);
  });

  it("ranks a member who hasn't used a buy-back above one who has, when tied on matchday", async () => {
    prisma.leagueMembership.findUnique.mockResolvedValue({ status: "ACTIVE" });
    prisma.league.findUniqueOrThrow.mockResolvedValue({ paymentRequired: false });
    prisma.leagueMembership.findMany.mockResolvedValue([
      {
        userId: "used-buyback",
        user: { displayName: "Used Buyback" },
        status: "ELIMINATED",
        eliminatedAtMatchday: { sequence: 5 },
        buyBackAvailable: true,
        buyBackUsed: true,
        hasPaid: true,
      },
      {
        userId: "no-buyback",
        user: { displayName: "No Buyback" },
        status: "ELIMINATED",
        eliminatedAtMatchday: { sequence: 5 },
        buyBackAvailable: false,
        buyBackUsed: false,
        hasPaid: true,
      },
    ]);

    const result = await service.getStandings("league-1", "no-buyback");

    expect(result.entries.map((e) => e.userId)).toEqual(["no-buyback", "used-buyback"]);
  });
});
