import { computeSurvival } from "./survival.service";

const HOME = "home-team";
const AWAY = "away-team";

describe("computeSurvival", () => {
  it.each([
    // pickedTeam, result, tieForgivenessAlreadyUsed, expected
    [HOME, "HOME_WIN", false, { outcome: "WIN", eliminatesUser: false, consumesTieForgiveness: false }],
    [AWAY, "AWAY_WIN", false, { outcome: "WIN", eliminatesUser: false, consumesTieForgiveness: false }],
    [HOME, "AWAY_WIN", false, { outcome: "LOSS", eliminatesUser: true, consumesTieForgiveness: false }],
    [AWAY, "HOME_WIN", false, { outcome: "LOSS", eliminatesUser: true, consumesTieForgiveness: false }],
    [
      HOME,
      "DRAW",
      false,
      { outcome: "DRAW_FORGIVEN", eliminatesUser: false, consumesTieForgiveness: true },
    ],
    [
      AWAY,
      "DRAW",
      false,
      { outcome: "DRAW_FORGIVEN", eliminatesUser: false, consumesTieForgiveness: true },
    ],
    [
      HOME,
      "DRAW",
      true,
      { outcome: "DRAW_ELIMINATED", eliminatesUser: true, consumesTieForgiveness: false },
    ],
    [
      AWAY,
      "DRAW",
      true,
      { outcome: "DRAW_ELIMINATED", eliminatesUser: true, consumesTieForgiveness: false },
    ],
  ] as const)(
    "picked=%s result=%s tieForgivenessAlreadyUsed=%s -> %o",
    (pickedTeam, result, tieForgivenessAlreadyUsed, expected) => {
      const output = computeSurvival({
        pickedTeamId: pickedTeam,
        fixtureHomeTeamId: HOME,
        fixtureAwayTeamId: AWAY,
        result,
        tieForgivenessAlreadyUsed,
      });
      expect(output).toEqual(expected);
    },
  );
});
