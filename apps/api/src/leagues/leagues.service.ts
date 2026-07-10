import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MembershipStatus } from "@prisma/client";
import type {
  InviteLinkResponse,
  LeagueDetail,
  LeagueSummary,
} from "@survivor/shared-types";
import { PrismaService } from "../prisma/prisma.service";

const ACTIVE_MEMBER_FILTER = { status: { not: MembershipStatus.LEFT } };

@Injectable()
export class LeaguesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, name: string, seasonId: string): Promise<LeagueSummary> {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) {
      throw new NotFoundException("Season not found");
    }

    const league = await this.prisma.league.create({
      data: {
        name,
        seasonId,
        commissionerId: userId,
        memberships: { create: { userId, status: MembershipStatus.ACTIVE } },
      },
      include: { season: true, _count: { select: { memberships: { where: ACTIVE_MEMBER_FILTER } } } },
    });

    return this.toSummary(league, MembershipStatus.ACTIVE);
  }

  async listMine(userId: string): Promise<LeagueSummary[]> {
    const memberships = await this.prisma.leagueMembership.findMany({
      where: { userId, ...ACTIVE_MEMBER_FILTER },
      include: {
        league: {
          include: { season: true, _count: { select: { memberships: { where: ACTIVE_MEMBER_FILTER } } } },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    return memberships.map((m) => this.toSummary(m.league, m.status));
  }

  async getById(leagueId: string, userId: string): Promise<LeagueDetail> {
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        season: true,
        memberships: {
          where: ACTIVE_MEMBER_FILTER,
          include: { user: true },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
    if (!league) {
      throw new NotFoundException("League not found");
    }
    const isMember = league.memberships.some((m) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException("You are not a member of this league");
    }

    return {
      id: league.id,
      name: league.name,
      inviteCode: league.inviteCode,
      maxMembers: league.maxMembers,
      createdAt: league.createdAt.toISOString(),
      season: { id: league.season.id, name: league.season.name, year: league.season.year },
      commissionerId: league.commissionerId,
      members: league.memberships.map((m) => ({
        userId: m.userId,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        status: m.status,
        isCommissioner: m.userId === league.commissionerId,
        joinedAt: m.joinedAt.toISOString(),
      })),
    };
  }

  async joinByInviteCode(userId: string, inviteCode: string): Promise<LeagueSummary> {
    const league = await this.prisma.league.findUnique({
      where: { inviteCode },
      include: { memberships: true },
    });
    if (!league) {
      throw new NotFoundException("Invalid invite code");
    }

    const existing = league.memberships.find((m) => m.userId === userId);
    if (existing && existing.status !== MembershipStatus.LEFT) {
      throw new ConflictException("You are already a member of this league");
    }

    const activeCount = league.memberships.filter((m) => m.status !== MembershipStatus.LEFT).length;
    if (activeCount >= league.maxMembers) {
      throw new ForbiddenException("This league is full");
    }

    if (existing) {
      await this.prisma.leagueMembership.update({
        where: { id: existing.id },
        data: { status: MembershipStatus.ACTIVE, tieForgivenessUsed: false, eliminatedAtMatchdayId: null },
      });
    } else {
      await this.prisma.leagueMembership.create({
        data: { leagueId: league.id, userId, status: MembershipStatus.ACTIVE },
      });
    }

    return this.getSummaryFor(league.id, userId);
  }

  async leave(leagueId: string, userId: string): Promise<void> {
    const league = await this.prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      throw new NotFoundException("League not found");
    }
    if (league.commissionerId === userId) {
      throw new ForbiddenException(
        "Commissioners cannot leave their own league. Transfer or delete it instead.",
      );
    }

    const membership = await this.prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });
    if (!membership || membership.status === MembershipStatus.LEFT) {
      throw new NotFoundException("You are not a member of this league");
    }

    await this.prisma.leagueMembership.update({
      where: { id: membership.id },
      data: { status: MembershipStatus.LEFT },
    });
  }

  async getInviteLink(leagueId: string, userId: string): Promise<InviteLinkResponse> {
    const membership = await this.prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });
    if (!membership || membership.status === MembershipStatus.LEFT) {
      throw new ForbiddenException("You are not a member of this league");
    }
    const league = await this.prisma.league.findUniqueOrThrow({ where: { id: leagueId } });

    return {
      inviteCode: league.inviteCode,
      url: `survivor://leagues/join?code=${league.inviteCode}`,
    };
  }

  async update(
    leagueId: string,
    userId: string,
    data: { name?: string; maxMembers?: number },
  ): Promise<LeagueSummary> {
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      include: { memberships: true },
    });
    if (!league) {
      throw new NotFoundException("League not found");
    }
    if (league.commissionerId !== userId) {
      throw new ForbiddenException("Only the commissioner can update this league");
    }
    if (data.maxMembers !== undefined) {
      const activeCount = league.memberships.filter((m) => m.status !== MembershipStatus.LEFT).length;
      if (data.maxMembers < activeCount) {
        throw new BadRequestException(
          `maxMembers cannot be lower than the current member count (${activeCount})`,
        );
      }
    }

    await this.prisma.league.update({ where: { id: leagueId }, data });
    return this.getSummaryFor(leagueId, userId);
  }

  private async getSummaryFor(leagueId: string, userId: string): Promise<LeagueSummary> {
    const league = await this.prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      include: { season: true, _count: { select: { memberships: { where: ACTIVE_MEMBER_FILTER } } } },
    });
    const membership = await this.prisma.leagueMembership.findUniqueOrThrow({
      where: { leagueId_userId: { leagueId, userId } },
    });
    return this.toSummary(league, membership.status);
  }

  private toSummary(
    league: {
      id: string;
      name: string;
      inviteCode: string;
      maxMembers: number;
      commissionerId: string;
      season: { id: string; name: string; year: number };
      _count: { memberships: number };
    },
    myStatus: MembershipStatus,
  ): LeagueSummary {
    return {
      id: league.id,
      name: league.name,
      inviteCode: league.inviteCode,
      maxMembers: league.maxMembers,
      memberCount: league._count.memberships,
      commissionerId: league.commissionerId,
      season: { id: league.season.id, name: league.season.name, year: league.season.year },
      myStatus,
    };
  }
}
