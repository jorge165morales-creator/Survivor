import { PrismaClient, MatchdayType, type FixtureResult } from "@prisma/client";
import { computeFixtureResult } from "../src/game-engine/fixture-result";
import { TEAM_CRESTS_2025_26 } from "./team-crests-2025-26";
import {
  LEAGUE_PHASE_RESULTS,
  KNOCKOUT_PLAYOFFS,
  ROUND_OF_16,
  QUARTERFINALS,
  SEMIFINALS,
  FINAL_RESULT,
  type KnockoutTie,
} from "./season-2025-26-results";

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

function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setUTCHours(result.getUTCHours() + hours);
  return result;
}

export async function seedUpcomingSeason(prisma: PrismaClient): Promise<void> {
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

/**
 * A second, separate, always-inactive season populated with the REAL,
 * now-concluded 2025/26 results (league phase + full knockout bracket) —
 * a fully playable test dataset so the game engine (survival, standings,
 * buy-back) can be exercised end-to-end without waiting on live ingestion.
 * Independent of seedUpcomingSeason()'s "any active season" guard, since
 * isActive is always false here; keyed off its own year instead.
 */
export async function seedHistoricalTestSeason(prisma: PrismaClient): Promise<void> {
  const YEAR = 2025;
  const existing = await prisma.season.findFirst({ where: { year: YEAR } });
  if (existing) {
    console.log(`Historical test season already exists (${existing.id}) — skipping seed.`);
    return;
  }

  const season = await prisma.season.create({
    data: { name: "UEFA Champions League 2025/26 (Test Data)", year: YEAR, isActive: false },
  });

  const teamNames = Object.keys(TEAM_CRESTS_2025_26);
  const teams = await Promise.all(
    teamNames.map((name, index) =>
      prisma.team.create({
        data: {
          name,
          shortName: shortNameFor(name),
          externalId: `test-${YEAR}-${String(index + 1).padStart(2, "0")}`,
          crestUrl: TEAM_CRESTS_2025_26[name],
          seasons: { connect: { id: season.id } },
        },
      }),
    ),
  );
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]));
  function teamId(name: string): string {
    const id = teamIdByName.get(name);
    if (!id) throw new Error(`Unknown team in 2025/26 test data: "${name}"`);
    return id;
  }

  const matchdaySeeds = buildHistoricalMatchdayCalendar();
  const matchdays = await Promise.all(
    matchdaySeeds.map((m) => prisma.matchday.create({ data: { ...m, seasonId: season.id } })),
  );
  const matchdayBySequence = new Map(matchdays.map((m) => [m.sequence, m]));
  function matchdayId(sequence: number): string {
    const md = matchdayBySequence.get(sequence);
    if (!md) throw new Error(`No matchday with sequence ${sequence}`);
    return md.id;
  }

  let fixtureCount = 0;
  const fixtureRows: {
    matchdayId: string;
    externalId: string;
    homeTeamId: string;
    awayTeamId: string;
    kickoffAt: Date;
    homeScore: number;
    awayScore: number;
    result: FixtureResult;
  }[] = [];

  function addFixture(sequence: number, home: string, away: string, homeScore: number, awayScore: number) {
    fixtureCount += 1;
    fixtureRows.push({
      matchdayId: matchdayId(sequence),
      externalId: `test-${YEAR}-fixture-${fixtureCount}`,
      homeTeamId: teamId(home),
      awayTeamId: teamId(away),
      kickoffAt: matchdayBySequence.get(sequence)!.lockAt,
      homeScore,
      awayScore,
      result: computeFixtureResult(homeScore, awayScore),
    });
  }

  for (const [sequence, matches] of Object.entries(LEAGUE_PHASE_RESULTS)) {
    for (const [home, away, homeScore, awayScore] of matches) {
      addFixture(Number(sequence), home, away, homeScore, awayScore);
    }
  }

  function addKnockoutRound(legOneSequence: number, ties: KnockoutTie[]) {
    for (const tie of ties) {
      addFixture(legOneSequence, ...tie.leg1);
      addFixture(legOneSequence + 1, ...tie.leg2);
    }
  }
  addKnockoutRound(9, KNOCKOUT_PLAYOFFS);
  addKnockoutRound(11, ROUND_OF_16);
  addKnockoutRound(13, QUARTERFINALS);
  addKnockoutRound(15, SEMIFINALS);
  addFixture(17, FINAL_RESULT.home, FINAL_RESULT.away, FINAL_RESULT.homeScore, FINAL_RESULT.awayScore);

  await prisma.fixture.createMany({
    data: fixtureRows.map((f) => ({ ...f, status: "FINISHED" as const })),
  });

  console.log(
    `Seeded historical test season "${season.name}" with ${teams.length} teams, ` +
      `${matchdays.length} matchdays, and ${fixtureRows.length} finished fixtures.`,
  );
}

function buildHistoricalMatchdayCalendar(): MatchdaySeed[] {
  // Every fixture in this season is already FINISHED with a real historical
  // score baked in (see seedHistoricalTestSeason) — this is test data for
  // exercising the game engine, not a fixture archive, so lockAt is
  // deliberately anchored to "now" (not the real 2025/26 calendar dates,
  // which are all in the past and would make every matchday permanently
  // locked/unpickable) and spaced in hours rather than weeks, so a tester
  // can move through the whole season in one sitting.
  const base = addHours(new Date(), 1);
  const matchdays: MatchdaySeed[] = [];

  for (let i = 1; i <= 8; i++) {
    matchdays.push({
      sequence: i,
      type: MatchdayType.GROUP,
      roundLabel: `League Phase Matchday ${i}`,
      lockAt: addHours(base, (i - 1) * 2),
    });
  }

  const knockoutRounds = ["Knockout Play-offs", "Round of 16", "Quarter-finals", "Semi-finals"];
  let cursor = addHours(base, 8 * 2 + 2);
  let sequence = 9;
  for (const roundLabel of knockoutRounds) {
    matchdays.push({
      sequence: sequence++,
      type: MatchdayType.KNOCKOUT_HOME,
      roundLabel: `${roundLabel} — Leg 1`,
      lockAt: cursor,
    });
    cursor = addHours(cursor, 2);
    matchdays.push({
      sequence: sequence++,
      type: MatchdayType.KNOCKOUT_AWAY,
      roundLabel: `${roundLabel} — Leg 2`,
      lockAt: cursor,
    });
    cursor = addHours(cursor, 3);
  }

  matchdays.push({
    sequence: 17,
    type: MatchdayType.FINAL,
    roundLabel: "Final",
    lockAt: cursor,
  });

  return matchdays;
}

async function main() {
  await seedUpcomingSeason(prisma);
  await seedHistoricalTestSeason(prisma);
}

// Guarded so importing seedUpcomingSeason/seedHistoricalTestSeason
// elsewhere (e.g. an admin endpoint reusing them against the app's own
// PrismaService) doesn't also trigger this standalone-script run.
if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
