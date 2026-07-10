import { validatePick } from "./pick-validation.service";

const NOW = new Date("2026-09-16T12:00:00Z");
const LOCK_AT = new Date("2026-09-16T18:45:00Z");
const LOCK_PASSED = new Date("2026-09-16T20:00:00Z");

function baseInput(overrides: Partial<Parameters<typeof validatePick>[0]> = {}) {
  return {
    membershipStatus: "ACTIVE" as const,
    matchdayLockAt: LOCK_AT,
    now: NOW,
    usedTeamIdsExcludingCurrentMatchday: new Set<string>(),
    requestedTeamId: "team-1",
    ...overrides,
  };
}

describe("validatePick", () => {
  it("allows a pick when active, unlocked, and the team is unused", () => {
    expect(validatePick(baseInput())).toEqual({ ok: true });
  });

  it("rejects an eliminated user", () => {
    expect(validatePick(baseInput({ membershipStatus: "ELIMINATED" }))).toEqual({
      ok: false,
      reason: "ALREADY_ELIMINATED",
    });
  });

  it("rejects a user who has left the league", () => {
    expect(validatePick(baseInput({ membershipStatus: "LEFT" }))).toEqual({
      ok: false,
      reason: "ALREADY_ELIMINATED",
    });
  });

  it("rejects a pick submitted exactly at lock time", () => {
    expect(validatePick(baseInput({ now: LOCK_AT }))).toEqual({
      ok: false,
      reason: "MATCHDAY_LOCKED",
    });
  });

  it("rejects a pick submitted after lock time", () => {
    expect(validatePick(baseInput({ now: LOCK_PASSED }))).toEqual({
      ok: false,
      reason: "MATCHDAY_LOCKED",
    });
  });

  it("rejects a team already burned in an earlier matchday", () => {
    expect(
      validatePick(baseInput({ usedTeamIdsExcludingCurrentMatchday: new Set(["team-1"]) })),
    ).toEqual({ ok: false, reason: "TEAM_ALREADY_USED" });
  });

  it("allows a team not in the burned set even if other teams are burned", () => {
    expect(
      validatePick(
        baseInput({ usedTeamIdsExcludingCurrentMatchday: new Set(["team-2", "team-3"]) }),
      ),
    ).toEqual({ ok: true });
  });

  it("checks elimination before lock time (elimination reason wins when both apply)", () => {
    expect(
      validatePick(baseInput({ membershipStatus: "ELIMINATED", now: LOCK_PASSED })),
    ).toEqual({ ok: false, reason: "ALREADY_ELIMINATED" });
  });
});
