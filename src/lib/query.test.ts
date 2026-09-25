// The trip lives in the URL: the form navigates, the page reads it back and streams the result.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { replayProvider } from "@/test/providers";
import { requestFromParams, searchFor } from "./query";
import { runAssessment } from "./run";

describe("requestFromParams", () => {
  it("reads a trip and normalizes the codes", () => {
    expect(requestFromParams({ from: "jfk", to: " sfo ", date: "2026-09-25" })).toEqual({ origin: "JFK", destination: "SFO", date: "2026-09-25" });
  });

  it("is null until the three fields are there", () => {
    expect(requestFromParams({})).toBeNull();
    expect(requestFromParams({ from: "JFK", to: "SFO" })).toBeNull();
    expect(requestFromParams({ from: "JFK", date: "2026-09-25" })).toBeNull();
  });

  it("takes the first value when a key repeats, and ignores unknown keys", () => {
    expect(requestFromParams({ from: ["JFK", "LGA"], to: "SFO", date: "2026-09-25", flight: "UA1" })).toEqual({ origin: "JFK", destination: "SFO", date: "2026-09-25" });
  });
});

describe("searchFor", () => {
  it("round-trips through requestFromParams", () => {
    const req = { origin: "JFK", destination: "SFO", date: "2026-09-25" };
    expect(requestFromParams(Object.fromEntries(new URLSearchParams(searchFor(req))))).toEqual(req);
    expect(searchFor(req)).toBe("from=JFK&to=SFO&date=2026-09-25");
  });
});

describe("runAssessment", () => {
  beforeAll(() => { vi.stubEnv("OPENAI_API_KEY", ""); });

  it("turns an input problem into a 400 with the message", async () => {
    expect(await runAssessment({ origin: "XXX", destination: "SFO", date: "2026-09-25" }, replayProvider()))
      .toEqual({ ok: false, status: 400, error: 'Unknown origin airport "XXX".' });
  });

  it("returns the assessment", async () => {
    const r = await runAssessment({ origin: "jfk", destination: "sfo", date: "2026-09-25" }, replayProvider());
    expect(r.ok && r.assessment.origin.iata).toBe("JFK");
  });
});
