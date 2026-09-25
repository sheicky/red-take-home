import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { notamEnd, parseDuration, parseFaa, parseReopen } from "./faa";
import { ceilingOf, conditionHits, parseTafs, parseVisib } from "./awc";
import { classifyAlert, forecastHits, parseAlerts } from "./nws";

const fx = (...p: string[]) => fs.readFileSync(path.join(__dirname, "../../../fixtures", ...p), "utf8");
const NOW = new Date("2026-09-25T16:12:33Z");

describe("FAA NAS status (real payloads, 2026-09-25)", () => {
  const snap = parseFaa(fx("recorded-2026-09-25", "faa.xml"), NOW);

  it("reads both ground delay programs with their minutes", () => {
    const gdp = snap.events.filter((e) => e.kind === "ground-delay");
    expect(gdp.map((e) => [e.airport, e.avgMin, e.maxMin])).toEqual([["SFO", 44, 94], ["LGA", 114, 186]]);
  });

  it("does not count GA-only NOTAM closures as airport closures", () => {
    const closures = snap.events.filter((e) => e.kind === "closure");
    expect(closures.map((e) => e.airport)).toEqual(["LAX", "SAN"]);
    expect(closures.every((e) => e.ignoredBecause?.includes("non-scheduled"))).toBe(true);
  });

  it("reads the arrival/departure delay section captured minutes later", () => {
    const s = parseFaa(fx("faa-samples", "2026-09-25T1620Z-arr-dep.xml"), NOW);
    const d = s.events.find((e) => e.kind === "arr-dep-delay")!;
    expect(d).toMatchObject({ airport: "LAS", direction: "Departure", minMin: 16, maxMin: 30, trend: "Increasing" });
  });

  it("takes the NOTAM's own end date over the yearless 'Reopen' text", () => {
    // Feed said "Reopen: May 28 at 16:00 UTC." — the NOTAM range says May 28 **2027**.
    const reason = "!LAX 05/277 LAX AD AP CLSD TO NON SKED TRANSIENT GA ACFT 2605271826-2705281600";
    expect(notamEnd(reason)?.toISOString()).toBe("2027-05-28T16:00:00.000Z");
    expect(parseReopen("May 28 at 16:00 UTC.", NOW)?.toISOString()).toBe("2026-05-28T16:00:00.000Z"); // the trap
  });

  it("flags a real closure that has already ended", () => {
    const xml = `<AIRPORT_STATUS_INFORMATION><Update_Time>x</Update_Time><Delay_type><Name>Airport Closures</Name><Airport_Closure_List>
      <Airport><ARPT>BOS</ARPT><Reason>!BOS AD AP CLSD 2609200000-2609210000</Reason><Reopen>Sep 21 at 00:00 UTC.</Reopen></Airport>
      <Airport><ARPT>DEN</ARPT><Reason>!DEN AD AP CLSD SNOW 2609251500-2609260300</Reason><Reopen>Sep 26 at 03:00 UTC.</Reopen></Airport>
    </Airport_Closure_List></Delay_type></AIRPORT_STATUS_INFORMATION>`;
    const [bos, den] = parseFaa(xml, NOW).events;
    expect(bos.ignoredBecause).toMatch(/ended/);
    expect(den.ignoredBecause).toBeUndefined();
  });

  it("keeps a long closure whose yearless 'Reopen' looks past", () => {
    // Same shape as the real LAX listing, minus the GA-only wording: must still count.
    const xml = `<AIRPORT_STATUS_INFORMATION><Delay_type><Name>Airport Closures</Name><Airport_Closure_List>
      <Airport><ARPT>HNL</ARPT><Reason>!HNL AD AP CLSD RWY WORK 2605271826-2705281600</Reason><Reopen>May 28 at 16:00 UTC.</Reopen></Airport>
    </Airport_Closure_List></Delay_type></AIRPORT_STATUS_INFORMATION>`;
    expect(parseFaa(xml, NOW).events[0].ignoredBecause).toBeUndefined();
  });

  it("keeps an unknown program type visible instead of dropping it", () => {
    const xml = `<AIRPORT_STATUS_INFORMATION><Delay_type><Name>Deicing</Name><Deicing_List><Item><ARPT>MSP</ARPT></Item></Deicing_List></Delay_type></AIRPORT_STATUS_INFORMATION>`;
    expect(parseFaa(xml, NOW).events).toMatchObject([{ kind: "other", airport: "MSP" }]);
  });

  it("parses FAA durations", () => {
    expect(parseDuration("1 hour and 54 minutes")).toBe(114);
    expect(parseDuration("2 hours")).toBe(120);
    expect(parseDuration("44 minutes")).toBe(44);
    expect(parseDuration("soon")).toBeUndefined();
  });
});

