import { describe, expect, it } from "vitest";
import { batCareer, bowlCareer, mostDramatic } from "./player";
import type { PlayerFile } from "./types";

const p: PlayerFile = {
  id: "x",
  name: "X Y",
  bat: [
    [2024, 10, 100, 150, 5, 10, 8],
    [2025, 5, 50, 50, 5, 2, 1],
  ],
  bowl: [[2025, 4, 48, 60, 3]],
};

describe("player career", () => {
  it("sums batting seasons and derives rates", () => {
    const c = batCareer(p)!;
    expect(c).toMatchObject({ innings: 15, balls: 150, runs: 200, outs: 10, fours: 12, sixes: 9 });
    expect(c.sr).toBeCloseTo(133.33, 1);
    expect(c.avg).toBe("20.0");
  });
  it("sums bowling and handles missing disciplines", () => {
    expect(bowlCareer(p)).toMatchObject({ matches: 4, balls: 48, wickets: 3, econ: 7.5 });
    expect(bowlCareer({ ...p, bowl: [] })).toBeNull();
    expect(batCareer({ ...p, bat: [] })).toBeNull();
  });
  it("ranks modelled matches by drama", () => {
    const list = [
      { id: "a", p: true, d: 1.2 },
      { id: "b", p: false, d: 9 },
      { id: "c", p: true, d: 2.5 },
    ];
    expect(mostDramatic(list, 5).map((m) => m.id)).toEqual(["c", "a"]);
  });
});
