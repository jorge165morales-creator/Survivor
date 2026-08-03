import { PrismaService } from "../prisma/prisma.service";

function shortNameFor(name: string): string {
  return name.length <= 12 ? name : name.split(" ")[0];
}

/**
 * Ensures a Team row exists with this provider externalId, in this order:
 * 1. Already correctly linked (the common case on every sync after the
 *    first).
 * 2. One of our pre-seeded placeholder rows for this season, matched by
 *    name — backfilled with the real externalId/crest so existing Picks
 *    and UsedTeam rows that reference its id keep working untouched.
 * 3. A club we didn't have seeded at all — created fresh.
 *
 * Shared by season-sync.service.ts (the real active season) and
 * practice-season.service.ts (the replayed practice season) — identical
 * resolution logic against two different providers.
 */
export async function resolveTeam(
  prisma: PrismaService,
  seasonId: string,
  externalId: string,
  name: string,
  crestUrl: string | null,
): Promise<string> {
  const byExternalId = await prisma.team.findUnique({ where: { externalId } });
  if (byExternalId) return byExternalId.id;

  const byName = await prisma.team.findFirst({
    where: { name, seasons: { some: { id: seasonId } } },
  });
  if (byName) {
    const updated = await prisma.team.update({
      where: { id: byName.id },
      data: { externalId, crestUrl: crestUrl ?? byName.crestUrl },
    });
    return updated.id;
  }

  const created = await prisma.team.create({
    data: {
      name,
      shortName: shortNameFor(name),
      externalId,
      crestUrl,
      seasons: { connect: { id: seasonId } },
    },
  });
  return created.id;
}
