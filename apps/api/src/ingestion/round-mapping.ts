import type { MatchdayType } from "@prisma/client";
import type { ProviderFixture } from "./providers/sports-data.provider.interface";

export interface MatchdayGroup {
  sequence: number;
  type: MatchdayType;
  roundLabel: string;
  fixtures: ProviderFixture[];
}

// Verified against API-Football's actual response for a completed season
// under the current 36-club single-table format (league=2, season=2024):
// "League Stage - 1".."League Stage - 8", "Knockout Round Play-offs",
// "Round of 16", "Quarter-finals", "Semi-finals", "Final". Everything before
// the league stage ("1st/2nd/3rd Qualifying Round", plain "Play-offs") is
// pre-tournament qualifying for clubs outside our 36-team field and isn't
// part of the pool's 17 matchdays, so it's deliberately left unmapped.
const LEAGUE_STAGE_RE = /^League Stage - (\d+)$/;

const KNOCKOUT_ROUNDS: { providerRound: string; legOneSequence: number; label: string }[] = [
  { providerRound: "Knockout Round Play-offs", legOneSequence: 9, label: "Knockout Play-offs" },
  { providerRound: "Round of 16", legOneSequence: 11, label: "Round of 16" },
  { providerRound: "Quarter-finals", legOneSequence: 13, label: "Quarter-finals" },
  { providerRound: "Semi-finals", legOneSequence: 15, label: "Semi-finals" },
];

const FINAL_SEQUENCE = 17;

// A two-legged tie's return leg kicks off about a week after the first —
// comfortably more than a weekend's gap between two matches that both
// belong to the same leg. Used to split a knockout round's fixtures into
// leg-1/leg-2 clusters without assuming the provider has published both legs
// yet (see splitIntoLegClusters below).
const LEG_GAP_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Groups a flat list of provider fixtures into our 17-matchday shape,
 * matched by sequence against the matchdays prisma/seed.ts already creates.
 * Pure and DB-free by design — season-sync.service.ts is the only caller,
 * and it's what actually persists anything.
 */
export function groupProviderFixturesIntoMatchdays(fixtures: ProviderFixture[]): MatchdayGroup[] {
  const byRound = new Map<string, ProviderFixture[]>();
  for (const fixture of fixtures) {
    const list = byRound.get(fixture.round);
    if (list) {
      list.push(fixture);
    } else {
      byRound.set(fixture.round, [fixture]);
    }
  }

  const groups: MatchdayGroup[] = [];

  for (const [round, roundFixtures] of byRound) {
    const leagueStageMatch = round.match(LEAGUE_STAGE_RE);
    if (leagueStageMatch) {
      const sequence = Number(leagueStageMatch[1]);
      groups.push({
        sequence,
        type: "GROUP",
        roundLabel: `League Phase Matchday ${sequence}`,
        fixtures: roundFixtures,
      });
      continue;
    }

    if (round === "Final") {
      groups.push({ sequence: FINAL_SEQUENCE, type: "FINAL", roundLabel: "Final", fixtures: roundFixtures });
      continue;
    }

    const knockout = KNOCKOUT_ROUNDS.find((k) => k.providerRound === round);
    if (!knockout) continue; // qualifying rounds etc. — outside the pool's 17 matchdays

    const [leg1, leg2] = splitIntoLegClusters(roundFixtures);
    if (leg1.length > 0) {
      groups.push({
        sequence: knockout.legOneSequence,
        type: "KNOCKOUT_HOME",
        roundLabel: `${knockout.label} — Leg 1`,
        fixtures: leg1,
      });
    }
    if (leg2.length > 0) {
      groups.push({
        sequence: knockout.legOneSequence + 1,
        type: "KNOCKOUT_AWAY",
        roundLabel: `${knockout.label} — Leg 2`,
        fixtures: leg2,
      });
    }
  }

  return groups.sort((a, b) => a.sequence - b.sequence);
}

/**
 * Splits one knockout round's fixtures into up to two leg clusters by
 * kickoff-date gaps rather than a fixed head/tail count split — the provider
 * often publishes leg-1 fixtures weeks before leg-2's dates are confirmed, and
 * a count-based split would silently misclassify a leg-1-only round. A gap of
 * 3+ days starts a new cluster; more than two clusters (unexpected) folds
 * everything after the first into "leg 2" rather than dropping fixtures.
 */
function splitIntoLegClusters(fixtures: ProviderFixture[]): [ProviderFixture[], ProviderFixture[]] {
  const sorted = [...fixtures].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
  const clusters: ProviderFixture[][] = [];

  for (const fixture of sorted) {
    const currentCluster = clusters[clusters.length - 1];
    const previousFixture = currentCluster?.[currentCluster.length - 1];
    if (previousFixture && fixture.kickoffAt.getTime() - previousFixture.kickoffAt.getTime() <= LEG_GAP_THRESHOLD_MS) {
      currentCluster.push(fixture);
    } else {
      clusters.push([fixture]);
    }
  }

  const leg1 = clusters[0] ?? [];
  const leg2 = clusters.slice(1).flat();
  return [leg1, leg2];
}
