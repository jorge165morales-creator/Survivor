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
  membership: {
    id: string;
    status: string;
    eliminatedAtMatchdayId: string | null;
    buyBackAvailable: boolean;
    buyBackUsed: boolean;
    buyBackGrantedAt?: Date | null;
    buyBackUsedAtMatchdayId?: string | null;
    joinedAt?: Date;
    hasPaid?: boolean;
    paidAt?: Date | null;
  };
  picks: PickRow[];
  paymentRequired?: boolean;
}) {
  const pickUpdates: { pickId: string; outcome: string }[] = [];
  let membershipUpdate: Record<string, unknown> | null = null;

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    league: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ seasonId: "season-1", paymentRequired: opts.paymentRequired ?? false }),
    },
    matchday: { findMany: jest.fn().mockResolvedValue(opts.matchdays) },
    leagueMembership: {
      findMany: jest.fn().mockResolvedValue([
        {
          joinedAt: new Date("1970-01-01T00:00:00Z"), // well before any test matchday locks
          hasPaid: false,
          paidAt: null,
          ...opts.membership,
        },
      ]),
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

// Fixed far enough in the future that "now" (the real wall clock — this
// service takes no injectable clock) can never catch up to md-3 and start
// treating it as locked-with-no-pick. A test that actually wants a matchday
// to be in the past relative to "now" uses PAST_MATCHDAYS below instead.
const MATCHDAYS: MatchdayRow[] = [
  { id: "md-1", sequence: 1, lockAt: new Date("2099-09-01T00:00:00Z") },
  { id: "md-2", sequence: 2, lockAt: new Date("2099-09-15T00:00:00Z") },
  { id: "md-3", sequence: 3, lockAt: new Date("2099-09-29T00:00:00Z") },
];

const MEMBERSHIP = {
  id: "membership-1",
  status: "ACTIVE",
  eliminatedAtMatchdayId: null,
  buyBackAvailable: false,
  buyBackUsed: false,
  buyBackGrantedAt: null,
  buyBackUsedAtMatchdayId: null,
};

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
      buyBackUsed: false,
      buyBackUsedAtMatchdayId: null,
    });
  });

  it("a draw always survives, even a second consecutive one", async () => {
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
      { pickId: "pick-1", outcome: "DRAW" },
      { pickId: "pick-2", outcome: "DRAW" },
    ]);
    // Still ACTIVE/unset, matching computed result — no membership write.
    expect(getMembershipUpdate()).toBeNull();
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
      buyBackUsed: false,
      buyBackUsedAtMatchdayId: null,
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
    const alreadyActiveMembership = {
      id: "membership-1",
      status: "ACTIVE",
      eliminatedAtMatchdayId: null,
      buyBackAvailable: false,
      buyBackUsed: false,
    };
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

  it("forgives a loss once when buyBackAvailable is granted, keeping the member ACTIVE", async () => {
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "PENDING",
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "AWAY_WIN" },
      },
      {
        id: "pick-2",
        matchdayId: "md-2",
        teamId: AWAY,
        outcome: "PENDING",
        fixture: { id: "f2", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "AWAY_WIN" },
      },
    ];
    const membership = { ...MEMBERSHIP, buyBackAvailable: true };
    const { tx, pickUpdates, getMembershipUpdate } = makeTx({ matchdays: MATCHDAYS, membership, picks });
    const service = new RecomputeService(makePrisma(tx));

    await service.recomputeLeague("league-1");

    // The loss is still factually recorded on the pick...
    expect(pickUpdates).toEqual([
      { pickId: "pick-1", outcome: "LOSS" },
      { pickId: "pick-2", outcome: "WIN" },
    ]);
    // ...but the membership survives, and the grant is now marked spent,
    // recording exactly which matchday it forgave.
    expect(getMembershipUpdate()).toEqual({
      status: "ACTIVE",
      eliminatedAtMatchdayId: null,
      buyBackUsed: true,
      buyBackUsedAtMatchdayId: "md-1",
    });
  });

  it("does not forgive a second elimination in the same season once the buy-back is already spent", async () => {
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "WIN",
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
    // buyBackUsed: true simulates a prior recompute pass having already spent
    // it on some earlier elimination — pick-1 is a WIN precisely so the
    // replay reaches md-2's loss without re-triggering forgiveness there.
    const membership = { ...MEMBERSHIP, buyBackAvailable: true, buyBackUsed: true };
    const { tx, pickUpdates, getMembershipUpdate } = makeTx({ matchdays: MATCHDAYS, membership, picks });
    const service = new RecomputeService(makePrisma(tx));

    await service.recomputeLeague("league-1");

    expect(pickUpdates).toEqual([{ pickId: "pick-2", outcome: "LOSS" }]);
    // buyBackUsedAtMatchdayId stays null — this membership predates that
    // column (simulating data from before it existed), so there's no record
    // of which matchday the earlier pass actually forgave, and this replay
    // correctly can't tell md-2 apart from a genuine second miss.
    expect(getMembershipUpdate()).toEqual({
      status: "ELIMINATED",
      eliminatedAtMatchdayId: "md-2",
      buyBackUsed: true,
      buyBackUsedAtMatchdayId: null,
    });
  });

  it("does not re-eliminate a member at the matchday their buy-back already forgave, on a later unrelated replay", async () => {
    // Reproduces the real production bug: a first recompute pass already
    // forgave md-1's loss and persisted buyBackUsed/buyBackUsedAtMatchdayId
    // — this test starts from THAT already-persisted state (not fresh) to
    // confirm a second, later replay (triggered by anything — a different
    // fixture's result landing anywhere in the league) doesn't re-evaluate
    // md-1 as a brand-new, unforgivable elimination just because
    // buyBackConsumed seeds as already-true.
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "LOSS", // already recorded from the earlier pass
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "AWAY_WIN" },
      },
      {
        id: "pick-2",
        matchdayId: "md-2",
        teamId: AWAY,
        outcome: "WIN",
        fixture: { id: "f2", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "AWAY_WIN" },
      },
    ];
    const membership = { ...MEMBERSHIP, buyBackAvailable: true, buyBackUsed: true, buyBackUsedAtMatchdayId: "md-1" };
    const { tx, pickUpdates, getMembershipUpdate } = makeTx({ matchdays: MATCHDAYS, membership, picks });
    const service = new RecomputeService(makePrisma(tx));

    await service.recomputeLeague("league-1");

    // Nothing to update — pick outcomes are already correct and the
    // membership is still correctly ACTIVE, so the idempotency guard holds.
    expect(pickUpdates).toEqual([]);
    expect(getMembershipUpdate()).toBeNull();
  });

  describe("buy-back strictness: a second qualifying event is never excused, whatever caused it", () => {
    // Product rule (2026-10-21): buy-back only ever works after exactly one
    // qualifying elimination event. A missed pick caused purely by already
    // being shown-eliminated (and therefore blocked from picking — see
    // picks.service.ts's ALREADY_ELIMINATED rejection) still counts as a
    // second event and is never excused here — LeaguesService.grantBuyBack
    // is where that's actually prevented, by refusing to grant in the first
    // place once countQualifyingEliminationEvents is already > 1. This test
    // simulates buyBackAvailable having been set true anyway (e.g. stale
    // data) to confirm recompute itself has no separate excuse path.
    const MATCHDAYS_3: MatchdayRow[] = [
      { id: "md-1", sequence: 1, lockAt: new Date("2020-01-01T00:00:00Z") },
      { id: "md-2", sequence: 2, lockAt: new Date("2020-02-01T00:00:00Z") },
      { id: "md-3", sequence: 3, lockAt: new Date("2020-03-01T00:00:00Z") },
    ];
    const LOSS_PICK: PickRow = {
      id: "pick-1",
      matchdayId: "md-1",
      teamId: HOME,
      outcome: "PENDING",
      fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "AWAY_WIN" },
    };

    it("forgives the original loss but still eliminates for the missed pick that followed it", async () => {
      const membership = { ...MEMBERSHIP, buyBackAvailable: true, buyBackGrantedAt: new Date("2020-03-15T00:00:00Z") };
      const { tx, getMembershipUpdate } = makeTx({
        matchdays: MATCHDAYS_3,
        membership,
        picks: [LOSS_PICK], // nothing for md-2/md-3 — blocked from picking after md-1's loss
      });
      const service = new RecomputeService(makePrisma(tx));

      await service.recomputeLeague("league-1");

      expect(getMembershipUpdate()).toEqual({
        status: "ELIMINATED",
        eliminatedAtMatchdayId: "md-2",
        buyBackUsed: true,
        buyBackUsedAtMatchdayId: "md-1",
      });
    });
  });

  describe("member eligibility window", () => {
    // Distinct, clearly-in-the-past lockAt values (unlike MATCHDAYS, which
    // are in the future relative to "now" and so never actually "lock" —
    // that constant is only usable for tests that don't care about the
    // locked-with-no-pick elimination path).
    const PAST_MATCHDAYS: MatchdayRow[] = [
      { id: "md-1", sequence: 1, lockAt: new Date("2020-01-01T00:00:00Z") },
      { id: "md-2", sequence: 2, lockAt: new Date("2020-02-01T00:00:00Z") },
      { id: "md-3", sequence: 3, lockAt: new Date("2020-03-01T00:00:00Z") },
    ];

    it("does not eliminate a member for a matchday that locked before they joined", async () => {
      // Joined after md-1 locked but before md-2 locked; never picked either.
      // Only md-2 (the first matchday they were actually around for) should
      // count against them.
      const membership = { ...MEMBERSHIP, joinedAt: new Date("2020-01-15T00:00:00Z") };
      const { tx, getMembershipUpdate } = makeTx({ matchdays: PAST_MATCHDAYS, membership, picks: [] });
      const service = new RecomputeService(makePrisma(tx));

      await service.recomputeLeague("league-1");

      expect(getMembershipUpdate()).toEqual({
        status: "ELIMINATED",
        eliminatedAtMatchdayId: "md-2",
        buyBackUsed: false,
        buyBackUsedAtMatchdayId: null,
      });
    });

    it("leaves an unpaid member's state untouched in a paymentRequired league", async () => {
      const membership = { ...MEMBERSHIP, hasPaid: false, paidAt: null };
      const { tx, pickUpdates, getMembershipUpdate } = makeTx({
        matchdays: PAST_MATCHDAYS,
        membership,
        picks: [],
        paymentRequired: true,
      });
      const service = new RecomputeService(makePrisma(tx));

      await service.recomputeLeague("league-1");

      expect(pickUpdates).toEqual([]);
      expect(getMembershipUpdate()).toBeNull(); // skipped entirely -- never marked eliminated
    });

    it("only holds a paid member to matchdays that locked after they were marked paid", async () => {
      // Marked paid after md-1 locked but before md-2 locked, matching the
      // joinedAt-based test above but driven by paidAt instead.
      const membership = {
        ...MEMBERSHIP,
        hasPaid: true,
        paidAt: new Date("2020-01-15T00:00:00Z"),
      };
      const { tx, getMembershipUpdate } = makeTx({
        matchdays: PAST_MATCHDAYS,
        membership,
        picks: [],
        paymentRequired: true,
      });
      const service = new RecomputeService(makePrisma(tx));

      await service.recomputeLeague("league-1");

      expect(getMembershipUpdate()).toEqual({
        status: "ELIMINATED",
        eliminatedAtMatchdayId: "md-2",
        buyBackUsed: false,
        buyBackUsedAtMatchdayId: null,
      });
    });

    it("still evaluates a resolved pick that exists for a matchday before eligibleFrom", async () => {
      // Regression test: eligibleFrom must only excuse a MISSING pick, never
      // skip evaluating a pick that's actually on record — otherwise
      // re-confirming payment (which bumps paidAt to now, well after this
      // long-past matchday locked) would silently hide a real loss and leave
      // the member ACTIVE.
      const membership = {
        ...MEMBERSHIP,
        hasPaid: true,
        paidAt: new Date("2020-06-01T00:00:00Z"), // after every PAST_MATCHDAYS lockAt
      };
      const picks: PickRow[] = [
        {
          id: "pick-1",
          matchdayId: "md-1",
          teamId: AWAY,
          outcome: "PENDING",
          fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "HOME_WIN" },
        },
      ];
      const { tx, pickUpdates, getMembershipUpdate } = makeTx({
        matchdays: PAST_MATCHDAYS,
        membership,
        picks,
        paymentRequired: true,
      });
      const service = new RecomputeService(makePrisma(tx));

      await service.recomputeLeague("league-1");

      expect(pickUpdates).toEqual([{ pickId: "pick-1", outcome: "LOSS" }]);
      expect(getMembershipUpdate()).toEqual({
        status: "ELIMINATED",
        eliminatedAtMatchdayId: "md-1",
        buyBackUsed: false,
        buyBackUsedAtMatchdayId: null,
      });
    });
  });
});

