import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PicksService } from "./picks.service";
import { PrismaService } from "../prisma/prisma.service";
import { RecomputeService } from "../game-engine/recompute.service";

const LEAGUE_ID = "league-1";
const USER_ID = "user-1";
const SEASON_ID = "season-1";

function team(id: string) {
  return { id, name: id, shortName: id, crestUrl: null };
}

interface UsedTeamRow {
  teamId: string;
  cycleIndex: number;
  usedInPick: { matchdayId: string; matchday: { sequence: number } };
}

function makePrisma(opts: {
  membership?: { status: string } | null;
  paymentRequired?: boolean;
  hasPaid?: boolean;
  matchday: { id: string; seasonId?: string; sequence: number; lockAt: Date; fixtures?: unknown[] };
  teamCount: number;
  usedTeams?: UsedTeamRow[];
  existingPick?: { id: string } | null;
}) {
  const usedTeam = {
    findMany: jest.fn().mockResolvedValue(opts.usedTeams ?? []),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };
  const pickUpdate = jest.fn().mockResolvedValue({ id: "pick-updated" });
  const pickCreate = jest.fn().mockResolvedValue({ id: "pick-created" });

  const tx = {
    pick: { update: pickUpdate, create: pickCreate },
    usedTeam,
  };

  const prisma = {
    leagueMembership: {
      findUnique: jest.fn().mockResolvedValue(
        "membership" in opts ? opts.membership : { status: "ACTIVE", hasPaid: opts.hasPaid ?? true },
      ),
    },
    league: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ paymentRequired: opts.paymentRequired ?? false }),
    },
    matchday: {
      findUnique: jest.fn().mockResolvedValue({ seasonId: SEASON_ID, fixtures: [], ...opts.matchday }),
    },
    pick: {
      findUnique: jest.fn().mockResolvedValue(opts.existingPick ?? null),
    },
    team: {
      count: jest.fn().mockResolvedValue(opts.teamCount),
    },
    usedTeam,
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
  } as unknown as PrismaService;

  return { prisma, usedTeam, pickUpdate, pickCreate };
}

function makeRecompute() {
  return { recomputeLeague: jest.fn().mockResolvedValue(undefined) } as unknown as RecomputeService;
}

describe("PicksService.getPickOptions", () => {
  it("excludes the current matchday's own used-team row from usedTeamIds", async () => {
    const { prisma } = makePrisma({
      matchday: { id: "md-5", sequence: 5, lockAt: new Date("2027-01-01T00:00:00Z") },
      teamCount: 20,
      usedTeams: [{ teamId: "team-x", cycleIndex: 0, usedInPick: { matchdayId: "md-5", matchday: { sequence: 5 } } }],
    });
    const service = new PicksService(prisma, makeRecompute());

    const result = await service.getPickOptions(LEAGUE_ID, "md-5", USER_ID);

    expect(result.usedTeamIds).toEqual([]);
  });

  it("includes a team used earlier within the still-active current cycle", async () => {
    const { prisma } = makePrisma({
      matchday: { id: "md-5", sequence: 5, lockAt: new Date("2027-01-01T00:00:00Z") },
      teamCount: 20,
      usedTeams: [{ teamId: "team-x", cycleIndex: 0, usedInPick: { matchdayId: "md-2", matchday: { sequence: 2 } } }],
    });
    const service = new PicksService(prisma, makeRecompute());

    const result = await service.getPickOptions(LEAGUE_ID, "md-5", USER_ID);

    expect(result.usedTeamIds).toEqual(["team-x"]);
  });

  it("excludes a team used in an earlier, already-completed cycle (the reset)", async () => {
    // 20-team round robin: matchdays 1-20 are cycle 0, 21+ are cycle 1.
    // Team used at matchday 3 (cycle 0) shouldn't block a pick at matchday 25 (cycle 1).
    const { prisma } = makePrisma({
      matchday: { id: "md-25", sequence: 25, lockAt: new Date("2027-01-01T00:00:00Z") },
      teamCount: 20,
      usedTeams: [{ teamId: "team-x", cycleIndex: 0, usedInPick: { matchdayId: "md-3", matchday: { sequence: 3 } } }],
    });
    const service = new PicksService(prisma, makeRecompute());

    const result = await service.getPickOptions(LEAGUE_ID, "md-25", USER_ID);

    expect(result.usedTeamIds).toEqual([]);
  });
});

