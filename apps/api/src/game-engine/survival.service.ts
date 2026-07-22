import type { FixtureResult, PickOutcome } from "@prisma/client";

export interface SurvivalInput {
  pickedTeamId: string;
  fixtureHomeTeamId: string;
  fixtureAwayTeamId: string;
  result: FixtureResult;
}

export interface SurvivalOutput {
  outcome: PickOutcome;
  eliminatesUser: boolean;
}

/**
 * Pure function: given a resolved fixture result, what happened to this one
 * pick. No I/O, no knowledge of leagues/users — recompute.service.ts is what
 * threads this across a season for a given member.
 *
 * A draw always survives; only an outright loss eliminates. (Buy-back — a
 * commissioner-granted, once-per-season reinstatement after elimination —
 * lives in recompute.service.ts, since it needs season-spanning state this
 * per-matchday decision doesn't.)
 */
export function computeSurvival(input: SurvivalInput): SurvivalOutput {
  const pickedHome = input.pickedTeamId === input.fixtureHomeTeamId;
  const pickedTeamWon =
    (pickedHome && input.result === "HOME_WIN") || (!pickedHome && input.result === "AWAY_WIN");

  if (pickedTeamWon) {
    return { outcome: "WIN", eliminatesUser: false };
  }
  if (input.result === "DRAW") {
    return { outcome: "DRAW", eliminatesUser: false };
  }
  return { outcome: "LOSS", eliminatesUser: true };
}
