import type { CompetitionStructure, PrismaClient } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

interface CompetitionDefinition {
  slug: string;
  name: string;
  structure: CompetitionStructure;
  // Total matchdays a season of this competition produces — see
  // [[Competition]] in schema.prisma.
  matchdayCount: number;
  highlightlyLeagueId?: string;
  apiFootballLeagueId?: string;
}

// Every competition the pool can be played against. Adding a new one here
// (plus calling ensureCompetition with its slug) is enough to make it
// selectable — see competition-provisioning.service.ts for actually
// creating a Season against one. IDs below are provider-specific and were
// confirmed live, not guessed — see the comment on each.
const COMPETITIONS: Record<string, CompetitionDefinition> = {
  ucl: {
    slug: "ucl",
    name: "UEFA Champions League",
    structure: "GROUP_AND_KNOCKOUT",
    matchdayCount: 17,
    highlightlyLeagueId: "2486",
    apiFootballLeagueId: "2",
  },
  "la-liga": {
    slug: "la-liga",
    name: "La Liga",
    structure: "ROUND_ROBIN",
    matchdayCount: 38,
    // Confirmed live against Highlightly (2026-09-26): Spain's La Liga —
    // Highlightly also has several other leagues named "Primera División"
    // (Costa Rica, Chile, Uruguay, Peru, Venezuela, Guatemala, Bolivia, El
    // Salvador, Nicaragua) plus Spain's own women's league, so the numeric id
    // (not the name) is what disambiguates.
    highlightlyLeagueId: "119924",
  },
  "premier-league": {
    slug: "premier-league",
    name: "Premier League",
    structure: "ROUND_ROBIN",
    matchdayCount: 38,
    // Confirmed live against Highlightly (2026-09-26): England's Premier
    // League — Highlightly also has leagues literally named "Premier League"
    // for Wales and Belarus.
    highlightlyLeagueId: "33973",
  },
};

/**
 * Idempotently ensures a known competition's row exists (creating it on
 * first call, no-op after), and returns its id. Both prisma/seed.ts
 * (outside the Nest app, no DI) and practice-season.service.ts /
 * competition-provisioning.service.ts need this guarantee before creating a
 * Season, so this is a plain function taking whichever Prisma client either
 * context already has, not an injectable service.
 */
export async function ensureCompetition(prisma: PrismaClient | PrismaService, slug: string): Promise<{ id: string }> {
  const definition = COMPETITIONS[slug];
  if (!definition) {
    throw new Error(`Unknown competition slug "${slug}" — add it to COMPETITIONS in competitions.ts first.`);
  }
  return prisma.competition.upsert({
    where: { slug: definition.slug },
    update: {},
    create: {
      name: definition.name,
      slug: definition.slug,
      structure: definition.structure,
      matchdayCount: definition.matchdayCount,
      highlightlyLeagueId: definition.highlightlyLeagueId,
      apiFootballLeagueId: definition.apiFootballLeagueId,
    },
    select: { id: true },
  });
}

// Back-compat convenience — prisma/seed.ts and practice-season.service.ts
// only ever need the UCL competition specifically.
export function ensureUclCompetition(prisma: PrismaClient | PrismaService): Promise<{ id: string }> {
  return ensureCompetition(prisma, "ucl");
}

export function isKnownCompetitionSlug(slug: string): boolean {
  return slug in COMPETITIONS;
}