describe("PicksService.submitPick", () => {
  function matchdayWithFixture(overrides: { id: string; sequence: number; lockAt: Date }) {
    return {
      ...overrides,
      fixtures: [{ id: "fixture-1", homeTeamId: "team-x", awayTeamId: "team-y" }],
    };
  }

  it("rejects a team already used within the current cycle", async () => {
    const { prisma } = makePrisma({
      matchday: matchdayWithFixture({ id: "md-5", sequence: 5, lockAt: new Date("2027-01-01T00:00:00Z") }),
      teamCount: 20,
      usedTeams: [{ teamId: "team-x", cycleIndex: 0, usedInPick: { matchdayId: "md-2", matchday: { sequence: 2 } } }],
    });
    const service = new PicksService(prisma, makeRecompute());

    await expect(service.submitPick(LEAGUE_ID, "md-5", USER_ID, "team-x")).rejects.toThrow(BadRequestException);
  });

  it("allows a team that was already used in an earlier, completed cycle", async () => {
    const { prisma, usedTeam } = makePrisma({
      matchday: matchdayWithFixture({ id: "md-25", sequence: 25, lockAt: new Date("2027-01-01T00:00:00Z") }),
      teamCount: 20,
      // team-x was used at matchday 3 (cycle 0) — queried with cycleIndex: 1
      // for this matchday-25 pick, so it's correctly excluded at the DB level.
      usedTeams: [],
    });
    const service = new PicksService(prisma, makeRecompute());

    await service.submitPick(LEAGUE_ID, "md-25", USER_ID, "team-x");

    expect(usedTeam.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ cycleIndex: 1 }) }));
    expect(usedTeam.create).toHaveBeenCalledWith({
      data: { leagueId: LEAGUE_ID, userId: USER_ID, teamId: "team-x", cycleIndex: 1, usedInPickId: "pick-created" },
    });
  });

  it("stamps a newly created UsedTeam row with the matchday's cycleIndex", async () => {
    const { prisma, usedTeam } = makePrisma({
      matchday: matchdayWithFixture({ id: "md-5", sequence: 5, lockAt: new Date("2027-01-01T00:00:00Z") }),
      teamCount: 20,
    });
    const service = new PicksService(prisma, makeRecompute());

    await service.submitPick(LEAGUE_ID, "md-5", USER_ID, "team-x");

    expect(usedTeam.create).toHaveBeenCalledWith({
      data: { leagueId: LEAGUE_ID, userId: USER_ID, teamId: "team-x", cycleIndex: 0, usedInPickId: "pick-created" },
    });
  });

  it("updates the existing UsedTeam row's team and cycleIndex when changing a pick", async () => {
    const { prisma, usedTeam } = makePrisma({
      matchday: matchdayWithFixture({ id: "md-5", sequence: 5, lockAt: new Date("2027-01-01T00:00:00Z") }),
      teamCount: 20,
      existingPick: { id: "existing-pick-id" },
    });
    const service = new PicksService(prisma, makeRecompute());

    await service.submitPick(LEAGUE_ID, "md-5", USER_ID, "team-x");

    expect(usedTeam.update).toHaveBeenCalledWith({
      where: { usedInPickId: "pick-updated" },
      data: { teamId: "team-x", cycleIndex: 0 },
    });
  });

  it("rejects when the league requires payment and the member hasn't paid", async () => {
    const { prisma } = makePrisma({
      matchday: matchdayWithFixture({ id: "md-5", sequence: 5, lockAt: new Date("2027-01-01T00:00:00Z") }),
      teamCount: 20,
      paymentRequired: true,
      hasPaid: false,
    });
    const service = new PicksService(prisma, makeRecompute());

    await expect(service.submitPick(LEAGUE_ID, "md-5", USER_ID, "team-x")).rejects.toThrow(ForbiddenException);
  });

  it("rejects a team that isn't playing in this matchday's fixtures", async () => {
    const { prisma } = makePrisma({
      matchday: matchdayWithFixture({ id: "md-5", sequence: 5, lockAt: new Date("2027-01-01T00:00:00Z") }),
      teamCount: 20,
    });
    const service = new PicksService(prisma, makeRecompute());

    await expect(service.submitPick(LEAGUE_ID, "md-5", USER_ID, "team-nowhere")).rejects.toThrow(BadRequestException);
  });
});
