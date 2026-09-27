import { cycleIndexForSequence } from "./team-cycle";

describe("cycleIndexForSequence", () => {
  it("keeps every matchday of a 17-matchday, 36-team competition in cycle 0", () => {
    for (let sequence = 1; sequence <= 17; sequence++) {
      expect(cycleIndexForSequence(sequence, 36)).toBe(0);
    }
  });

  it("puts matchdays 1-20 of a 20-team round robin in cycle 0", () => {
    expect(cycleIndexForSequence(1, 20)).toBe(0);
    expect(cycleIndexForSequence(20, 20)).toBe(0);
  });

  it("resets to cycle 1 starting exactly at matchday 21 (teamCount + 1) for a 20-team round robin", () => {
    expect(cycleIndexForSequence(21, 20)).toBe(1);
    expect(cycleIndexForSequence(38, 20)).toBe(1);
  });

  it("advances to a third cycle if a season ever ran that long", () => {
    expect(cycleIndexForSequence(41, 20)).toBe(2);
  });

  it("treats a non-positive teamCount as a no-op (always cycle 0) rather than dividing by zero", () => {
    expect(cycleIndexForSequence(50, 0)).toBe(0);
  });
});
