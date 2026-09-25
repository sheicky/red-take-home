// End-to-end over the pipeline with the recorded and synthetic providers — no network.
// Assertions avoid BTS numbers so the test survives a data rebuild.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { assess, InputError } from "./assess";
import { scenarioById } from "./scenarios";

beforeAll(() => { vi.stubEnv("OPENAI_API_KEY", ""); });

const recorded = () => scenarioById("recorded-2026-09-25")!.provider();

describe("recorded 2026-09-25, JFK → SFO", () => {
  it("is HIGH, with the SFO ground delay program as a destination factor", async () => {
    const a = await assess({ origin: "JFK", destination: "SFO", date: "2026-09-25" }, recorded());
    expect(a.level).toBe("HIGH");
    expect(a.factors.find((f) => f.side === "destination" && f.summary.startsWith("Ground delay program for SFO"))?.level).toBe("MODERATE");
    expect(a.sources.find((s) => s.source === "faa")?.state).toBe("ok");
    expect(a.narrative.by).toBe("template");
  });

  it("shows but does not count the flood/surf alerts", async () => {
    const a = await assess({ origin: "JFK", destination: "SFO", date: "2026-09-25" }, recorded());
    const ignored = a.evidence.filter((e) => e.source === "nws-alerts" && e.ignoredBecause).map((e) => e.title);
    expect(ignored.some((t) => t.startsWith("Coastal Flood Warning"))).toBe(true);
    expect(a.factors.some((f) => f.summary.includes("Coastal Flood"))).toBe(false);
  });

  it("scores the other New York and Bay Area airports as alternates", async () => {
    const a = await assess({ origin: "JFK", destination: "SFO", date: "2026-09-25" }, recorded());
    expect(a.alternates.map((x) => x.airport).sort()).toEqual(["EWR", "LGA", "OAK", "SJC"]);
    expect(a.alternates.find((x) => x.airport === "LGA")!.reasons.join(" ")).toContain("Ground delay program");
  });

  it("does not use today's FAA snapshot for tomorrow", async () => {
    const a = await assess({ origin: "JFK", destination: "SFO", date: "2026-09-26" }, recorded());
    expect(a.sources.find((s) => s.source === "faa")?.state).toBe("not-applicable");
    expect(a.factors.some((f) => f.summary.includes("Ground delay program"))).toBe(false);
  });

  it("flags a flight number that does not fly the route, without blocking", async () => {
    const a = await assess({ origin: "JFK", destination: "SFO", date: "2026-09-25", flight: "UA1234" }, recorded());
    expect(a.flight?.matchesRoute).toBe(false);
    expect(a.factors.some((f) => f.side === "flight" && f.summary.includes("not known on JFK→SFO"))).toBe(true);
    expect(a.level).toBe("HIGH");
  });

  it("a real flight number narrows the weather to its schedule and outvotes a stale adsbdb route", async () => {
    const a = await assess({ origin: "JFK", destination: "SFO", date: "2026-09-25", flight: "DL 679" }, recorded());
    expect(a.flight).toMatchObject({ matchesRoute: true, scheduledDeparture: "14:55", adsbdbRoute: { o: "ATL", d: "SEA" } });
    expect(a.windows[0].basis).toBe("scheduled-time");
    expect(a.level).toBe("MODERATE"); // the evening gusts (after 19:00) no longer count
    expect(a.evidence.find((e) => e.source === "adsbdb")?.ignoredBecause).toContain("BTS history");
  });

  it("refuses a date already past at the origin", async () => {
    await expect(assess({ origin: "JFK", destination: "SFO", date: "2026-09-24" }, recorded())).rejects.toBeInstanceOf(InputError);
  });

  it("an unreachable source lowers confidence instead of failing", async () => {
    const p = { ...recorded(), faaStatusXml: () => Promise.reject(new Error("503 from nasstatus.faa.gov")) };
    const a = await assess({ origin: "JFK", destination: "SFO", date: "2026-09-25" }, p);
    expect(a.sources.find((s) => s.source === "faa")).toMatchObject({ state: "error", note: "503 from nasstatus.faa.gov" });
    expect(a.confidence.level).toBe("MEDIUM");
    expect(a.confidence.reasons.join(" ")).toContain("faa");
  });
});

describe("synthetic blizzard", () => {
  it("is SEVERE because of the ground stop at the destination", async () => {
    const a = await assess({ origin: "BOS", destination: "ORD", date: "2027-01-14" }, scenarioById("synthetic-blizzard")!.provider());
    expect(a.level).toBe("SEVERE");
    expect(a.actions[0]).toMatch(/Contact the traveler now/);
  });
});
