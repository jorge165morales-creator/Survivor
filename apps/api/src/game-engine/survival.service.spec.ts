import { computeSurvival } from "./survival.service";

const HOME = "home-team";
const AWAY = "away-team";

describe("computeSurvival", () => {
  it.each([
    // pickedTeam, result, expected
    [HOME, "HOME_WIN", { outcome: "WIN", eliminatesUser: false }],
    [AWAY, "AWAY_WIN", { outcome: "WIN", eliminatesUser: false }],
    [HOME, "AWAY_WIN", { outcome: "LOSS", eliminatesUser: true }],
    [AWAY, "HOME_WIN", { outcome: "LOSS", eliminatesUser: true }],
    [HOME, "DRAW", { outcome: "DRAW", eliminatesUser: false }],
    [AWAY, "DRAW", { outcome: "DRAW", eliminatesUser: false }],
  ] as const)("picked=%s result=%s -> %o", (pickedTeam, result, expected) => {
    const output = computeSurvival({
      pickedTeamId: pickedTeam,
      fixtureHomeTeamId: HOME,
      fixtureAwayTeamId: AWAY,
      result,
    });
    expect(output).toEqual(expected);
  });
});
