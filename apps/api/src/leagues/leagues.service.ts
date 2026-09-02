import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MembershipStatus, Prisma } from "@prisma/client";
import type {
  InviteLinkResponse,
  LeagueDetail,
  LeagueSummary,
} from "@survivor/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { RecomputeService } from "../game-engine/recompute.service";
import { generateInviteCode } from "./invite-code";

const ACTIVE_MEMBER_FILTER = { status: { not: MembershipStatus.LEFT } };

@Injectable()
export class LeaguesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recompute: RecomputeService,
  ) {}

  async create(
    userId: string,
    name: string,
    seasonId: string,
    buyBackEnabled: boolean,
    paymentRequired: boolean,
  ): Promise<LeagueSummary> {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) {
      throw new NotFoundException("Season not found");
    }

    // Retries with a fresh code on the (very unlikely, ~1-in-a-billion)
    // chance generateInviteCode() collides with an existing league's code —
    // see invite-code.ts for why this isn't collision-proof by construction
    // the way the old cuid()-based default was.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const league = await this.prisma.league.create({
          data: {
            name,
            seasonId,
            buyBackEnabled,
            paymentRequired,
            commissionerId: userId,
            inviteCode: generateInviteCode(),
            // The commissioner is exempt from their own payment gate — a
            // paymentRequired league only makes sense for the members they invite.
            memberships: {
              create: { userId, status: MembershipStatus.ACTIVE, hasPaid: true, paidAt: new Date() },
            },
          },
          include: { season: true, _count: { select: { memberships: { where: ACTIVE_MEMBER_FILTER } } } },
        });

        return this.toSummary(league, MembershipStatus.ACTIVE);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          continue;
        }
        throw err;
      }
    }
    throw new Error("Failed to generate a unique invite code");
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
      season: {
        id: league.season.id,
        name: league.season.name,
        year: league.season.year,
        isActive: league.season.isActive,
      },
      commissionerId: league.commissionerId,
      buyBackEnabled: league.buyBackEnabled,
      paymentRequired: league.paymentRequired,
      members: league.memberships.map((m) => ({
        userId: m.userId,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        status: m.status,
        isCommissioner: m.userId === league.commissionerId,
        joinedAt: m.joinedAt.toISOString(),
        hasPaid: m.hasPaid,
      })),
    };
  }

  async joinByInviteCode(userId: string, inviteCode: string): Promise<LeagueSummary> {
    // Codes are generated uppercase (invite-code.ts) — normalizing here means
    // it doesn't matter whether a user typed it in lowercase or their
    // keyboard auto-capitalized differently than expected.
    const league = await this.prisma.league.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
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
        data: {
          status: MembershipStatus.ACTIVE,
          buyBackAvailable: false,
          buyBackUsed: false,
          eliminatedAtMatchdayId: null,
          hasPaid: false,
          paidAt: null,
        },
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
    data: { name?: string; maxMembers?: number; buyBackEnabled?: boolean; paymentRequired?: boolean },
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

  /**
   * Commissioner-only: grants an eliminated member a one-time buy-back this
   * season. No payment happens in-app — any money changes hands between the
   * commissioner and the member outside the app; this just flips the flag
   * and lets the next recompute reinstate them (see recompute.service.ts's
   * buyBackAvailable/buyBackUsed handling).
   */
  async grantBuyBack(leagueId: string, commissionerUserId: string, targetUserId: string): Promise<LeagueSummary> {
    const league = await this.prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      throw new NotFoundException("League not found");
    }
    if (league.commissionerId !== commissionerUserId) {
      throw new ForbiddenException("Only the commissioner can grant a buy-back");
    }
    if (!league.buyBackEnabled) {
      throw new BadRequestException("Buy-back is not enabled for this league");
    }

    const membership = await this.prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: targetUserId } },
    });
    if (!membership || membership.status !== MembershipStatus.ELIMINATED) {
      throw new BadRequestException("Only an eliminated member can be granted a buy-back");
    }
    if (membership.buyBackUsed) {
      throw new ConflictException("This member has already used their buy-back this season");
    }

    if (!membership.buyBackAvailable) {
      await this.prisma.leagueMembership.update({
        where: { id: membership.id },
        data: { buyBackAvailable: true },
      });
    }
    await this.recompute.recomputeLeague(leagueId);

    return this.getSummaryFor(leagueId, commissionerUserId);
  }

  /**
   * Commissioner-only: for a paymentRequired league, a member can join and
   * browse but doesn't actually enter the competition (isn't subject to the
   * game engine, doesn't show up in standings) until this flips them paid.
   * Payment itself happens outside the app. Toggling back to false is
   * supported (e.g. correcting a mistake) but doesn't retroactively undo any
   * state a recompute already wrote while they were marked paid.
   *
   * paidAt is stamped only on the FIRST false-to-true transition, then left
   * alone — including across a false/true/false/true round trip. Re-stamping
   * it on every call would silently discard real history: recompute treats
   * any matchday that locked before paidAt as one this member was never
   * eligible for, so bumping paidAt forward past matchdays they already
   * played (and possibly lost) would revert them to ACTIVE regardless of
   * what they actually picked.
   */
  async markMemberPaid(
    leagueId: string,
    commissionerUserId: string,
    targetUserId: string,
    hasPaid: boolean,
  ): Promise<LeagueSummary> {
    const league = await this.prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      throw new NotFoundException("League not found");
    }
    if (league.commissionerId !== commissionerUserId) {
      throw new ForbiddenException("Only the commissioner can mark a member as paid");
    }

    const membership = await this.prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: targetUserId } },
    });
    if (!membership || membership.status === MembershipStatus.LEFT) {
      throw new NotFoundException("This user is not a member of this league");
    }

    await this.prisma.leagueMembership.update({
      where: { id: membership.id },
      data: { hasPaid, paidAt: hasPaid ? (membership.paidAt ?? new Date()) : membership.paidAt },
    });
    await this.recompute.recomputeLeague(leagueId);

    return this.getSummaryFor(leagueId, commissionerUserId);
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
      buyBackEnabled: boolean;
      paymentRequired: boolean;
      season: { id: string; name: string; year: number; isActive: boolean };
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
      buyBackEnabled: league.buyBackEnabled,
      paymentRequired: league.paymentRequired,
      season: {
        id: league.season.id,
        name: league.season.name,
        year: league.season.year,
        isActive: league.season.isActive,
      },
      myStatus,
    };
  }
}
