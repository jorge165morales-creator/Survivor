import { generateInviteCode } from "./invite-code";

describe("generateInviteCode", () => {
  it("generates a 6-character code using only the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-Z0-9]+$/);
      // 0/O and 1/I/L are excluded — easy to misread or mistype.
      expect(code).not.toMatch(/[01IOL]/);
    }
  });

  it("doesn't always generate the same code", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
