import { ConfigService } from "@nestjs/config";
import { HighlightlyProvider } from "./highlightly.provider";

function sampleMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 1391964464,
    round: "League Stage - 6",
    date: "2026-12-09T20:00:00.000Z",
    state: { description: "Not started", score: { current: null } },
    homeTeam: { id: 99500, logo: "https://example.com/home.png", name: "Home FC" },
    awayTeam: { id: 279061, logo: "https://example.com/away.png", name: "Away FC" },
    ...overrides,
  };
}

describe("HighlightlyProvider", () => {
  const config = { getOrThrow: jest.fn().mockReturnValue("fake-key") } as unknown as ConfigService;
  const provider = new HighlightlyProvider(config);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("maps a not-yet-played fixture to our shape", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [sampleMatch()] }),
    } as Response);

    const [fixture] = await provider.getFixtures("unused", 2026);

    expect(fixture).toEqual({
      externalId: "1391964464",
      homeTeamExternalId: "99500",
      awayTeamExternalId: "279061",
      homeTeamName: "Home FC",
      awayTeamName: "Away FC",
      homeTeamCrestUrl: "https://example.com/home.png",
      awayTeamCrestUrl: "https://example.com/away.png",
      round: "League Stage - 6",
      kickoffAt: new Date("2026-12-09T20:00:00.000Z"),
      venue: null,
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
    });
  });

  it("parses a finished match's score string", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [sampleMatch({ state: { description: "Finished", score: { current: "2 - 1" } } })],
        }),
    } as Response);

    const [fixture] = await provider.getFixtures("unused", 2026);
    expect(fixture.status).toBe("FINISHED");
    expect(fixture.homeScore).toBe(2);
    expect(fixture.awayScore).toBe(1);
  });

  it("maps an in-progress description to LIVE", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [sampleMatch({ state: { description: "Second half", score: { current: "1 - 0" } } })] }),
    } as Response);

    const [fixture] = await provider.getFixtures("unused", 2026);
    expect(fixture.status).toBe("LIVE");
  });

  it("pages through offset until a short page ends it", async () => {
    const page1 = { data: Array.from({ length: 100 }, (_, i) => sampleMatch({ id: i })) };
    const page2 = { data: [sampleMatch({ id: 999 })] };
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page1) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page2) } as Response);

    const fixtures = await provider.getFixtures("unused", 2026);

    expect(fixtures).toHaveLength(101);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toContain("offset=0");
    expect(fetchSpy.mock.calls[1][0]).toContain("offset=100");
  });

  it("throws on a non-OK response", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" } as Response);
    await expect(provider.getFixtures("unused", 2026)).rejects.toThrow("Highlightly request failed");
  });

  it("returns an empty array without calling fetch when no fixture IDs are requested", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const result = await provider.getLiveResults([]);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("getLiveResults narrows a date-filtered response down to the requested ids", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [sampleMatch({ id: 111 }), sampleMatch({ id: 222 }), sampleMatch({ id: 333 })],
        }),
    } as Response);

    const fixtures = await provider.getLiveResults(["222"]);

    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].externalId).toBe("222");
  });
});
