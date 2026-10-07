import { describe, expect, it } from "vitest";
import { average, ballLabel, economy, formatDate, formatOvers, pct, ratio, shortDate, signedPct, strikeRate } from "./format";

describe("format", () => {
  it("formats overs the cricket way", () => {
    expect(formatOvers(0)).toBe("0.0");
    expect(formatOvers(119)).toBe("19.5");
    expect(formatOvers(120)).toBe("20.0");
  });
  it("labels the last ball bowled", () => {
    expect(ballLabel(1)).toBe("0.1");
    expect(ballLabel(107)).toBe("17.5");
    expect(ballLabel(120)).toBe("19.6");
    expect(ballLabel(0)).toBe("0.1");
  });
  it("formats dates without timezone drift", () => {
    expect(formatDate("2026-04-02")).toBe("2 Apr 2026");
    expect(shortDate("2008-12-31")).toBe("31 Dec");
  });
  it("formats probabilities", () => {
    expect(pct(625)).toBe("63%");
    expect(signedPct(0.314)).toBe("+31%");
    expect(signedPct(-0.156)).toBe("−16%");
    expect(signedPct(0)).toBe("0%");
  });
  it("computes rates and guards against zero", () => {
    expect(strikeRate(50, 25)).toBe(200);
    expect(strikeRate(5, 0)).toBe(0);
    expect(economy(24, 12)).toBe(12);
    expect(average(100, 4)).toBe("25.0");
    expect(average(100, 0)).toBe("—");
    expect(ratio(1, 4)).toBe("25%");
    expect(ratio(0, 0)).toBe("—");
  });
});
