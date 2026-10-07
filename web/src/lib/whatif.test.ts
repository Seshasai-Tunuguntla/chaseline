import { describe, expect, it } from "vitest";
import { lookupWinProb, type WhatIfTable } from "./whatif";

// 2 wickets x 3 balls x 3 runs; probability falls with runs, rises with balls and wickets
const t: WhatIfTable = {
  env: 8.5,
  era_start: 2023,
  through_season: 2026,
  runs: [10, 20, 40],
  balls: [6, 12, 24],
  wickets: [1, 2],
  p: [
    // wickets = 1
    400, 200, 50, 600, 400, 100, 800, 600, 300,
    // wickets = 2
    500, 300, 100, 700, 500, 200, 900, 700, 400,
  ],
};

describe("lookupWinProb", () => {
  it("returns grid values exactly at grid points", () => {
    expect(lookupWinProb(t, 10, 6, 1)).toBe(40);
    expect(lookupWinProb(t, 40, 24, 2)).toBe(40);
    expect(lookupWinProb(t, 20, 12, 2)).toBe(50);
  });
  it("interpolates between runs and between balls", () => {
    expect(lookupWinProb(t, 15, 6, 1)).toBe(30); // midway between 400 and 200
    expect(lookupWinProb(t, 10, 9, 1)).toBe(50); // midway between 400 and 600
    expect(lookupWinProb(t, 15, 9, 1)).toBeCloseTo((400 + 200 + 600 + 400) / 4 / 10);
  });
  it("clamps inputs outside the table", () => {
    expect(lookupWinProb(t, 1, 1, 1)).toBe(40);
    expect(lookupWinProb(t, 500, 500, 2)).toBe(40);
    expect(lookupWinProb(t, 20, 12, 10)).toBe(50);
    expect(lookupWinProb(t, 20, 12, 0)).toBe(40); // clamps to 1 wicket
  });
  it("is monotone the way cricket is", () => {
    expect(lookupWinProb(t, 25, 12, 1)).toBeLessThan(lookupWinProb(t, 15, 12, 1));
    expect(lookupWinProb(t, 25, 18, 1)).toBeGreaterThan(lookupWinProb(t, 25, 9, 1));
    expect(lookupWinProb(t, 25, 12, 2)).toBeGreaterThan(lookupWinProb(t, 25, 12, 1));
  });
});
