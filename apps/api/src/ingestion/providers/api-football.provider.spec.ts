import { ConfigService } from "@nestjs/config";
import { ApiFootballProvider } from "./api-football.provider";

function sampleResponse(status: string, home: number | null, away: number | null) {
  return {
    response: [
      {
        fixture: {
          id: 12345,
          date: "2026-09-16T18:45:00+00:00",
          status: { short: status },
          venue: { name: "Santiago Bernabéu", city: "Madrid" },
        },
        league: { round: "League Stage - 1" },
        teams: {
          home: { id: 111, name: "Home FC", logo: "https://example.com/home.png" },
          away: { id: 222, name: "Away FC", logo: "https://example.com/away.png" },
        },
        goals: { home, away },
      },
    ],
  };
}

describe("ApiFootballProvider", () => {
  const config = { getOrThrow: jest.fn().mockReturnValue("fake-key") } as unknown as ConfigService;
  const provider = new ApiFootballProvider(config);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("maps a finished fixture to our shape", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleResponse("FT", 2, 1)),
    } as Response);

    const [fixture] = await provider.getFixtures("39", 2026);

    expect(fixture).toEqual({
      externalId: "12345",
      homeTeamExternalId: "111",
      awayTeamExternalId: "222",
      homeTeamName: "Home FC",
      awayTeamName: "Away FC",
      homeTeamCrestUrl: "https://example.com/home.png",
      awayTeamCrestUrl: "https://example.com/away.png",
      round: "League Stage - 1",
      kickoffAt: new Date("2026-09-16T18:45:00+00:00"),
      venue: "Santiago Bernabéu, Madrid",
      status: "FINISHED",
      homeScore: 2,
      awayScore: 1,
    });
  });

  it("maps an in-progress status to LIVE", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleResponse("2H", 1, 0)),
    } as Response);

    const [fixture] = await provider.getFixtures("39", 2026);
    expect(fixture.status).toBe("LIVE");
  });

  it("throws when the API responds with a non-OK status", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" } as Response);
    await expect(provider.getFixtures("39", 2026)).rejects.toThrow("API-Football request failed");
  });

  it("returns an empty array without calling fetch when no fixture IDs are requested", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const result = await provider.getLiveResults([]);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws when the API responds 200 OK but with a plan/parameter error", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          errors: { plan: "Free plans do not have access to this season, try from 2022 to 2024." },
          response: [],
        }),
    } as Response);

    await expect(provider.getFixtures("2", 2026)).rejects.toThrow(
      "API-Football request failed: Free plans do not have access to this season, try from 2022 to 2024.",
    );
  });

  it("does not throw when errors is an empty array (API-Football's normal 'no errors' shape)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ errors: [], response: [] }),
    } as Response);

    await expect(provider.getFixtures("2", 2026)).resolves.toEqual([]);
  });
});
