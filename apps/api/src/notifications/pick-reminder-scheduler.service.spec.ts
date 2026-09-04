import { MembershipStatus } from "@prisma/client";
import { PickReminderSchedulerService } from "./pick-reminder-scheduler.service";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "./push.service";

function makePrisma(overrides: {
  dueMatchdays?: Array<{ id: string; seasonId: string; roundLabel: string }>;
  leagues?: Array<{ id: string }>;
  memberships?: Array<{ userId: string }>;
  tokens?: Array<{ token: string }>;
}) {
  return {
    matchday: {
      findMany: jest.fn().mockResolvedValue(overrides.dueMatchdays ?? []),
      update: jest.fn(),
    },
    league: {
      findMany: jest.fn().mockResolvedValue(overrides.leagues ?? []),
    },
    leagueMembership: {
      findMany: jest.fn().mockResolvedValue(overrides.memberships ?? []),
    },
    pushToken: {
      findMany: jest.fn().mockResolvedValue(overrides.tokens ?? []),
    },
  } as unknown as PrismaService;
}

function makePush() {
  return { sendToTokens: jest.fn() } as unknown as PushService;
}

describe("PickReminderSchedulerService", () => {
  it("does nothing when no matchday is due", async () => {
    const prisma = makePrisma({});
    const push = makePush();
    const scheduler = new PickReminderSchedulerService(prisma, push);

    await scheduler.sendDueReminders();

    expect(push.sendToTokens).not.toHaveBeenCalled();
  });

  it("sends one generic reminder to every active member across the season's leagues", async () => {
    const prisma = makePrisma({
      dueMatchdays: [{ id: "md-1", seasonId: "season-1", roundLabel: "League Phase Matchday 1" }],
      leagues: [{ id: "league-1" }, { id: "league-2" }],
      memberships: [{ userId: "user-1" }, { userId: "user-2" }],
      tokens: [{ token: "token-1" }, { token: "token-2" }],
    });
    const push = makePush();
    const scheduler = new PickReminderSchedulerService(prisma, push);

    await scheduler.sendDueReminders();

    expect(prisma.league.findMany).toHaveBeenCalledWith({
      where: { seasonId: "season-1", archivedAt: null },
      select: { id: true },
    });
    expect(prisma.leagueMembership.findMany).toHaveBeenCalledWith({
      where: { leagueId: { in: ["league-1", "league-2"] }, status: MembershipStatus.ACTIVE },
      select: { userId: true },
      distinct: ["userId"],
    });
    expect(push.sendToTokens).toHaveBeenCalledWith(
      ["token-1", "token-2"],
      "Survivor",
      "League Phase Matchday 1 locks in 1 hour — make sure your pick is right!",
    );
    expect(prisma.matchday.update).toHaveBeenCalledWith({
      where: { id: "md-1" },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it("still marks reminderSentAt when the season has no leagues yet", async () => {
    const prisma = makePrisma({
      dueMatchdays: [{ id: "md-1", seasonId: "season-1", roundLabel: "League Phase Matchday 1" }],
      leagues: [],
    });
    const push = makePush();
    const scheduler = new PickReminderSchedulerService(prisma, push);

    await scheduler.sendDueReminders();

    expect(push.sendToTokens).not.toHaveBeenCalled();
    expect(prisma.matchday.update).toHaveBeenCalledWith({
      where: { id: "md-1" },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it("keeps going for other due matchdays if one fails", async () => {
    const prisma = makePrisma({
      dueMatchdays: [
        { id: "md-1", seasonId: "season-1", roundLabel: "Matchday 1" },
        { id: "md-2", seasonId: "season-2", roundLabel: "Matchday 2" },
      ],
    });
    (prisma.league.findMany as jest.Mock).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce([]);
    const push = makePush();
    const scheduler = new PickReminderSchedulerService(prisma, push);

    await scheduler.sendDueReminders();

    expect(prisma.matchday.update).toHaveBeenCalledTimes(1);
    expect(prisma.matchday.update).toHaveBeenCalledWith({
      where: { id: "md-2" },
      data: { reminderSentAt: expect.any(Date) },
    });
  });
});
