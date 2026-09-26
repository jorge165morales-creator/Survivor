import type { PrismaClient } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

// The only competition this app has ever run. Both prisma/seed.ts (outside
// the Nest app, no DI) and practice-season.service.ts need to guarantee it
// exists before creating a Season, so this is a plain function taking
// whichever Prisma client either context already has, not an injectable
// service — see [[Competition]] in schema.prisma for what each field means.
export async function ensureUclCompetition(
  prisma: PrismaClient | PrismaService,
): Promise<{ id: string }> {
  return prisma.competition.upsert({
    where: { slug: "ucl" },
    update: {},
    create: {
      name: "UEFA Champions League",
      slug: "ucl",
      structure: "GROUP_AND_KNOCKOUT",
      matchdayCount: 17,
      highlightlyLeagueId: "2486",
      apiFootballLeagueId: "2",
    },
    select: { id: true },
  });
}