describe("TAF / METAR", () => {
  it("parses visibility forms", () => {
    expect(parseVisib("6+")).toBe(6);
    expect(parseVisib("1/2")).toBe(0.5);
    expect(parseVisib("1 1/2")).toBe(1.5);
    expect(parseVisib(4)).toBe(4);
    expect(parseVisib("")).toBeUndefined();
  });

  it("takes the lowest broken/overcast layer as ceiling, not FEW/SCT", () => {
    expect(ceilingOf([{ cover: "FEW", base: 200 }, { cover: "BKN", base: 600 }, { cover: "OVC", base: 1800 }], null)).toBe(600);
    expect(ceilingOf([{ cover: "SCT", base: 600 }], null)).toBeUndefined();
    expect(ceilingOf([], 400)).toBe(400);
  });

  it("a PROB group without clouds does not erase the ceiling", () => {
    const tafs = parseTafs(JSON.parse(fx("recorded-2026-09-25", "taf.json")));
    const lga = tafs.find((t) => t.icao === "KLGA")!;
    const prob = lga.groups.find((g) => g.change === "PROB")!;
    expect(prob.ceiling).toBe(2500);
    const ewrProb = tafs.find((t) => t.icao === "KEWR")!.groups.find((g) => g.change === "PROB")!;
    expect(ewrProb.ceiling).toBeUndefined();
  });

  it("scores wind, ceilings and precipitation by the printed thresholds", () => {
    expect(conditionHits("KLGA", { wspd: 25, wgst: 38 })[0]).toMatchObject({ level: "HIGH" });
    expect(conditionHits("KJFK", { wspd: 20, wgst: 27 })).toEqual([]);
    expect(conditionHits("KORD", { visib: 0.25, wx: "+SN BLSN", ceiling: 400 }).map((h) => h.level)).toEqual(["HIGH", "HIGH"]);
    expect(conditionHits("KBOS", { ceiling: 800, visib: 6 })[0].level).toBe("MODERATE");
    expect(conditionHits("KBOS", { wx: "TSRA" })[0].level).toBe("HIGH");
  });

  it("reads the low-level wind shear in the real JFK TAF", () => {
    const jfk = parseTafs(JSON.parse(fx("recorded-2026-09-25", "taf.json"))).find((t) => t.icao === "KJFK")!;
    const g = jfk.groups.find((x) => x.shearKt !== undefined)!;
    expect([g.shearKt, g.shearFt]).toEqual([50, 2000]);
    expect(conditionHits("KJFK", { shearKt: 50, shearFt: 2000 })[0].why).toContain("50 kt at 2000 ft");
  });

  it("knows SFO loses capacity well above IFR", () => {
    expect(conditionHits("KSFO", { ceiling: 1800, visib: 6 })[0].level).toBe("MODERATE");
    expect(conditionHits("KOAK", { ceiling: 1800, visib: 6 })).toEqual([]);
  });
});

describe("NWS", () => {
  it("classifies alerts by event, not by NWS severity", () => {
    const alerts = parseAlerts(JSON.parse(fx("recorded-2026-09-25", "alerts-JFK.json")));
    const byEvent = Object.fromEntries(alerts.map((a) => [a.event, [a.severity, classifyAlert(a.event)]]));
    expect(byEvent["Coastal Flood Warning"]).toEqual(["Severe", null]);
    expect(byEvent["Wind Advisory"]).toEqual(["Moderate", "MODERATE"]);
    expect(byEvent["Rip Current Statement"][1]).toBeNull();
    expect(classifyAlert("Blizzard Warning")).toBe("HIGH");
    expect(classifyAlert("Winter Storm Watch")).toBe("MODERATE");
  });

  it("softens a slight chance of thunderstorms", () => {
    const p = { name: "Tue", start: new Date(), end: new Date(), detailed: "", shortForecast: "Slight Chance Showers And Thunderstorms", windMaxMph: 10 };
    expect(forecastHits(p)).toEqual([]);
    expect(forecastHits({ ...p, shortForecast: "Showers And Thunderstorms Likely" })[0].level).toBe("MODERATE");
    expect(forecastHits({ ...p, shortForecast: "Sunny", windMaxMph: 45 })[0].level).toBe("HIGH");
  });
});
