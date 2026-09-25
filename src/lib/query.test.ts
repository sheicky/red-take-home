// The trip lives in the URL: the form navigates, the page reads it back and streams the result.
// A shareable link is a side effect Ops will like.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { requestFromParams, searchFor } from "./query";
import { runAssessment } from "./run";

describe("requestFromParams", () => {
  it("reads a full trip", () => {
    expect(requestFromParams({ from: "jfk", to: "sfo", date: "2026-09-25", flight: " DL 679 ", data: "recorded-2026-09-25" }))
      .toEqual({ origin: "JFK", destination: "SFO", date: "2026-09-25", flight: "DL 679", scenario: "recorded-2026-09-25" });
  });

  it("drops empty optional fields", () => {
    expect(requestFromParams({ from: "BOS", to: "ORD", date: "2027-01-14", flight: "", data: "" }))
      .toEqual({ origin: "BOS", destination: "ORD", date: "2027-01-14" });
  });

  it("is null until the three required fields are there", () => {
    expect(requestFromParams({})).toBeNull();
    expect(requestFromParams({ from: "JFK", to: "SFO" })).toBeNull();
    expect(requestFromParams({ from: "JFK", date: "2026-09-25" })).toBeNull();
  });

  it("takes the first value when a key repeats", () => {
    expect(requestFromParams({ from: ["JFK", "LGA"], to: "SFO", date: "2026-09-25" })?.origin).toBe("JFK");
  });
});

describe("searchFor", () => {
  it("round-trips through requestFromParams", () => {
    const req = { origin: "JFK", destination: "SFO", date: "2026-09-25", flight: "DL 679", scenario: "recorded-2026-09-25" };
    const back = requestFromParams(Object.fromEntries(new URLSearchParams(searchFor(req))));
    expect(back).toEqual(req);
  });

  it("leaves out what is empty", () => {
    expect(searchFor({ origin: "JFK", destination: "SFO", date: "2026-09-25", flight: "" })).toBe("from=JFK&to=SFO&date=2026-09-25");
  });
});

describe("runAssessment", () => {
  beforeAll(() => { vi.stubEnv("OPENAI_API_KEY", ""); });

  it("refuses an unknown data set by name", async () => {
    expect(await runAssessment({ origin: "JFK", destination: "SFO", date: "2026-09-25", scenario: "nope" }))
      .toEqual({ ok: false, status: 400, error: 'Unknown scenario "nope".' });
  });

  it("turns an input problem into a 400 with the message", async () => {
    const r = await runAssessment({ origin: "XXX", destination: "SFO", date: "2026-09-25", scenario: "recorded-2026-09-25" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("labels a replay with its scenario", async () => {
    const r = await runAssessment({ origin: "JFK", destination: "SFO", date: "2026-09-25", scenario: "recorded-2026-09-25" });
    expect(r.ok && r.assessment.scenario?.id).toBe("recorded-2026-09-25");
  });
});
