import { describe, expect, it } from "vitest";
import { exactHit } from "./AirportField";

const hits = [
  { iata: "SFO", name: "San Francisco International", city: "San Francisco", state: "CA" },
  { iata: "OAK", name: "Oakland International", city: "Oakland", state: "CA" },
];

describe("exactHit", () => {
  it("treats a typed code as picked, whatever the case or spacing", () => {
    expect(exactHit("SFO", hits)?.iata).toBe("SFO");
    expect(exactHit(" oak ", hits)?.iata).toBe("OAK");
  });
  it("does not guess from a city name or a partial code", () => {
    expect(exactHit("San Francisco", hits)).toBeUndefined();
    expect(exactHit("SF", hits)).toBeUndefined();
  });
});
