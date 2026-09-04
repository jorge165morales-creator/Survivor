import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { MembershipStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "./push.service";

// How far ahead of lockAt a matchday enters the reminder window. Not a tight
// window matched to the cron cadence on purpose — reminderSentAt is the
// actual dedup guard, so this just needs to be "close enough to lock that a
// 1-hour warning is still true," not exact to the minute. A slower cron tick
// or a brief outage just means it fires a little later within the hour, not
// that it's missed entirely.
const REMINDER_LEAD_MS = 60 * 60 * 1000;

/**
 * Sends one generic "picks lock in ~1 hour" push per matchday to every
 * active member of every (non-archived) league on that matchday's season —
 * deliberately not personalized to whether each recipient has already
 * picked, which is what keeps this simple: one reminderSentAt flag per
 * matchday is enough dedup, no per-user tracking needed. The on-device
 * local reminder (apps/mobile/src/utils/notifications.ts) is the
 * pick-aware version of this same 1-hour warning.
 */
@Injectable()
export class PickReminderSchedulerService {
  private readonly logger = new Logger(PickReminderSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  @Cron("*/10 * * * *")
  async sendDueReminders(): Promise<void> {
    const now = Date.now();
    const dueMatchdays = await this.prisma.matchday.findMany({
      where: {
        reminderSentAt: null,
        lockAt: { gte: new Date(now), lte: new Date(now + REMINDER_LEAD_MS) },
      },
    });

    for (const matchday of dueMatchdays) {
      try {
        await this.sendForMatchday(matchday.id, matchday.seasonId, matchday.roundLabel);
      } catch (err) {
        this.logger.error(`Reminder failed for matchday ${matchday.id}`, err instanceof Error ? err.stack : err);
      }
    }
  }

  private async sendForMatchday(matchdayId: string, seasonId: string, roundLabel: string): Promise<void> {
    const leagues = await this.prisma.league.findMany({
      where: { seasonId, archivedAt: null },
      select: { id: true },
    });

    if (leagues.length > 0) {
      const memberships = await this.prisma.leagueMembership.findMany({
        where: { leagueId: { in: leagues.map((l) => l.id) }, status: MembershipStatus.ACTIVE },
        select: { userId: true },
        distinct: ["userId"],
      });
      const tokens = await this.prisma.pushToken.findMany({
        where: { userId: { in: memberships.map((m) => m.userId) } },
        select: { token: true },
      });
      await this.push.sendToTokens(
        tokens.map((t) => t.token),
        "Survivor",
        `${roundLabel} locks in 1 hour — make sure your pick is right!`,
      );
      this.logger.log(`Sent matchday ${matchdayId} reminder to ${tokens.length} device(s)`);
    }

    // Marked even when there was nothing to send (no leagues yet, or no
    // registered tokens) — this is a one-shot-per-matchday flag, not a
    // "retry until it lands" one.
    await this.prisma.matchday.update({ where: { id: matchdayId }, data: { reminderSentAt: new Date() } });
  }
}
