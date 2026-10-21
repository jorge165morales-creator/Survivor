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
  id?: string;
  teamId: string;
  cycleIndex: number;
  usedInPick: { id?: string; matchdayId: string; matchday: { sequence: number; lockAt?: Date } };
}

function makePrisma(opts: {
  membership?: { status: string; eliminatedAtMatchdayId?: string | null } | null;
  paymentRequired?: boolean;
  hasPaid?: boolean;
  matchday: { id: string; seasonId?: string; sequence: number; lockAt: Date; fixtures?: unknown[] };
  teamCount: number;
  usedTeams?: UsedTeamRow[];
  existingPick?: { id: string; teamId?: string; submittedAt?: Date } | null;
  // The sequence to resolve when getPickOptions looks up the matchday that
  // actually eliminated this member (a different matchday than opts.matchday).
  eliminatedAtMatchdaySequence?: number;
}) {
  const usedTeam = {
    findMany: jest.fn().mockResolvedValue(opts.usedTeams ?? []),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };
  const pickUpdate = jest.fn().mockResolvedValue({ id: "pick-updated" });
  const pickCreate = jest.fn().mockResolvedValue({ id: "pick-created" });
  const pickDelete = jest.fn().mockResolvedValue({});

  const tx = {
    pick: { update: pickUpdate, create: pickCreate, delete: pickDelete },
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
      // Two different call shapes can target the same matchday id (viewing
      // the very matchday that eliminated you) — discriminate by shape
      // (select: only the eliminatedAtMatchday lookup uses that), not id.
      findUnique: jest.fn().mockImplementation((args: { select?: unknown }) => {
        if (args.select) {
          return Promise.resolve({ sequence: opts.eliminatedAtMatchdaySequence });
        }
        return Promise.resolve({ seasonId: SEASON_ID, fixtures: [], ...opts.matchday });
      }),
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

  return { prisma, usedTeam, pickUpdate, pickCreate, pickDelete };
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

  it("excludes a team pre-claimed by a still-open LATER matchday — the earlier matchday trumps it", async () => {
    const { prisma } = makePrisma({
      matchday: { id: "md-2", sequence: 2, lockAt: new Date("2027-01-01T00:00:00Z") },
      teamCount: 20,
      usedTeams: [
        {
          teamId: "team-x",
          cycleIndex: 0,
          usedInPick: { matchdayId: "md-5", matchday: { sequence: 5, lockAt: new Date("2027-02-01T00:00:00Z") } },
        },
      ],
    });
    const service = new PicksService(prisma, makeRecompute());

    const result = await service.getPickOptions(LEAGUE_ID, "md-2", USER_ID);

    expect(result.usedTeamIds).toEqual([]);
  });

  it("still includes a team used by a LATER matchday that's already locked", async () => {
    const { prisma } = makePrisma({
      matchday: { id: "md-2", sequence: 2, lockAt: new Date("2027-06-01T00:00:00Z") },
      teamCount: 20,
      usedTeams: [
        {
          teamId: "team-x",
          cycleIndex: 0,
          // Higher sequence, but already locked — a resolved pick, not a
          // supersedable pre-selection, so it still blocks normally.
          usedInPick: { matchdayId: "md-5", matchday: { sequence: 5, lockAt: new Date("2000-01-01T00:00:00Z") } },
        },
      ],
    });
    const service = new PicksService(prisma, makeRecompute());

    const result = await service.getPickOptions(LEAGUE_ID, "md-2", USER_ID);

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

  describe("hiding a pre-submitted pick for a matchday after this member's elimination", () => {
    it("hides currentPick for a matchday AFTER the one that eliminated them, even if it's since locked", async () => {
      const { prisma } = makePrisma({
        membership: { status: "ELIMINATED", eliminatedAtMatchdayId: "md-2" },
        matchday: { id: "md-3", sequence: 3, lockAt: new Date("2000-01-01T00:00:00Z") }, // already locked
        teamCount: 20,
        existingPick: { id: "pick-3", teamId: "team-y", submittedAt: new Date("2026-09-01T00:00:00Z") },
        eliminatedAtMatchdaySequence: 2,
      });
      const service = new PicksService(prisma, makeRecompute());

      const result = await service.getPickOptions(LEAGUE_ID, "md-3", USER_ID);

      expect(result.currentPick).toBeNull();
    });

    it("still shows currentPick for the matchday that actually eliminated them", async () => {
      const { prisma } = makePrisma({
        membership: { status: "ELIMINATED", eliminatedAtMatchdayId: "md-2" },
        matchday: { id: "md-2", sequence: 2, lockAt: new Date("2000-01-01T00:00:00Z") },
        teamCount: 20,
        existingPick: { id: "pick-2", teamId: "team-y", submittedAt: new Date("2026-09-01T00:00:00Z") },
        eliminatedAtMatchdaySequence: 2,
      });
      const service = new PicksService(prisma, makeRecompute());

      const result = await service.getPickOptions(LEAGUE_ID, "md-2", USER_ID);

      expect(result.currentPick).toEqual({ teamId: "team-y", submittedAt: "2026-09-01T00:00:00.000Z" });
    });

    it("still shows currentPick for a matchday BEFORE the elimination point", async () => {
      const { prisma } = makePrisma({
        membership: { status: "ELIMINATED", eliminatedAtMatchdayId: "md-2" },
        matchday: { id: "md-1", sequence: 1, lockAt: new Date("2000-01-01T00:00:00Z") },
        teamCount: 20,
        existingPick: { id: "pick-1", teamId: "team-x", submittedAt: new Date("2026-08-01T00:00:00Z") },
        eliminatedAtMatchdaySequence: 2,
      });
      const service = new PicksService(prisma, makeRecompute());

      const result = await service.getPickOptions(LEAGUE_ID, "md-1", USER_ID);

      expect(result.currentPick).toEqual({ teamId: "team-x", submittedAt: "2026-08-01T00:00:00.000Z" });
    });

    it("does not hide anything for a member who's still ACTIVE", async () => {
      const { prisma } = makePrisma({
        membership: { status: "ACTIVE" },
        matchday: { id: "md-3", sequence: 3, lockAt: new Date("2027-01-01T00:00:00Z") },
        teamCount: 20,
        existingPick: { id: "pick-3", teamId: "team-y", submittedAt: new Date("2026-09-01T00:00:00Z") },
      });
      const service = new PicksService(prisma, makeRecompute());

      const result = await service.getPickOptions(LEAGUE_ID, "md-3", USER_ID);

      expect(result.currentPick).toEqual({ teamId: "team-y", submittedAt: "2026-09-01T00:00:00.000Z" });
    });
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

  it("allows a team pre-claimed by a still-open LATER matchday, clearing that future pick", async () => {
    const { prisma, usedTeam, pickDelete, pickCreate } = makePrisma({
      matchday: matchdayWithFixture({ id: "md-2", sequence: 2, lockAt: new Date("2027-01-01T00:00:00Z") }),
      teamCount: 20,
      usedTeams: [
        {
          id: "used-team-future",
          teamId: "team-x",
          cycleIndex: 0,
          usedInPick: {
            id: "pick-future",
            matchdayId: "md-5",
            matchday: { sequence: 5, lockAt: new Date("2027-02-01T00:00:00Z") },
          },
        },
      ],
    });
    const service = new PicksService(prisma, makeRecompute());

    await service.submitPick(LEAGUE_ID, "md-2", USER_ID, "team-x");

    // The future pick is cleared entirely — UsedTeam row first (RESTRICT FK
    // onto Pick), then the Pick itself, so md-5 goes back to no selection.
    expect(usedTeam.delete).toHaveBeenCalledWith({ where: { id: "used-team-future" } });
    expect(pickDelete).toHaveBeenCalledWith({ where: { id: "pick-future" } });
    expect(pickCreate).toHaveBeenCalled();
  });

  it("still rejects a team used by a LATER matchday that's already locked", async () => {
    const { prisma } = makePrisma({
      matchday: matchdayWithFixture({ id: "md-2", sequence: 2, lockAt: new Date("2027-06-01T00:00:00Z") }),
      teamCount: 20,
      usedTeams: [
        {
          id: "used-team-future",
          teamId: "team-x",
          cycleIndex: 0,
          usedInPick: {
            id: "pick-future",
            matchdayId: "md-5",
            matchday: { sequence: 5, lockAt: new Date("2000-01-01T00:00:00Z") },
          },
        },
      ],
    });
    const service = new PicksService(prisma, makeRecompute());

    await expect(service.submitPick(LEAGUE_ID, "md-2", USER_ID, "team-x")).rejects.toThrow(BadRequestException);
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
