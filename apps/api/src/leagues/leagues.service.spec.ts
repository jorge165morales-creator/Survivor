import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { MembershipStatus } from "@prisma/client";
import { LeaguesService } from "./leagues.service";
import { PrismaService } from "../prisma/prisma.service";

type MockPrisma = {
  season: { findUnique: jest.Mock };
  league: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
  };
  leagueMembership: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

function makePrisma(): MockPrisma {
  return {
    season: { findUnique: jest.fn() },
    league: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    leagueMembership: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeRecompute() {
  return { recomputeLeague: jest.fn().mockResolvedValue(undefined) };
}

const SEASON = { id: "season-1", name: "UEFA Champions League 2026/27", year: 2026 };

describe("LeaguesService", () => {
  let prisma: MockPrisma;
  let recompute: ReturnType<typeof makeRecompute>;
  let service: LeaguesService;

  beforeEach(() => {
    prisma = makePrisma();
    recompute = makeRecompute();
    service = new LeaguesService(prisma as unknown as PrismaService, recompute as never);
  });

  describe("create", () => {
    it("rejects an unknown seasonId", async () => {
      prisma.season.findUnique.mockResolvedValue(null);
      await expect(
        service.create("user-1", "My League", "missing-season", false, false),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates the league and auto-joins the commissioner as ACTIVE and already paid", async () => {
      prisma.season.findUnique.mockResolvedValue(SEASON);
      prisma.league.create.mockResolvedValue({
        id: "league-1",
        name: "My League",
        inviteCode: "abc123",
        maxMembers: 20,
        commissionerId: "user-1",
        buyBackEnabled: false,
        paymentRequired: true,
        season: SEASON,
        _count: { memberships: 1 },
      });

      const result = await service.create("user-1", "My League", SEASON.id, false, true);

      expect(prisma.league.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "My League",
            seasonId: SEASON.id,
            commissionerId: "user-1",
            buyBackEnabled: false,
            paymentRequired: true,
            memberships: {
              create: {
                userId: "user-1",
                status: MembershipStatus.ACTIVE,
                hasPaid: true,
                paidAt: expect.any(Date),
              },
            },
          }),
        }),
      );
      expect(result.myStatus).toBe(MembershipStatus.ACTIVE);
      expect(result.memberCount).toBe(1);
    });
  });

  describe("joinByInviteCode", () => {
    const league = {
      id: "league-1",
      name: "My League",
      inviteCode: "abc123",
      maxMembers: 2,
      commissionerId: "commish",
      memberships: [{ id: "m1", userId: "commish", status: MembershipStatus.ACTIVE }],
    };

    it("rejects an unknown invite code", async () => {
      prisma.league.findUnique.mockResolvedValue(null);
      await expect(service.joinByInviteCode("user-2", "nope")).rejects.toThrow(NotFoundException);
    });

    it("rejects joining a league you're already an active member of", async () => {
      prisma.league.findUnique.mockResolvedValue({
        ...league,
        memberships: [...league.memberships, { id: "m2", userId: "user-2", status: MembershipStatus.ACTIVE }],
      });
      await expect(service.joinByInviteCode("user-2", "abc123")).rejects.toThrow(ConflictException);
    });

    it("rejects joining once maxMembers is reached", async () => {
      prisma.league.findUnique.mockResolvedValue({
        ...league,
        memberships: [
          { id: "m1", userId: "commish", status: MembershipStatus.ACTIVE },
          { id: "m2", userId: "someone-else", status: MembershipStatus.ACTIVE },
        ],
      });
      await expect(service.joinByInviteCode("user-3", "abc123")).rejects.toThrow(ForbiddenException);
    });

    it("re-activates a membership that previously left", async () => {
      prisma.league.findUnique.mockResolvedValue({
        ...league,
        memberships: [...league.memberships, { id: "m2", userId: "user-2", status: MembershipStatus.LEFT }],
      });
      prisma.league.findUniqueOrThrow.mockResolvedValue({
        ...league,
        season: SEASON,
        _count: { memberships: 2 },
      });
      prisma.leagueMembership.findUniqueOrThrow.mockResolvedValue({
        id: "m2",
        userId: "user-2",
        status: MembershipStatus.ACTIVE,
      });

      await service.joinByInviteCode("user-2", "abc123");

      expect(prisma.leagueMembership.update).toHaveBeenCalledWith({
        where: { id: "m2" },
        data: {
          status: MembershipStatus.ACTIVE,
          buyBackAvailable: false,
          buyBackUsed: false,
          eliminatedAtMatchdayId: null,
          hasPaid: false,
          paidAt: null,
        },
      });
      expect(prisma.leagueMembership.create).not.toHaveBeenCalled();
    });

    it("creates a new membership for a first-time joiner", async () => {
      prisma.league.findUnique.mockResolvedValue(league);
      prisma.league.findUniqueOrThrow.mockResolvedValue({
        ...league,
        season: SEASON,
        _count: { memberships: 2 },
      });
      prisma.leagueMembership.findUniqueOrThrow.mockResolvedValue({
        id: "m2",
        userId: "user-2",
        status: MembershipStatus.ACTIVE,
      });

      await service.joinByInviteCode("user-2", "abc123");

      expect(prisma.leagueMembership.create).toHaveBeenCalledWith({
        data: { leagueId: "league-1", userId: "user-2", status: MembershipStatus.ACTIVE },
      });
    });
  });

  describe("leave", () => {
    it("blocks the commissioner from leaving", async () => {
      prisma.league.findUnique.mockResolvedValue({ id: "league-1", commissionerId: "user-1" });
      await expect(service.leave("league-1", "user-1")).rejects.toThrow(ForbiddenException);
    });

    it("rejects a non-member", async () => {
      prisma.league.findUnique.mockResolvedValue({ id: "league-1", commissionerId: "commish" });
      prisma.leagueMembership.findUnique.mockResolvedValue(null);
      await expect(service.leave("league-1", "user-2")).rejects.toThrow(NotFoundException);
    });

    it("marks an active member as LEFT", async () => {
      prisma.league.findUnique.mockResolvedValue({ id: "league-1", commissionerId: "commish" });
      prisma.leagueMembership.findUnique.mockResolvedValue({
        id: "m2",
        userId: "user-2",
        status: MembershipStatus.ACTIVE,
      });

      await service.leave("league-1", "user-2");

      expect(prisma.leagueMembership.update).toHaveBeenCalledWith({
        where: { id: "m2" },
        data: { status: MembershipStatus.LEFT },
      });
    });
  });

  describe("update", () => {
    const league = {
      id: "league-1",
      commissionerId: "commish",
      memberships: [
        { userId: "commish", status: MembershipStatus.ACTIVE },
        { userId: "user-2", status: MembershipStatus.ACTIVE },
      ],
    };

    it("rejects a non-commissioner", async () => {
      prisma.league.findUnique.mockResolvedValue(league);
      await expect(service.update("league-1", "user-2", { name: "New Name" })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("rejects lowering maxMembers below the current member count", async () => {
      prisma.league.findUnique.mockResolvedValue(league);
      await expect(service.update("league-1", "commish", { maxMembers: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("grantBuyBack", () => {
    const league = { id: "league-1", commissionerId: "commish", buyBackEnabled: true };

    it("rejects a non-commissioner", async () => {
      prisma.league.findUnique.mockResolvedValue(league);
      await expect(service.grantBuyBack("league-1", "user-2", "user-3")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("rejects when the league has buy-back disabled", async () => {
      prisma.league.findUnique.mockResolvedValue({ ...league, buyBackEnabled: false });
      await expect(service.grantBuyBack("league-1", "commish", "user-2")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects when the target member isn't eliminated", async () => {
      prisma.league.findUnique.mockResolvedValue(league);
      prisma.leagueMembership.findUnique.mockResolvedValue({
        id: "m2",
        status: MembershipStatus.ACTIVE,
        buyBackUsed: false,
      });
      await expect(service.grantBuyBack("league-1", "commish", "user-2")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects when the member has already used their buy-back this season", async () => {
      prisma.league.findUnique.mockResolvedValue(league);
      prisma.leagueMembership.findUnique.mockResolvedValue({
        id: "m2",
        status: MembershipStatus.ELIMINATED,
        buyBackUsed: true,
      });
      await expect(service.grantBuyBack("league-1", "commish", "user-2")).rejects.toThrow(
        ConflictException,
      );
    });

    it("grants the buy-back and triggers a recompute", async () => {
      prisma.league.findUnique.mockResolvedValue(league);
      prisma.leagueMembership.findUnique.mockResolvedValue({
        id: "m2",
        status: MembershipStatus.ELIMINATED,
        buyBackAvailable: false,
        buyBackUsed: false,
      });
      prisma.league.findUniqueOrThrow.mockResolvedValue({
        ...league,
        season: SEASON,
        _count: { memberships: 2 },
      });
      prisma.leagueMembership.findUniqueOrThrow.mockResolvedValue({
        id: "m1",
        userId: "commish",
        status: MembershipStatus.ACTIVE,
      });

      await service.grantBuyBack("league-1", "commish", "user-2");

      expect(prisma.leagueMembership.update).toHaveBeenCalledWith({
        where: { id: "m2" },
        data: { buyBackAvailable: true },
      });
      expect(recompute.recomputeLeague).toHaveBeenCalledWith("league-1");
    });
  });

  describe("markMemberPaid", () => {
    const league = { id: "league-1", commissionerId: "commish", paymentRequired: true };

    it("rejects a non-commissioner", async () => {
      prisma.league.findUnique.mockResolvedValue(league);
      await expect(service.markMemberPaid("league-1", "user-2", "user-3", true)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("rejects an unknown league", async () => {
      prisma.league.findUnique.mockResolvedValue(null);
      await expect(service.markMemberPaid("league-1", "commish", "user-2", true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects a target who isn't a member of this league", async () => {
      prisma.league.findUnique.mockResolvedValue(league);
      prisma.leagueMembership.findUnique.mockResolvedValue(null);
      await expect(service.markMemberPaid("league-1", "commish", "user-2", true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("marks a member paid, sets paidAt, and triggers a recompute", async () => {
      prisma.league.findUnique.mockResolvedValue(league);
      prisma.leagueMembership.findUnique.mockResolvedValue({
        id: "m2",
        status: MembershipStatus.ACTIVE,
        hasPaid: false,
      });
      prisma.league.findUniqueOrThrow.mockResolvedValue({
        ...league,
        buyBackEnabled: false,
        season: SEASON,
        _count: { memberships: 2 },
      });
      prisma.leagueMembership.findUniqueOrThrow.mockResolvedValue({
        id: "m1",
        userId: "commish",
        status: MembershipStatus.ACTIVE,
      });

      await service.markMemberPaid("league-1", "commish", "user-2", true);

      expect(prisma.leagueMembership.update).toHaveBeenCalledWith({
        where: { id: "m2" },
        data: { hasPaid: true, paidAt: expect.any(Date) },
      });
      expect(recompute.recomputeLeague).toHaveBeenCalledWith("league-1");
    });

    it("preserves paidAt when marking a member unpaid again", async () => {
      const originalPaidAt = new Date("2026-07-16T00:00:00.000Z");
      prisma.league.findUnique.mockResolvedValue(league);
      prisma.leagueMembership.findUnique.mockResolvedValue({
        id: "m2",
        status: MembershipStatus.ACTIVE,
        hasPaid: true,
        paidAt: originalPaidAt,
      });
      prisma.league.findUniqueOrThrow.mockResolvedValue({
        ...league,
        buyBackEnabled: false,
        season: SEASON,
        _count: { memberships: 2 },
      });
      prisma.leagueMembership.findUniqueOrThrow.mockResolvedValue({
        id: "m1",
        userId: "commish",
        status: MembershipStatus.ACTIVE,
      });

      await service.markMemberPaid("league-1", "commish", "user-2", false);

      expect(prisma.leagueMembership.update).toHaveBeenCalledWith({
        where: { id: "m2" },
        data: { hasPaid: false, paidAt: originalPaidAt },
      });
    });

    it("does not bump paidAt forward when re-confirming a member already marked paid", async () => {
      // Regression test: re-stamping paidAt on every true-call would make
      // recompute treat matchdays that already locked (and were already
      // played) as ones this member wasn't eligible for yet, silently
      // reverting a real elimination back to ACTIVE.
      const originalPaidAt = new Date("2026-07-16T00:00:00.000Z");
      prisma.league.findUnique.mockResolvedValue(league);
      prisma.leagueMembership.findUnique.mockResolvedValue({
        id: "m2",
        status: MembershipStatus.ACTIVE,
        hasPaid: true,
        paidAt: originalPaidAt,
      });
      prisma.league.findUniqueOrThrow.mockResolvedValue({
        ...league,
        buyBackEnabled: false,
        season: SEASON,
        _count: { memberships: 2 },
      });
      prisma.leagueMembership.findUniqueOrThrow.mockResolvedValue({
        id: "m1",
        userId: "commish",
        status: MembershipStatus.ACTIVE,
      });

      await service.markMemberPaid("league-1", "commish", "user-2", true);

      expect(prisma.leagueMembership.update).toHaveBeenCalledWith({
        where: { id: "m2" },
        data: { hasPaid: true, paidAt: originalPaidAt },
      });
    });
  });
});
