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
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const f = vi.fn();
    expect(await writeBriefing(base, f as never)).toEqual({ ok: false, reason: "OPENROUTER_API_KEY is not set on the server." });
    expect(f).not.toHaveBeenCalled();
  });

  it("returns a grounded draft, built from the rules' output and never the raw feeds", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubEnv("OPENROUTER_MODEL", "google/gemma-4-31b-it:free");
    const f = reply({ summary: "Strong gusts at JFK during the day [E1].", steps: ["Call the traveler before they leave."], citations: ["E1"] });
    expect(await writeBriefing(base, f as never)).toEqual({ ok: true, summary: "Strong gusts at JFK during the day [E1].", steps: ["Call the traveler before they leave."], citations: ["E1"], model: "google/gemma-4-31b-it:free" });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("google/gemma-4-31b-it:free");
    expect(body.messages[0].content).toContain("already decided by the rules: HIGH");
    expect(body.messages[1].content.startsWith("<assessment>")).toBe(true);
    expect(body.messages[1].content).not.toContain("rawTAF");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("cleans a reply wrapped in a code fence, with markdown in the strings", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const content = 'Here you go:\n```json\n{"summary":"**Strong gusts** at JFK [E1].","steps":["- *Call* the traveler."],"citations":["E1"]}\n```';
    expect(await writeBriefing(base, reply(content) as never)).toMatchObject({ ok: true, summary: "Strong gusts at JFK [E1].", steps: ["Call the traveler."] });
  });

  it("retries once, telling the model what was wrong, and keeps the good second draft", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const drafts = ["sorry, I cannot", JSON.stringify({ summary: "Gusts at JFK [E1].", steps: ["Call the traveler."], citations: ["E1"] })];
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: drafts.shift() } }] }), { status: 200 }));
    expect(await writeBriefing(base, f as never)).toMatchObject({ ok: true, summary: "Gusts at JFK [E1]." });
    expect(f).toHaveBeenCalledTimes(2);
    const second = JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(second.messages.at(-1).content).toMatch(/rejected: the reply was not valid JSON/);
  });

  it("throws away a draft that downgrades the level twice, and says why", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const f = reply({ summary: "Low risk overall [E1].", steps: ["Monitor."], citations: ["E1"] });
    expect(await writeBriefing(base, f as never)).toMatchObject({ ok: false, reason: expect.stringMatching(/rejected twice: text states a risk level other than HIGH/) });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("throws away a draft that cites evidence that does not exist", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const b = await writeBriefing(base, reply({ summary: "Storm at SFO [E9].", steps: ["Rebook."], citations: ["E9"] }) as never);
    expect(b).toMatchObject({ ok: false, reason: expect.stringContaining("E9") });
  });

  it("reports an API error in one readable line, without retrying", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const f = vi.fn(async () => new Response('{"error":{"message":"Rate limit exceeded: free-models-per-min"}}', { status: 429 }));
    expect(await writeBriefing(base, f as never)).toEqual({ ok: false, reason: "model API 429: Rate limit exceeded: free-models-per-min" });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("OPENROUTER_BASE_URL", () => {
  const ok = { summary: "Gusts at JFK [E1].", steps: ["Call the traveler."], citations: ["E1"] };

  it("sends the request to the configured base, for a proxy or a local stand-in", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubEnv("OPENROUTER_BASE_URL", "http://127.0.0.1:3231/v1/");
    const f = reply(ok);
    await writeBriefing(base, f as never);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("http://127.0.0.1:3231/v1/chat/completions");
  });

  it("defaults to OpenRouter and the free Gemma model", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const f = reply(ok);
    await writeBriefing(base, f as never);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(JSON.parse(init.body as string).model).toBe("google/gemma-4-31b-it:free");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-test");
  });
});
