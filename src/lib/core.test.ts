import { describe, expect, it } from "vitest";
import { daysBetween, horizonFor, localDate, zonedInstant, btsTime } from "./time";
import { guardDraft } from "./narrate";
import { btsRouteRules, EvidenceBook, faaRules } from "./rules";
import type { FaaSnapshot } from "./sources/faa";
import type { Stats } from "./data";

describe("dates are local to the origin airport", () => {
  it("02:00 UTC on the 26th is still the 25th in New York", () => {
    const at = new Date("2026-09-26T02:00:00Z");
    expect(localDate(at, "America/New_York")).toBe("2026-09-25");
    expect(localDate(at, "Asia/Singapore")).toBe("2026-09-26");
  });

  it("converts a local wall-clock time across DST", () => {
    expect(zonedInstant("2026-07-01", "08:00", "America/Los_Angeles").toISOString()).toBe("2026-07-01T15:00:00.000Z");
    expect(zonedInstant("2026-12-01", "08:00", "America/Los_Angeles").toISOString()).toBe("2026-12-01T16:00:00.000Z");
    expect(zonedInstant("2026-03-08", "12:00", "America/New_York").toISOString()).toBe("2026-03-08T16:00:00.000Z");
  });

  it("reads BTS hhmm times", () => {
    expect(btsTime("745")).toBe("07:45");
    expect(btsTime("2400")).toBe("23:59");
    expect(btsTime("")).toBeUndefined();
  });

  it("counts calendar days", () => {
    expect(daysBetween("2026-09-25", "2026-10-02")).toBe(7);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("horizon: what each source can say about a date", () => {
  it("uses FAA status for today only — never for tomorrow", () => {
    expect(horizonFor(0, "2026-09-25").applicable.faa).toBe(true);
    expect(horizonFor(1, "2026-09-26").applicable.faa).toBe(false);
    expect(horizonFor(1, "2026-09-26").applicable.taf).toBe(true);
  });

  it("falls back to history beyond a week, with a re-check date", () => {
    const h = horizonFor(20, "2026-10-15");
    expect(h.regime).toBe("beyond");
    expect(h.applicable["nws-forecast"]).toBe(false);
    expect(h.applicable["bts-route"]).toBe(true);
    expect(h.recheck).toContain("2026-10-09");
  });
});

const snap = (xmlEvents: FaaSnapshot["events"]): FaaSnapshot => ({ updatedAt: "t", events: xmlEvents });

describe("FAA rules: where the program sits matters", () => {
  const gdp = { kind: "ground-delay" as const, airport: "SFO", reason: "low ceilings", avgMin: 44, maxMin: 94, raw: "" };

  it("a GDP at the destination is a direct hit, at the origin one level lower", () => {
    const dest = new EvidenceBook();
    faaRules(dest, snap([gdp]), "SFO", "destination");
    const orig = new EvidenceBook();
    faaRules(orig, snap([{ ...gdp, avgMin: 114 }]), "SFO", "origin");
    expect(dest.factors[0].level).toBe("MODERATE");
    expect(orig.factors[0].level).toBe("MODERATE"); // 114 min would be HIGH at the destination
  });

  it("a ground stop at the destination is SEVERE", () => {
    const b = new EvidenceBook();
    faaRules(b, snap([{ kind: "ground-stop", airport: "ORD", reason: "snow", raw: "" }]), "ORD", "destination");
    expect(b.factors[0].level).toBe("SEVERE");
  });

  it("an ignored listing produces evidence but no factor", () => {
    const b = new EvidenceBook();
    faaRules(b, snap([{ kind: "closure", airport: "LAX", reason: "GA", ignoredBecause: "GA only", raw: "" }]), "LAX", "origin");
    expect(b.factors).toEqual([]);
    expect(b.items[0].ignoredBecause).toBe("GA only");
  });

  it("no event is positive evidence", () => {
    const b = new EvidenceBook();
    faaRules(b, snap([]), "JFK", "origin");
    expect(b.items[0].title).toContain("No FAA program");
  });
});

describe("history is a prior, capped at MODERATE", () => {
  const national: Stats = [100000, 20000, 1500, 200, 300, 5000];
  it("flags a fragile route but never above MODERATE", () => {
    const b = new EvidenceBook();
    btsRouteRules(b, [500, 250, 60, 5, 30, 150], national, "EWR", "SFO", 12, "w");
    expect(b.factors.map((f) => f.level)).toEqual(["MODERATE"]);
  });
  it("says nothing on an ordinary route", () => {
    const b = new EvidenceBook();
    btsRouteRules(b, [500, 90, 5, 1, 0, 40], national, "JFK", "SFO", 5, "w");
    expect(b.factors).toEqual([]);
    expect(b.items).toHaveLength(1);
  });
  it("turns a missing nonstop into a stated gap", () => {
    const b = new EvidenceBook();
    expect(btsRouteRules(b, undefined, national, "BTV", "SAN", 3, "w")).toBe("no-route");
    expect(b.factors[0].summary).toContain("connection");
  });
});

describe("LLM guard", () => {
  const ids = new Set(["E1", "E2", "E3"]);
  const ok = { summary: "Ground delay program at SFO [E2].", action: "Call the traveler and protect the 6 pm meeting.", citations: ["E2"] };
  it("accepts a grounded draft", () => expect(guardDraft(ok, "HIGH", ids)).toBeNull());
  it("rejects invented evidence ids", () => expect(guardDraft({ ...ok, citations: ["E9"] }, "HIGH", ids)).toMatch(/E9/));
  it("rejects inline ids that do not exist", () => expect(guardDraft({ ...ok, summary: "Storm [E7]." }, "HIGH", ids)).toMatch(/E7/));
  it("rejects a different level", () => expect(guardDraft({ ...ok, summary: "Low risk overall [E1]." }, "HIGH", ids)).toMatch(/level/));
  it("rejects waving off a HIGH risk", () => expect(guardDraft({ ...ok, action: "No action needed." }, "HIGH", ids)).toMatch(/dismisses/));
  it("rejects a malformed draft instead of crashing", () => {
    expect(guardDraft({ summary: "x [E1]", action: "y" } as never, "LOW", ids)).toBeNull();
    expect(guardDraft({ summary: 3, action: "y", citations: [] } as never, "LOW", ids)).toMatch(/malformed/);
  });
  it("rejects an uncited draft", () => expect(guardDraft({ summary: "Bad weather.", action: "Call.", citations: [] }, "MODERATE", ids)).toMatch(/cited/));
});

describe("a missing month is not a missing route", () => {
  it("does not call a seasonal gap a connection", () => {
    const b = new EvidenceBook();
    expect(btsRouteRules(b, undefined, [1, 0, 0, 0, 0, 0], "JFK", "SFO", 9, "w", [7])).toBe("no-month");
    expect(b.factors).toEqual([]);
    expect(b.items[0].title).toContain("No September history");
  });
});
