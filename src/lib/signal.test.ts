// The result page shows each factor as a tile: a short cause, one number, and where it came from.
// These tests pin every summary template the rules emit, then run the real pipeline so a
// rewording in rules.ts turns this file red instead of quietly degrading the tiles.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { assess } from "./assess";
import { blizzardProvider, replayProvider } from "@/test/providers";
import { groupSignals, signalOf } from "./signal";
import type { Evidence, Factor, Level, SourceId } from "./types";

const make = (source: SourceId, summary: string, side: Factor["side"] = "origin", level: Level = "MODERATE") => {
  const ev: Evidence = { id: "E1", source, title: "", detail: "", url: "" };
  const f: Factor = { id: "F1", level, side, airport: "JFK", summary, evidence: ["E1"] };
  return signalOf(f, [ev]);
};

describe("signalOf, one template at a time", () => {
  it("ground delay program: average hold", () => {
    expect(make("faa", "Ground delay program for SFO (low ceilings): flights to SFO are held before departure, avg 44 min, max 94 min.", "destination"))
      .toEqual({ cause: "Ground delay", metric: "44 min avg", basis: "FAA" });
  });

  it("ground delay program at the origin", () => {
    expect(make("faa", "Ground delay program on arrivals into JFK (wind, avg 60 min): knock-on delays to departures possible."))
      .toEqual({ cause: "Ground delay", metric: "60 min avg", basis: "FAA" });
  });

  it("ground stop: until when", () => {
    expect(make("faa", "Ground stop for flights to ORD (snow/ice [TEST]): flights bound there are held at their origin until ~11:00 am CST.", "destination", "SEVERE"))
      .toEqual({ cause: "Ground stop", metric: "until 11:00 am CST", basis: "FAA" });
  });

  it("ground stop without an end time", () => {
    expect(make("faa", "Ground stop for arrivals into JFK (weather): inbound aircraft are held, so departures may leave late."))
      .toEqual({ cause: "Ground stop", basis: "FAA" });
  });

  it("airport-wide delays: the range", () => {
    expect(make("faa", "Departure delays at JFK: 15–45 min, increasing (volume)."))
      .toEqual({ cause: "Departure delays", metric: "15–45 min", basis: "FAA" });
  });

  it("closure", () => {
    expect(make("faa", "FAA lists JFK as closed (reopen May 28): runway work"))
      .toEqual({ cause: "Closed", basis: "FAA" });
  });

  it("forecast wind: the strongest gust across all periods", () => {
    expect(make("taf", "Airport forecast for JFK (local time): gusts of 31 kt (36 mph) from 2 to 7 pm; gusts of 38 kt (44 mph) from 7 to 11 pm."))
      .toEqual({ cause: "Wind", metric: "gusts 44 mph", basis: "Forecast" });
  });

  it("forecast low cloud: the lowest ceiling", () => {
    expect(make("taf", "Airport forecast for SFO (local time): low cloud (cloud base 600 ft, visibility 6 miles) from 8 to 10 am."))
      .toEqual({ cause: "Low cloud", metric: "cloud at 600 ft", basis: "Forecast" });
  });

  it("snow outranks wind as the cause, gusts stay the number", () => {
    expect(make("taf", "Airport forecast for ORD (local time): heavy or blowing snow, gusts of 45 kt (52 mph), very low cloud or fog (cloud base 400 ft, visibility 0.25 miles) from 7 am to 12 am."))
      .toEqual({ cause: "Snow", metric: "gusts 52 mph", basis: "Forecast" });
  });

  it("thunderstorms and freezing rain", () => {
    expect(make("taf", "Airport forecast for ATL (local time): thunderstorms from 3 to 6 pm.").cause).toBe("Storms");
    expect(make("taf", "Airport forecast for DEN (local time): freezing rain or ice pellets, so every plane needs de-icing from 6 to 9 am.").cause).toBe("Freezing rain");
  });

  it("current observation", () => {
    expect(make("metar", "Right now at JFK: gusts of 32 kt (37 mph)."))
      .toEqual({ cause: "Wind", metric: "gusts 37 mph", basis: "Now" });
  });

  it("NWS forecast in mph", () => {
    expect(make("nws-forecast", "Weather service forecast for JFK. Tonight: wind up to 33 mph."))
      .toEqual({ cause: "Wind", metric: "wind 33 mph", basis: "NWS forecast" });
  });

  it("NWS forecast fog is its own cause", () => {
    expect(make("nws-forecast", "Weather service forecast for LAX. Saturday Night: patchy fog.", "destination").cause).toBe("Fog");
  });

  it("NWS forecast blizzard", () => {
    expect(make("nws-forecast", "Weather service forecast for ORD. Period 1: blizzard. Period 1: wind up to 45 mph.", "destination"))
      .toEqual({ cause: "Snow", metric: "wind 45 mph", basis: "NWS forecast" });
  });

  it("NWS alert: the event name is the cause", () => {
    expect(make("nws-alerts", "The weather service has a Blizzard Warning in effect for the ORD area on the travel day."))
      .toEqual({ cause: "Blizzard Warning", basis: "NWS alert" });
  });

  it("route history", () => {
    expect(make("bts-route", "Historically fragile in September: 31% late, 2.1% cancelled vs 21% / 1.4% nationally.", "route"))
      .toEqual({ cause: "Often late", metric: "31% late", basis: "History" });
    expect(make("bts-route", "No regular nonstop JFK→BOI: a connection adds a second airport and a missed-connection risk this tool does not score.", "route"))
      .toEqual({ cause: "No nonstop", basis: "History" });
  });
});

