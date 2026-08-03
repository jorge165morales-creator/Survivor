import { ConfigService } from "@nestjs/config";
import { FootballDataOrgProvider } from "./football-data-org.provider";

const originalFetch = global.fetch;

function mockFetchSequence(responses: unknown[]) {
  let call = 0;
  global.fetch = jest.fn().mockImplementation(() => {
    const body = responses[call];
    call += 1;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  }) as unknown as typeof fetch;
}

describe("FootballDataOrgProvider", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function makeProvider() {
    const config = { getOrThrow: jest.fn().mockReturnValue("test-token") } as unknown as ConfigService;
    return new FootballDataOrgProvider(config);
  }

  it("maps a league-stage match, using the home team's venue", async () => {
    mockFetchSequence([
      {
        matches: [
          {
            id: 551981,
            utcDate: "2025-09-16T16:45:00Z",
            status: "FINISHED",
            matchday: 1,
            stage: "LEAGUE_STAGE",
            homeTeam: { id: 77, name: "Athletic Club", crest: "https://example.com/77.png" },
            awayTeam: { id: 57, name: "Arsenal FC", crest: "https://example.com/57.png" },
            score: { fullTime: { home: 0, away: 2 } },
          },
        ],
      },
      { teams: [{ id: 77, venue: "San Mamés" }, { id: 57, venue: "Emirates Stadium" }] },
    ]);

    const [fixture] = await makeProvider().getFixtures("CL", 2025);

    expect(fixture).toEqual({
      externalId: "551981",
      homeTeamExternalId: "77",
      awayTeamExternalId: "57",
      homeTeamName: "Athletic Club",
      awayTeamName: "Arsenal FC",
      homeTeamCrestUrl: "https://example.com/77.png",
      awayTeamCrestUrl: "https://example.com/57.png",
      round: "League Stage - 1",
      kickoffAt: new Date("2025-09-16T16:45:00Z"),
      venue: "San Mamés",
      status: "FINISHED",
      homeScore: 0,
      awayScore: 2,
    });
  });

  it("normalizes knockout stages to the same vocabulary round-mapping.ts expects", async () => {
    mockFetchSequence([
      {
        matches: [
          { id: 1, utcDate: "2026-02-17T20:00:00Z", status: "FINISHED", matchday: 1, stage: "PLAYOFFS", homeTeam: { id: 1, name: "A", crest: null }, awayTeam: { id: 2, name: "B", crest: null }, score: { fullTime: { home: 1, away: 0 } } },
          { id: 2, utcDate: "2026-03-10T20:00:00Z", status: "FINISHED", matchday: 1, stage: "LAST_16", homeTeam: { id: 1, name: "A", crest: null }, awayTeam: { id: 2, name: "B", crest: null }, score: { fullTime: { home: 1, away: 0 } } },
          { id: 3, utcDate: "2026-04-07T20:00:00Z", status: "FINISHED", matchday: 1, stage: "QUARTER_FINALS", homeTeam: { id: 1, name: "A", crest: null }, awayTeam: { id: 2, name: "B", crest: null }, score: { fullTime: { home: 1, away: 0 } } },
          { id: 4, utcDate: "2026-04-28T20:00:00Z", status: "FINISHED", matchday: 1, stage: "SEMI_FINALS", homeTeam: { id: 1, name: "A", crest: null }, awayTeam: { id: 2, name: "B", crest: null }, score: { fullTime: { home: 1, away: 0 } } },
          { id: 5, utcDate: "2026-05-30T19:00:00Z", status: "FINISHED", matchday: null, stage: "FINAL", homeTeam: { id: 1, name: "A", crest: null }, awayTeam: { id: 2, name: "B", crest: null }, score: { fullTime: { home: 1, away: 0 } } },
        ],
      },
      { teams: [{ id: 1, venue: "Stadium A" }, { id: 2, venue: "Stadium B" }] },
    ]);

    const fixtures = await makeProvider().getFixtures("CL", 2025);

    expect(fixtures.map((f) => f.round)).toEqual([
      "Knockout Round Play-offs",
      "Round of 16",
      "Quarter-finals",
      "Semi-finals",
      "Final",
    ]);
  });

  it("leaves the final's venue unknown rather than attributing it to either finalist's home ground", async () => {
    mockFetchSequence([
      {
        matches: [
          { id: 5, utcDate: "2026-05-30T19:00:00Z", status: "FINISHED", matchday: null, stage: "FINAL", homeTeam: { id: 1, name: "A", crest: null }, awayTeam: { id: 2, name: "B", crest: null }, score: { fullTime: { home: 1, away: 0 } } },
        ],
      },
      { teams: [{ id: 1, venue: "Stadium A" }, { id: 2, venue: "Stadium B" }] },
    ]);

    const [fixture] = await makeProvider().getFixtures("CL", 2025);

    expect(fixture.venue).toBeNull();
  });

  it("maps an unfinished match status to SCHEDULED, not FINISHED with null scores", async () => {
    mockFetchSequence([
      {
        matches: [
          { id: 9, utcDate: "2026-09-16T16:45:00Z", status: "TIMED", matchday: 1, stage: "LEAGUE_STAGE", homeTeam: { id: 1, name: "A", crest: null }, awayTeam: { id: 2, name: "B", crest: null }, score: { fullTime: { home: null, away: null } } },
        ],
      },
      { teams: [{ id: 1, venue: "Stadium A" }] },
    ]);

    const [fixture] = await makeProvider().getFixtures("CL", 2025);

    expect(fixture.status).toBe("SCHEDULED");
    expect(fixture.homeScore).toBeNull();
  });
});