describe("RecomputeService.countQualifyingEliminationEvents", () => {
  function makeCountPrisma(opts: {
    paymentRequired?: boolean;
    membership: { hasPaid?: boolean; paidAt?: Date | null; joinedAt?: Date };
    matchdays: MatchdayRow[];
    picks: PickRow[];
  }) {
    return {
      league: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ seasonId: "season-1", paymentRequired: opts.paymentRequired ?? false }),
      },
      leagueMembership: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          joinedAt: new Date("1970-01-01T00:00:00Z"),
          hasPaid: false,
          paidAt: null,
          ...opts.membership,
        }),
      },
      matchday: { findMany: jest.fn().mockResolvedValue(opts.matchdays) },
      pick: { findMany: jest.fn().mockResolvedValue(opts.picks) },
    } as unknown as PrismaService;
  }

  // Matchdays already locked (unlike MATCHDAYS above, which are in 2099 and
  // never actually "lock") — this method cares about "already happened,"
  // same as recomputeLeague's missing-pick branch.
  const LOCKED_MATCHDAYS: MatchdayRow[] = [
    { id: "md-1", sequence: 1, lockAt: new Date("2020-01-01T00:00:00Z") },
    { id: "md-2", sequence: 2, lockAt: new Date("2020-02-01T00:00:00Z") },
    { id: "md-3", sequence: 3, lockAt: new Date("2020-03-01T00:00:00Z") },
  ];

  it("counts zero for a member who's never lost or missed a pick", async () => {
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "WIN",
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "HOME_WIN" },
      },
    ];
    const prisma = makeCountPrisma({ membership: {}, matchdays: [LOCKED_MATCHDAYS[0]], picks });
    const service = new RecomputeService(prisma);

    await expect(service.countQualifyingEliminationEvents("league-1", "user-1")).resolves.toBe(0);
  });

  it("counts exactly one for a single loss with nothing after it", async () => {
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "LOSS",
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "AWAY_WIN" },
      },
      // nothing for md-2/md-3 — both locked, both count
    ];
    const prisma = makeCountPrisma({ membership: {}, matchdays: [LOCKED_MATCHDAYS[0]], picks });
    const service = new RecomputeService(prisma);

    await expect(service.countQualifyingEliminationEvents("league-1", "user-1")).resolves.toBe(1);
  });

  it("counts two for a loss followed by a missed pick on an already-locked matchday", async () => {
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "LOSS",
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "AWAY_WIN" },
      },
      // nothing for md-2 — already locked, blocked from picking after md-1
    ];
    const prisma = makeCountPrisma({
      membership: {},
      matchdays: [LOCKED_MATCHDAYS[0], LOCKED_MATCHDAYS[1]],
      picks,
    });
    const service = new RecomputeService(prisma);

    await expect(service.countQualifyingEliminationEvents("league-1", "user-1")).resolves.toBe(2);
  });

  it("does not count a matchday that hasn't locked yet", async () => {
    const futureMatchdays = [LOCKED_MATCHDAYS[0], { id: "md-future", sequence: 2, lockAt: new Date("2099-01-01T00:00:00Z") }];
    const picks: PickRow[] = [
      {
        id: "pick-1",
        matchdayId: "md-1",
        teamId: HOME,
        outcome: "LOSS",
        fixture: { id: "f1", homeTeamId: HOME, awayTeamId: AWAY, status: "FINISHED", result: "AWAY_WIN" },
      },
    ];
    const prisma = makeCountPrisma({ membership: {}, matchdays: futureMatchdays, picks });
    const service = new RecomputeService(prisma);

    await expect(service.countQualifyingEliminationEvents("league-1", "user-1")).resolves.toBe(1);
  });

  it("returns zero for an unpaid member in a paymentRequired league", async () => {
    const prisma = makeCountPrisma({
      paymentRequired: true,
      membership: { hasPaid: false, paidAt: null },
      matchdays: LOCKED_MATCHDAYS,
      picks: [],
    });
    const service = new RecomputeService(prisma);

    await expect(service.countQualifyingEliminationEvents("league-1", "user-1")).resolves.toBe(0);
  });

  it("does not count a matchday that locked before the member joined", async () => {
    const picks: PickRow[] = [];
    const prisma = makeCountPrisma({
      membership: { joinedAt: new Date("2020-01-15T00:00:00Z") }, // after md-1 locked, before md-2
      matchdays: [LOCKED_MATCHDAYS[0], LOCKED_MATCHDAYS[1]],
      picks,
    });
    const service = new RecomputeService(prisma);

    // Only md-2 counts — md-1 locked before they were even eligible to play.
    await expect(service.countQualifyingEliminationEvents("league-1", "user-1")).resolves.toBe(1);
  });
});
