import type { FixtureResult, PickOutcome } from "@prisma/client";

export interface SurvivalInput {
  pickedTeamId: string;
  fixtureHomeTeamId: string;
  fixtureAwayTeamId: string;
  result: FixtureResult;
  tieForgivenessAlreadyUsed: boolean;
}

export interface SurvivalOutput {
  outcome: PickOutcome;
  eliminatesUser: boolean;
  consumesTieForgiveness: boolean;
}

/**
 * Pure function: given a resolved fixture result, what happened to this one
 * pick. No I/O, no knowledge of leagues/users — recompute.service.ts is what
 * threads this across a season for a given member.
 */
export function computeSurvival(input: SurvivalInput): SurvivalOutput {
  const pickedHome = input.pickedTeamId === input.fixtureHomeTeamId;
  const pickedTeamWon =
    (pickedHome && input.result === "HOME_WIN") || (!pickedHome && input.result === "AWAY_WIN");

  if (pickedTeamWon) {
    return { outcome: "WIN", eliminatesUser: false, consumesTieForgiveness: false };
  }

  if (input.result === "DRAW") {
    if (!input.tieForgivenessAlreadyUsed) {
      return { outcome: "DRAW_FORGIVEN", eliminatesUser: false, consumesTieForgiveness: true };
    }
    return { outcome: "DRAW_ELIMINATED", eliminatesUser: true, consumesTieForgiveness: false };
  }

  // Picked team lost outright (or drew and forgiveness already used is
  // handled above — this branch is a straight loss: the opposing team won).
  return { outcome: "LOSS", eliminatesUser: true, consumesTieForgiveness: false };
}
