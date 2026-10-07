import { describe, expect, it } from "vitest";
import { topBatters, deathBowlers } from "./explorer";
import { describeReplay, shapeReplay } from "./replay";
import type { Chase } from "./types";

const chase: Chase = {
  team: "Beta",
  target: 10,
  modelled: true,
  // step 2 is a wide: the legal ball count stays at 1
  balls: [0, 1, 1, 2, 3],
  runs: [0, 4, 5, 5, 8],
  wickets: [0, 0, 0, 1, 1],
  wp: [500, 620, 640, 400, 700],
  swings: [
    { step: 3, kind: "wicket", label: "W Smith", delta: -0.24, text: "Smith out" },
    { step: 4, start: 2, kind: "over", label: "Ov 1", delta: 0.3, text: "Over 1" },
  ],
};

describe("shapeReplay", () => {
  it("converts per-mille to percent and keeps one point per delivery", () => {
    const { points } = shapeReplay(chase);
    expect(points).toHaveLength(5);
    expect(points.map((p) => p.wp)).toEqual([50, 62, 64, 40, 70]);
  });
  it("nudges x for deliveries that share a legal ball so the line never overlaps itself", () => {
    const { points } = shapeReplay(chase);
    expect(points[1].x).toBeCloseTo(1 / 6);
    expect(points[2].x).toBeCloseTo(1 / 6 + 0.02);
    const xs = points.map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(new Set(xs).size).toBe(xs.length);
  });
  it("places markers and over bands at the right points", () => {
    const { markers, bands } = shapeReplay(chase);
    expect(markers).toEqual([expect.objectContaining({ step: 3, y: 40, label: "W Smith", kind: "wicket" })]);
    expect(bands).toHaveLength(1);
    expect(bands[0].x1).toBeCloseTo(1 / 6 + 0.02);
    expect(bands[0].x2).toBeCloseTo(3 / 6);
  });
  it("returns nothing for chases without a model", () => {
    expect(shapeReplay({ ...chase, wp: undefined }).points).toEqual([]);
  });
  it("describes the curve for screen readers", () => {
    const text = describeReplay(shapeReplay(chase).points, "Beta");
    expect(text).toContain("starts at 50%");
    expect(text).toContain("ranges from 40% to 70%");
  });
});

describe("explorer aggregation", () => {
  const f = {
    names: { a: "A One", b: "B Two", c: "C Three" },
    rows: [
      ["a", 2024, 100, 150, 4, 10, 8],
      ["a", 2025, 100, 100, 5, 6, 4],
      ["b", 2025, 300, 330, 10, 20, 10],
      ["c", 2025, 20, 60, 1, 5, 5],
    ] as [string, number, number, number, number, number, number][],
  };
  it("filters by season range and minimum balls, sorted by strike rate", () => {
    const all = topBatters(f, 2024, 2025, 50);
    expect(all.map((b) => b.id)).toEqual(["a", "b"]);
    expect(all[0].sr).toBeCloseTo(125);
    expect(topBatters(f, 2025, 2025, 50).map((b) => b.id)).toEqual(["b", "a"]);
    expect(topBatters(f, 2025, 2025, 10).map((b) => b.id)[0]).toBe("c");
  });
  it("ranks death bowlers by economy", () => {
    const rows: [string, number, number, number, number][] = [
      ["a", 2025, 60, 90, 3],
      ["b", 2025, 60, 60, 1],
      ["b", 2024, 60, 60, 2],
    ];
    const out = deathBowlers({ rows }, f.names, 2024, 2025, 100);
    expect(out.map((b) => b.id)).toEqual(["b"]);
    expect(out[0]).toMatchObject({ balls: 120, runs: 120, wickets: 3, econ: 6 });
  });
});
