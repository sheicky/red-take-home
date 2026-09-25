import { afterEach, describe, expect, it, vi } from "vitest";
import type { Assessment } from "../types";
import { writeBriefing } from "./briefing";

// A minimal HIGH assessment: one factor, two pieces of evidence.
const base = {
  request: { origin: "JFK", destination: "SFO", date: "2026-09-25" },
  origin: { iata: "JFK", city: "New York", name: "JFK" }, destination: { iata: "SFO", city: "San Francisco", name: "SFO" },
  horizon: { daysAhead: 0, regime: "today", applicable: {} },
  windows: [], level: "HIGH", confidence: { level: "HIGH", reasons: [] },
  factors: [{ id: "F1", level: "HIGH", side: "origin", summary: "Gusts 38 kt at JFK.", evidence: ["E1"] }],
  evidence: [
    { id: "E1", source: "taf", title: "TAF KJFK", detail: "…", url: "u" },
    { id: "E2", source: "faa", title: "No FAA program at JFK", detail: "…", url: "u" },
  ],
  actions: ["Contact the traveler proactively."], alternates: [], sources: [], generatedAt: "t",
} as unknown as Assessment;

const reply = (content: object | string) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status: 200 }));

afterEach(() => { vi.unstubAllEnvs(); });

describe("writeBriefing", () => {
  it("is unavailable without a key, says why, and calls nobody", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const f = vi.fn();
    expect(await writeBriefing(base, f as never)).toEqual({ ok: false, reason: "OPENAI_API_KEY is not set on the server." });
    expect(f).not.toHaveBeenCalled();
  });

  it("returns a grounded draft, built from the rules' output and never the raw feeds", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_MODEL", "gpt-5-mini");
    const f = reply({ summary: "Strong gusts at JFK during the day [E1].", action: "Call the traveler before they leave.", citations: ["E1"] });
    expect(await writeBriefing(base, f as never)).toEqual({ ok: true, summary: "Strong gusts at JFK during the day [E1].", action: "Call the traveler before they leave.", citations: ["E1"], model: "gpt-5-mini" });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[0].content).toContain("already decided by the rules: HIGH");
    expect(body.messages[1].content.startsWith("<assessment>")).toBe(true);
    expect(body.messages[1].content).not.toContain("rawTAF");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.reasoning_effort).toBe("low");
  });

  it("throws away a draft that downgrades the level, and says why", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const b = await writeBriefing(base, reply({ summary: "Low risk overall [E1].", action: "Monitor.", citations: ["E1"] }) as never);
    expect(b).toMatchObject({ ok: false, reason: expect.stringMatching(/risk level other than HIGH/) });
  });

  it("throws away a draft that cites evidence that does not exist", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const b = await writeBriefing(base, reply({ summary: "Storm at SFO [E9].", action: "Rebook.", citations: ["E9"] }) as never);
    expect(b).toMatchObject({ ok: false, reason: expect.stringContaining("E9") });
  });

  it("survives a reply that is not JSON", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(await writeBriefing(base, reply("sorry, I cannot") as never)).toMatchObject({ ok: false, reason: expect.stringMatching(/not valid JSON/) });
  });

  it("reports an API error without failing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const f = vi.fn(async () => new Response("quota", { status: 429 }));
    expect(await writeBriefing(base, f as never)).toMatchObject({ ok: false, reason: expect.stringContaining("429") });
  });
});

describe("OPENAI_BASE_URL", () => {
  it("sends the request to the configured base, for a proxy or a local stand-in", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:3231/v1/");
    const f = reply({ summary: "Gusts at JFK [E1].", action: "Call the traveler.", citations: ["E1"] });
    await writeBriefing(base, f as never);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("http://127.0.0.1:3231/v1/chat/completions");
  });

  it("defaults to OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const f = reply({ summary: "Gusts at JFK [E1].", action: "Call the traveler.", citations: ["E1"] });
    await writeBriefing(base, f as never);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://api.openai.com/v1/chat/completions");
  });
});
