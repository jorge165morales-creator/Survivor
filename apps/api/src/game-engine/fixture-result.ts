import type { FixtureResult } from "@prisma/client";

export function computeFixtureResult(homeScore: number, awayScore: number): FixtureResult {
  if (homeScore > awayScore) return "HOME_WIN";
  if (homeScore < awayScore) return "AWAY_WIN";
  return "DRAW";
}