describe("groupSignals", () => {
  const ev = (id: string, source: SourceId): Evidence => ({ id, source, title: "", detail: "", url: "" });
  const f = (id: string, level: Level, summary: string, e: string): Factor => ({ id, level, side: "origin", airport: "JFK", summary, evidence: [e] });

  it("merges factors with the same cause: worst level, first number, every basis once", () => {
    const evidence = [ev("E1", "taf"), ev("E2", "metar"), ev("E3", "nws-alerts"), ev("E4", "nws-forecast")];
    const factors = [
      f("F1", "MODERATE", "Airport forecast for JFK (local time): gusts of 31 kt (36 mph) from 2 to 4:55 pm.", "E1"),
      f("F2", "HIGH", "Right now at JFK: gusts of 32 kt (37 mph).", "E2"),
      f("F3", "MODERATE", "The weather service has a Wind Advisory in effect for the JFK area on the travel day.", "E3"),
      f("F4", "MODERATE", "Weather service forecast for JFK. Tonight: wind up to 33 mph.", "E4"),
    ];
    const g = groupSignals(factors, evidence);
    expect(g.map((x) => [x.cause, x.level, x.metric, x.bases, x.factors.map((y) => y.id)])).toEqual([
      ["Wind", "HIGH", "gusts 37 mph", ["Now", "Forecast", "NWS forecast"], ["F2", "F1", "F4"]],
      ["Wind Advisory", "MODERATE", undefined, ["NWS alert"], ["F3"]],
    ]);
  });

  it("keeps different causes apart, worst first", () => {
    const evidence = [ev("E1", "taf"), ev("E2", "faa")];
    const g = groupSignals([
      f("F1", "MODERATE", "Airport forecast for SFO (local time): low cloud (cloud base 600 ft, visibility 6 miles) from 8 to 10 am.", "E1"),
      f("F2", "HIGH", "Ground delay program for SFO (low ceilings): flights to SFO are held before departure, avg 95 min, max 140 min.", "E2"),
    ], evidence);
    expect(g.map((x) => x.cause)).toEqual(["Ground delay", "Low cloud"]);
  });
});

describe("signalOf over the real pipeline", () => {
  beforeAll(() => { vi.stubEnv("OPENAI_API_KEY", ""); });

  const runs = [
    { req: { origin: "JFK", destination: "SFO", date: "2026-09-25" }, provider: replayProvider },
    { req: { origin: "JFK", destination: "SFO", date: "2026-09-26" }, provider: replayProvider },
    { req: { origin: "BOS", destination: "ORD", date: "2027-01-14" }, provider: blizzardProvider },
  ];

  for (const { req, provider } of runs) {
    it(`every factor gets a short cause (${req.origin}→${req.destination} ${req.date})`, async () => {
      const a = await assess(req, provider());
      expect(a.factors.length).toBeGreaterThan(0);
      for (const f of a.factors) {
        const s = signalOf(f, a.evidence);
        expect(s.cause.split(" ").length, f.summary).toBeLessThanOrEqual(3);
        expect(s.basis, f.summary).not.toBe("");
      }
    });
  }
});
