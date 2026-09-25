import { describe, expect, it } from "vitest";
import { popularAirports, searchAirports } from "./search";

const codes = (q: string) => searchAirports(q).map((h) => h.iata);

describe("airport search", () => {
  it("a city returns its metro airports, primary first", () => {
    expect(codes("new york").slice(0, 3)).toEqual(["JFK", "LGA", "EWR"]);
    expect(codes("bay area").slice(0, 3)).toEqual(["SFO", "OAK", "SJC"]);
  });
  it("matches word starts, not substrings", () => {
    expect(codes("chi")).not.toContain("ICT");
    expect(codes("ORD")[0]).toBe("ORD");
    expect(codes("ORD")).not.toContain("GRR");
  });
  it("returns nothing for nonsense", () => expect(codes("xyzq")).toEqual([]));
  it("an empty field suggests the busiest airports", () => {
    const top = popularAirports().map((h) => h.iata);
    expect(top).toHaveLength(8);
    expect(top).toContain("ATL");
    expect(codes("")).toEqual([]);
  });
});
