import { describe, expect, it } from "vitest";
import { rank } from "./search";

const opts = ["V Kohli", "Virat Singh", "AB de Villiers", "RG Sharma", "Rohit Kohli Jr", "K Kohli"].map((label, i) => ({ id: String(i), label }));

describe("rank", () => {
  it("puts prefix matches first, then word starts, then substrings", () => {
    expect(rank(opts, "ko", 10).map((o) => o.label)).toEqual(["V Kohli", "Rohit Kohli Jr", "K Kohli"]);
    expect(rank(opts, "k", 10)[0].label).toBe("K Kohli"); // prefix beats word match
    expect(rank(opts, "v", 10)[0].label).toBe("V Kohli");
    expect(rank(opts, "ill", 10).map((o) => o.label)).toEqual(["AB de Villiers"]);
  });
  it("is case-insensitive, trims, and respects the limit", () => {
    expect(rank(opts, "  KOHLI ", 10)).toHaveLength(3);
    expect(rank(opts, "kohli", 2)).toHaveLength(2);
    expect(rank(opts, "", 4)).toHaveLength(4);
  });
  it("returns nothing for no match", () => {
    expect(rank(opts, "zzz", 5)).toEqual([]);
  });
});
