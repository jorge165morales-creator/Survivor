import { RecomputeService } from "./recompute.service";
import { PrismaService } from "../prisma/prisma.service";

interface FixtureRow {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  status: "SCHEDULED" | "FINISHED";
  result: "HOME_WIN" | "AWAY_WIN" | "DRAW" | null;
}

interface PickRow {
  id: string;
  matchdayId: string;
  teamId: string;
  outcome: string;
  fixture: FixtureRow | null;
}

interface MatchdayRow {
  id: string;
  sequence: number;
  lockAt: Date;
}

function makeTx(opts: {
  matchdays: MatchdayRow[];
  membership: { id: string; status: string; eliminatedAtMatchdayId: string | null; tieForgivenessUsed: boolean };
  picks: PickRow[];
}) {
  const pickUpdates: { pickId: string; outcome: string }[] = [];
  let membershipUpdate: Record<string, unknown> | null = null;

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    league: { findUniqueOrThrow: jest.fn().mockResolvedValue({ seasonId: "season-1" }) },
    matchday: { findMany: jest.fn().mockResolvedValue(opts.matchdays) },
    leagueMembership: {
      findMany: jest.fn().mockResolvedValue([opts.membership]),
      update: jest.fn().mockImplementation(({ data }) => {
        membershipUpdate = data;
        return Promise.resolve({ ...opts.membership, ...data });
      }),
    },
    pick: {
      findMany: jest.fn().mockResolvedValue(opts.picks),
      update: jest.fn().mockImplementation(({ where, data }) => {
        pickUpdates.push({ pickId: where.id, outcome: data.outcome });
        return Promise.resolve({});
      }),
    },
  };

  return { tx, pickUpdates, getMembershipUpdate: () => membershipUpdate };
}

function makePrisma(tx: unknown) {
  return {
    fixture: { findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<void>) => cb(tx)),
  } as unknown as PrismaService;
}

const HOME = "home-team";
const AWAY = "away-team";

const MATCHDAYS: MatchdayRow[] = [
  { id: "md-1", sequence: 1, lockAt: new Date("2026-09-01T00:00:00Z") },
  { id: "md-2", sequence: 2, lockAt: new Date("2026-09-15T00:00:00Z") },
  { id: "md-3", sequence: 3, lockAt: new Date("2026-09-29T00:00:00Z") },
];

const MEMBERSHIP = { id: "membership-1", status: "ACTIVE", eliminatedAtMatchdayId: null, tieForgivenessUsed: false };

describe("RecomputeService.recomputeLeague", () => {
  it("keeps a member ACTIVE through consecutive wins", async () => {
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "PENDING",
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "HOME_WIN" },
      },
      {
        id: "pick-2",
        matchdayId: "md-2",
        teamId: AWAY,
        outcome: "PENDING",
        fixture: { id: "f2", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "AWAY_WIN" },
      },
    ];
    const { tx, pickUpdates, getMembershipUpdate } = makeTx({ matchdays: MATCHDAYS, membership: MEMBERSHIP, picks });
    const service = new RecomputeService(makePrisma(tx));

    await service.recomputeLeague("league-1");

    expect(pickUpdates).toEqual(
      expect.arrayContaining([
        { pickId: "pick-1", outcome: "WIN" },
        { pickId: "pick-2", outcome: "WIN" },
      ]),
    );
    // Membership was already ACTIVE/unset, matching the computed result, so
    // no write should fire — this is the idempotency guard doing its job.
    expect(getMembershipUpdate()).toBeNull();
  });

  it("eliminates a member on a loss and does not touch later matchdays", async () => {
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "PENDING",
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "HOME_WIN" },
      },
      {
        id: "pick-2",
        matchdayId: "md-2",
        teamId: HOME,
        outcome: "PENDING",
        fixture: { id: "f2", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "AWAY_WIN" },
      },
    ];
    const { tx, pickUpdates, getMembershipUpdate } = makeTx({ matchdays: MATCHDAYS, membership: MEMBERSHIP, picks });
    const service = new RecomputeService(makePrisma(tx));

    await service.recomputeLeague("league-1");

    expect(pickUpdates).toEqual([
      { pickId: "pick-1", outcome: "WIN" },
      { pickId: "pick-2", outcome: "LOSS" },
    ]);
    expect(getMembershipUpdate()).toEqual({
      status: "ELIMINATED",
      eliminatedAtMatchdayId: "md-2",
      tieForgivenessUsed: false,
    });
  });

  it("forgives the first draw but eliminates on a second draw", async () => {
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "PENDING",
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "DRAW" },
      },
      {
        id: "pick-2",
        matchdayId: "md-2",
        teamId: HOME,
        outcome: "PENDING",
        fixture: { id: "f2", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "DRAW" },
      },
    ];
    const { tx, pickUpdates, getMembershipUpdate } = makeTx({ matchdays: MATCHDAYS, membership: MEMBERSHIP, picks });
    const service = new RecomputeService(makePrisma(tx));

    await service.recomputeLeague("league-1");

    expect(pickUpdates).toEqual([
      { pickId: "pick-1", outcome: "DRAW_FORGIVEN" },
      { pickId: "pick-2", outcome: "DRAW_ELIMINATED" },
    ]);
    expect(getMembershipUpdate()).toMatchObject({ status: "ELIMINATED", tieForgivenessUsed: true });
  });

  it("eliminates a member who never picked once their matchday locks", async () => {
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "PENDING",
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "HOME_WIN" },
      },
      // no pick for md-2, which has already locked (lockAt in the past relative to "now" in the test)
    ];
    const pastMatchdays = MATCHDAYS.map((m) => ({ ...m, lockAt: new Date("2000-01-01T00:00:00Z") }));
    const { tx, getMembershipUpdate } = makeTx({ matchdays: pastMatchdays, membership: MEMBERSHIP, picks });
    const service = new RecomputeService(makePrisma(tx));

    await service.recomputeLeague("league-1");

    expect(getMembershipUpdate()).toEqual({
      status: "ELIMINATED",
      eliminatedAtMatchdayId: "md-2",
      tieForgivenessUsed: false,
    });
  });

  it("stops at an unresolved fixture without eliminating for later matchdays", async () => {
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "PENDING",
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "SCHEDULED", result: null },
      },
    ];
    const { tx, pickUpdates, getMembershipUpdate } = makeTx({ matchdays: MATCHDAYS, membership: MEMBERSHIP, picks });
    const service = new RecomputeService(makePrisma(tx));

    await service.recomputeLeague("league-1");

    expect(pickUpdates).toEqual([]); // already PENDING, no update needed
    expect(getMembershipUpdate()).toBeNull(); // already ACTIVE/unset, no update needed
  });

  it("is idempotent: re-running against already-correct state issues no writes", async () => {
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "WIN", // already reflects the correct outcome
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "HOME_WIN" },
      },
    ];
    const alreadyActiveMembership = { id: "membership-1", status: "ACTIVE", eliminatedAtMatchdayId: null, tieForgivenessUsed: false };
    const { tx, pickUpdates, getMembershipUpdate } = makeTx({
      matchdays: MATCHDAYS,
      membership: alreadyActiveMembership,
      picks,
    });
    const service = new RecomputeService(makePrisma(tx));

    await service.recomputeLeague("league-1");

    expect(pickUpdates).toEqual([]);
    expect(getMembershipUpdate()).toBeNull();
  });
});
