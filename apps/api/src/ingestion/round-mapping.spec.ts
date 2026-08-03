import { groupProviderFixturesIntoMatchdays } from "./round-mapping";
import type { ProviderFixture } from "./providers/sports-data.provider.interface";

let fixtureCounter = 0;

function fixture(round: string, kickoffAt: string, overrides: Partial<ProviderFixture> = {}): ProviderFixture {
  fixtureCounter += 1;
  return {
    externalId: `fixture-${fixtureCounter}`,
    homeTeamExternalId: "home-team",
    awayTeamExternalId: "away-team",
    homeTeamName: "Home FC",
    awayTeamName: "Away FC",
    homeTeamCrestUrl: null,
    awayTeamCrestUrl: null,
    round,
    kickoffAt: new Date(kickoffAt),
    venue: "Sample Stadium, Sample City",
    status: "SCHEDULED",
    homeScore: null,
    awayScore: null,
    ...overrides,
  };
}

describe("groupProviderFixturesIntoMatchdays", () => {
  beforeEach(() => {
    fixtureCounter = 0;
  });

  it("maps each League Stage round to its own GROUP matchday by sequence", () => {
    const fixtures = [
      fixture("League Stage - 1", "2026-09-17T18:45:00Z"),
      fixture("League Stage - 1", "2026-09-17T21:00:00Z"),
      fixture("League Stage - 3", "2026-10-22T18:45:00Z"),
    ];

    const groups = groupProviderFixturesIntoMatchdays(fixtures);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ sequence: 1, type: "GROUP", roundLabel: "League Phase Matchday 1" });
    expect(groups[0].fixtures).toHaveLength(2);
    expect(groups[1]).toMatchObject({ sequence: 3, type: "GROUP", roundLabel: "League Phase Matchday 3" });
  });

  it("maps Final to sequence 17 with no leg-splitting", () => {
    const groups = groupProviderFixturesIntoMatchdays([fixture("Final", "2027-05-30T19:00:00Z")]);
    expect(groups).toEqual([
      expect.objectContaining({ sequence: 17, type: "FINAL", roundLabel: "Final" }),
    ]);
  });

  it("ignores qualifying rounds and the pre-league-stage play-offs", () => {
    const fixtures = [
      fixture("1st Qualifying Round", "2026-07-08T18:00:00Z"),
      fixture("2nd Qualifying Round", "2026-07-15T18:00:00Z"),
      fixture("3rd Qualifying Round", "2026-07-22T18:00:00Z"),
      fixture("Play-offs", "2026-08-05T18:00:00Z"),
    ];
    expect(groupProviderFixturesIntoMatchdays(fixtures)).toEqual([]);
  });

  it("splits a knockout round into leg 1 / leg 2 matchdays when both legs are known", () => {
    const fixtures = [
      // Leg 1: two ties, same week
      fixture("Round of 16", "2027-03-03T19:00:00Z"),
      fixture("Round of 16", "2027-03-04T19:00:00Z"),
      // Leg 2: a week later
      fixture("Round of 16", "2027-03-10T19:00:00Z"),
      fixture("Round of 16", "2027-03-11T19:00:00Z"),
    ];

    const groups = groupProviderFixturesIntoMatchdays(fixtures);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ sequence: 11, type: "KNOCKOUT_HOME", roundLabel: "Round of 16 — Leg 1" });
    expect(groups[0].fixtures.map((f) => f.externalId)).toEqual(["fixture-1", "fixture-2"]);
    expect(groups[1]).toMatchObject({ sequence: 12, type: "KNOCKOUT_AWAY", roundLabel: "Round of 16 — Leg 2" });
    expect(groups[1].fixtures.map((f) => f.externalId)).toEqual(["fixture-3", "fixture-4"]);
  });

  it("only produces the leg-1 matchday when leg 2 hasn't been scheduled by the provider yet", () => {
    const fixtures = [
      fixture("Quarter-finals", "2027-04-06T19:00:00Z"),
      fixture("Quarter-finals", "2027-04-07T19:00:00Z"),
    ];

    const groups = groupProviderFixturesIntoMatchdays(fixtures);

    expect(groups).toEqual([
      expect.objectContaining({ sequence: 13, type: "KNOCKOUT_HOME", roundLabel: "Quarter-finals — Leg 1" }),
    ]);
  });

  it("folds an unexpected third date cluster into leg 2 instead of dropping fixtures", () => {
    const fixtures = [
      fixture("Semi-finals", "2027-04-27T19:00:00Z"),
      fixture("Semi-finals", "2027-05-04T19:00:00Z"),
      fixture("Semi-finals", "2027-05-11T19:00:00Z"), // e.g. a postponed replay far outside either window
    ];

    const groups = groupProviderFixturesIntoMatchdays(fixtures);

    expect(groups).toHaveLength(2);
    expect(groups[0].fixtures).toHaveLength(1);
    expect(groups[1].fixtures).toHaveLength(2);
  });

  it("returns matchdays sorted by sequence regardless of input order", () => {
    const fixtures = [
      fixture("Final", "2027-05-30T19:00:00Z"),
      fixture("League Stage - 2", "2026-10-01T18:45:00Z"),
      fixture("League Stage - 1", "2026-09-17T18:45:00Z"),
    ];

    const groups = groupProviderFixturesIntoMatchdays(fixtures);
    expect(groups.map((g) => g.sequence)).toEqual([1, 2, 17]);
  });
});
