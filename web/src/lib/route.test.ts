import { describe, expect, it } from "vitest";
import { legacyHashToPath, parsePath } from "./route";

describe("parsePath", () => {
  it("reads page and argument", () => {
    expect(parsePath("/replay/1082591")).toEqual({ page: "replay", arg: "1082591" });
    expect(parsePath("/player/ba607b88/")).toEqual({ page: "player", arg: "ba607b88" });
    expect(parsePath("/model")).toEqual({ page: "model", arg: undefined });
    expect(parsePath("/whatif")).toEqual({ page: "whatif", arg: undefined });
  });
  it("falls back to the replay page", () => {
    expect(parsePath("/")).toEqual({ page: "replay", arg: undefined });
    expect(parsePath("/nonsense/42")).toMatchObject({ page: "replay" });
  });
});

describe("legacyHashToPath", () => {
  it("redirects old hash links to clean paths", () => {
    expect(legacyHashToPath("#/replay/1082591")).toBe("/replay/1082591");
    expect(legacyHashToPath("#/replay")).toBe("/replay");
    expect(legacyHashToPath("#/explorer")).toBe("/explorer");
    expect(legacyHashToPath("#/model")).toBe("/model");
    expect(legacyHashToPath("#/player/ba607b88")).toBe("/player/ba607b88");
  });
  it("ignores hashes that are not routes", () => {
    expect(legacyHashToPath("")).toBeNull();
    expect(legacyHashToPath("#main")).toBeNull();
  });
  it("sends unknown old routes home", () => {
    expect(legacyHashToPath("#/whatever")).toBe("/");
  });
});
