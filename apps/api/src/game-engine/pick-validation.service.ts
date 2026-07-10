import type { MembershipStatus } from "@prisma/client";

export type PickRejectionReason =
  | "ALREADY_ELIMINATED"
  | "MATCHDAY_LOCKED"
  | "TEAM_ALREADY_USED";

export interface PickValidationInput {
  membershipStatus: MembershipStatus;
  matchdayLockAt: Date;
  now: Date;
  /** Teams already burned by this user in this league, EXCLUDING any team
   * tied to the matchday being picked right now (so changing your mind
   * within the same still-open matchday is never blocked). */
  usedTeamIdsExcludingCurrentMatchday: Set<string>;
  requestedTeamId: string;
}

export type PickValidationResult = { ok: true } | { ok: false; reason: PickRejectionReason };

/**
 * Pure rule check for "can this user pick this team for this matchday right
 * now" — no I/O. Rule order matters: elimination and lock checks are terminal
 * (there's nothing more useful to say once either is true), so they're
 * checked before the used-team check.
 */
export function validatePick(input: PickValidationInput): PickValidationResult {
  if (input.membershipStatus !== "ACTIVE") {
    return { ok: false, reason: "ALREADY_ELIMINATED" };
  }
  if (input.now >= input.matchdayLockAt) {
    return { ok: false, reason: "MATCHDAY_LOCKED" };
  }
  if (input.usedTeamIdsExcludingCurrentMatchday.has(input.requestedTeamId)) {
    return { ok: false, reason: "TEAM_ALREADY_USED" };
  }
  return { ok: true };
}
