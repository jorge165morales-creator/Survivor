import { PrismaClient, MatchdayType } from "@prisma/client";

const prisma = new PrismaClient();

// Real club names, purely as realistic dev-seed data (no fixtures/results
// attached yet — that arrives via live ingestion in Phase 3). Roughly the
// 36-club league-phase field; exact composition doesn't matter for seeding.
const TEAM_NAMES = [
  "Real Madrid",
  "Manchester City",
  "Bayern Munich",
  "Paris Saint-Germain",
  "Liverpool",
  "Inter Milan",
  "Borussia Dortmund",
  "RB Leipzig",
  "Barcelona",
  "Bayer Leverkusen",
  "Atletico Madrid",
  "Atalanta",
  "Juventus",
  "Benfica",
  "Arsenal",
  "Club Brugge",
  "Shakhtar Donetsk",
  "AC Milan",
  "Feyenoord",
  "Sporting CP",
  "PSV Eindhoven",
  "Dinamo Zagreb",
  "Red Bull Salzburg",
  "Lille",
  "Red Star Belgrade",
  "Young Boys",
  "Celtic",
  "Slovan Bratislava",
  "Sturm Graz",
  "Sparta Prague",
  "Girona",
  "Stuttgart",
  "Monaco",
  "Aston Villa",
  "Bologna",
  "Brest",
];

function shortNameFor(name: string): string {
  return name.length <= 12 ? name : name.split(" ")[0];
}

interface MatchdaySeed {
  sequence: number;
  type: MatchdayType;
  roundLabel: string;
  lockAt: Date;
}

function buildMatchdayCalendar(): MatchdaySeed[] {
  // Illustrative dates only — real kickoff times come from live ingestion
  // (Phase 3). Group phase roughly every 2 weeks, knockout rounds monthly.
  const base = new Date("2026-09-16T18:45:00Z");
  const matchdays: MatchdaySeed[] = [];

  for (let i = 1; i <= 8; i++) {
    matchdays.push({
      sequence: i,
      type: MatchdayType.GROUP,
      roundLabel: `League Phase Matchday ${i}`,
      lockAt: addDays(base, (i - 1) * 14),
    });
  }

  const knockoutRounds = [
    "Knockout Play-offs",
    "Round of 16",
    "Quarter-finals",
    "Semi-finals",
  ];
  let cursor = addDays(base, 8 * 14 + 14);
  let sequence = 9;
  for (const roundLabel of knockoutRounds) {
    matchdays.push({
      sequence: sequence++,
      type: MatchdayType.KNOCKOUT_HOME,
      roundLabel: `${roundLabel} — Leg 1`,
      lockAt: cursor,
    });
    cursor = addDays(cursor, 7);
    matchdays.push({
      sequence: sequence++,
      type: MatchdayType.KNOCKOUT_AWAY,
      roundLabel: `${roundLabel} — Leg 2`,
      lockAt: cursor,
    });
    cursor = addDays(cursor, 21);
  }

  matchdays.push({
    sequence: 17,
    type: MatchdayType.FINAL,
    roundLabel: "Final",
    lockAt: cursor,
  });

  return matchdays;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

async function main() {
  const existing = await prisma.season.findFirst({ where: { isActive: true } });
  if (existing) {
    console.log(`Active season "${existing.name}" already exists (${existing.id}) — skipping seed.`);
    return;
  }

  const season = await prisma.season.create({
    data: { name: "UEFA Champions League 2026/27", year: 2026, isActive: true },
  });

  const teams = await Promise.all(
    TEAM_NAMES.map((name, index) =>
      prisma.team.create({
        data: {
          name,
          shortName: shortNameFor(name),
          externalId: `seed-${season.year}-${String(index + 1).padStart(2, "0")}`,
          seasons: { connect: { id: season.id } },
        },
      }),
    ),
  );

  const matchdays = buildMatchdayCalendar();
  await prisma.matchday.createMany({
    data: matchdays.map((m) => ({ ...m, seasonId: season.id })),
  });

  console.log(
    `Seeded season "${season.name}" with ${teams.length} teams and ${matchdays.length} matchdays.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
