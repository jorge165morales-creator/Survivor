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

const SEASON = { id: "season-1", name: "UEFA Champions League 2026/27", year: 2026 };

describe("LeaguesService", () => {
  let prisma: MockPrisma;
  let service: LeaguesService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new LeaguesService(prisma as unknown as PrismaService);
  });

  describe("create", () => {
    it("rejects an unknown seasonId", async () => {
      prisma.season.findUnique.mockResolvedValue(null);
      await expect(service.create("user-1", "My League", "missing-season")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("creates the league and auto-joins the commissioner as ACTIVE", async () => {
      prisma.season.findUnique.mockResolvedValue(SEASON);
      prisma.league.create.mockResolvedValue({
        id: "league-1",
        name: "My League",
        inviteCode: "abc123",
        maxMembers: 20,
        commissionerId: "user-1",
        season: SEASON,
        _count: { memberships: 1 },
      });

      const result = await service.create("user-1", "My League", SEASON.id);

      expect(prisma.league.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "My League",
            seasonId: SEASON.id,
            commissionerId: "user-1",
            memberships: { create: { userId: "user-1", status: MembershipStatus.ACTIVE } },
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
        data: { status: MembershipStatus.ACTIVE, tieForgivenessUsed: false, eliminatedAtMatchdayId: null },
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
});
