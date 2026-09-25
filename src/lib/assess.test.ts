// End-to-end over the pipeline with the test providers (real captured payloads, plus one
// invented storm for the SEVERE path). No network.
// Assertions avoid BTS numbers so the test survives a data rebuild.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { assess, InputError } from "./assess";
import { blizzardProvider, replayProvider } from "@/test/providers";

beforeAll(() => { vi.stubEnv("OPENAI_API_KEY", ""); });

const recorded = replayProvider;

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

  it("reads the whole day, and does not count current destination weather against an unknown arrival", async () => {
    const a = await assess({ origin: "JFK", destination: "SFO", date: "2026-09-25" }, recorded());
    expect(a.level).toBe("HIGH"); // the evening gusts at JFK are inside the day
    const sfoNow = a.evidence.find((e) => e.source === "metar" && e.airport === "SFO");
    expect(sfoNow?.ignoredBecause).toContain("arrival time is unknown");
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

describe("blizzard test double", () => {
  it("is SEVERE because of the ground stop at the destination", async () => {
    const a = await assess({ origin: "BOS", destination: "ORD", date: "2027-01-14" }, blizzardProvider());
    expect(a.level).toBe("SEVERE");
    expect(a.actions[0]).toMatch(/Contact the traveler now/);
  });
});
