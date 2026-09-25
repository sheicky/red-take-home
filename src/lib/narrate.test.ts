import { afterEach, describe, expect, it, vi } from "vitest";
import { narrate } from "./narrate";
import type { Assessment } from "./types";

// A minimal HIGH assessment: one factor, two pieces of evidence.
const base = {
  request: { origin: "JFK", destination: "SFO", date: "2026-09-25" },
  origin: { iata: "JFK", city: "New York" }, destination: { iata: "SFO", city: "San Francisco" },
  horizon: { daysAhead: 0, regime: "today", applicable: {} },
  windows: [], level: "HIGH", confidence: { level: "HIGH", reasons: [] },
  factors: [{ id: "F1", level: "HIGH", side: "origin", summary: "Gusts 38 kt at JFK.", evidence: ["E1"] }],
  evidence: [
    { id: "E1", source: "taf", title: "TAF KJFK", detail: "…", url: "u" },
    { id: "E2", source: "faa", title: "No FAA program at JFK", detail: "…", url: "u" },
  ],
  actions: ["Contact the traveler proactively."], alternates: [], sources: [], adjustments: [], generatedAt: "t",
} as unknown as Omit<Assessment, "narrative">;

const reply = (content: object) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 }));

afterEach(() => { vi.unstubAllEnvs(); });

describe("narrate", () => {
  it("uses the template when no key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const f = vi.fn();
    const n = await narrate(base, f as never);
    expect(n.by).toBe("template");
    expect(f).not.toHaveBeenCalled();
  });

  it("shows a grounded LLM draft and never sends raw feeds", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const f = reply({ summary: "Strong gusts at JFK this evening [E1].", action: "Call the traveler; offer the 3 pm departure.", citations: ["E1"] });
    const n = await narrate(base, f as never);
    expect(n).toMatchObject({ by: "llm", citations: ["E1"] });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[0].content).toContain("already decided: HIGH");
    expect(body.messages[1].content).not.toContain("rawTAF");
  });

  it("throws away a draft that downgrades the level, and says why", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const n = await narrate(base, reply({ summary: "Low risk overall [E1].", action: "Monitor.", citations: ["E1"] }) as never);
    expect(n.by).toBe("template");
    expect(n.rejectedReason).toMatch(/risk level other than HIGH/);
  });

  it("falls back on an API error without failing the assessment", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const f = vi.fn(async () => new Response("quota", { status: 429 }));
    const n = await narrate(base, f as never);
    expect(n.by).toBe("template");
    expect(n.rejectedReason).toContain("429");
  });
});
