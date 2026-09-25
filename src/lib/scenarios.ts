// Demo scenarios. Live data is the default; these exist because a demo on a calm day shows a
// wall of green and proves nothing.
//
// - "recorded": REAL responses captured on 2026-09-25 ~16:12–16:20Z (LGA and SFO under ground
//   delay programs, wind across New York). Replayed byte for byte, with the clock frozen at
//   capture time so the horizon logic sees the same "today".
// - "synthetic-blizzard": INVENTED data, labelled as such everywhere in the UI. It exists to
//   show the SEVERE path (ground stop + blizzard warning), which is rare on any given day.

import fs from "node:fs";
import path from "node:path";
import type { NwsPoint, Provider } from "./provider";
import type { AssessmentRequest } from "./types";
import { airportByIata } from "./data";

export interface Scenario {
  id: string;
  label: string;
  /** What the data switch shows. */
  short: string;
  description: string;
  synthetic: boolean;
  recordedAt?: string;
  preset: Omit<AssessmentRequest, "scenario">;
  provider: () => Provider;
}

const fixturesDir = () => path.join(process.cwd(), "fixtures");
const notRecorded = (what: string) => Promise.reject(new Error(`not in this recorded scenario: ${what}`));

function recordedProvider(dir: string, frozenNow: string): Provider {
  const base = path.join(fixturesDir(), dir);
  const read = (f: string) => fs.readFileSync(path.join(base, f), "utf8");
  const has = (f: string) => fs.existsSync(path.join(base, f));
  const codes = fs.readdirSync(base).filter((f) => f.startsWith("points-")).map((f) => f.slice(7, 10));
  const nearest = (lat: number, lon: number) =>
    codes
      .map((c) => ({ c, a: airportByIata(c) }))
      .filter((x) => x.a && Math.abs(x.a.lat - lat) < 0.05 && Math.abs(x.a.lon - lon) < 0.05)
      .map((x) => x.c)[0];
  const filterIds = (json: unknown[], ids: string[]) => (json as { icaoId: string }[]).filter((x) => ids.includes(x.icaoId));

  return {
    now: () => new Date(frozenNow),
    faaStatusXml: async () => read("faa.xml"),
    taf: async (ids) => filterIds(JSON.parse(read("taf.json")), ids),
    metar: async (ids) => filterIds(JSON.parse(read("metar.json")), ids),
    nwsPoint: async (lat, lon): Promise<NwsPoint> => {
      const c = nearest(lat, lon);
      if (!c) return notRecorded(`NWS point ${lat},${lon}`);
      const p = JSON.parse(read(`points-${c}.json`)).properties;
      return { forecastUrl: p.forecast, timeZone: p.timeZone, office: p.gridId };
    },
    nwsForecast: async (url) => {
      const c = codes.find((c) => JSON.parse(read(`points-${c}.json`)).properties.forecast === url);
      return c && has(`forecast-${c}.json`) ? JSON.parse(read(`forecast-${c}.json`)) : notRecorded(`forecast ${url}`);
    },
    nwsAlerts: async (lat, lon) => {
      const c = nearest(lat, lon);
      return c && has(`alerts-${c}.json`) ? JSON.parse(read(`alerts-${c}.json`)) : notRecorded(`alerts ${lat},${lon}`);
    },
    adsbdbCallsign: async (cs) => (has(`adsbdb-${cs}.json`) ? JSON.parse(read(`adsbdb-${cs}.json`)) : notRecorded(`adsbdb ${cs}`)),
    aviationstack: null,
  };
}

// ───────────── synthetic blizzard: Chicago, 14 Jan 2027 ─────────────

const STORM = new Set(["ORD", "MDW"]);
const SYN_NOW = "2027-01-14T14:00:00Z"; // 08:00 in Chicago
const t = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function syntheticProvider(): Provider {
  const tafFor = (icao: string) => {
    const iata = icao.slice(1);
    const storm = STORM.has(iata);
    const from = t("2027-01-14T12:00:00Z"), to = t("2027-01-15T18:00:00Z");
    return {
      icaoId: icao, issueTime: "2027-01-14T11:40:00Z", validTimeFrom: from, validTimeTo: to,
      rawTAF: storm
        ? `TAF ${icao} 141140Z 1412/1518 03030G45KT 1/4SM +SN BLSN VV004 FM150600 36022G32KT 1SM -SN BLSN OVC008 [SYNTHETIC]`
        : `TAF ${icao} 141140Z 1412/1518 27008KT P6SM SKC [SYNTHETIC]`,
      fcsts: storm
        ? [
            { timeFrom: from, timeTo: t("2027-01-15T06:00:00Z"), fcstChange: null, wspd: 30, wgst: 45, visib: "1/4", wxString: "+SN BLSN", clouds: [], vertVis: 400 },
            { timeFrom: t("2027-01-15T06:00:00Z"), timeTo: to, fcstChange: "FM", wspd: 22, wgst: 32, visib: "1", wxString: "-SN BLSN", clouds: [{ cover: "OVC", base: 800 }], vertVis: null },
          ]
        : [{ timeFrom: from, timeTo: to, fcstChange: null, wspd: 8, wgst: null, visib: "6+", wxString: null, clouds: [{ cover: "SKC", base: null }], vertVis: null }],
    };
  };
  return {
    now: () => new Date(SYN_NOW),
    faaStatusXml: async () => `<AIRPORT_STATUS_INFORMATION><Update_Time>Thu Jan 14 13:55:00 2027 GMT</Update_Time>
<Delay_type><Name>Ground Stop Programs</Name><Ground_Stop_List><Program><ARPT>ORD</ARPT><Reason>snow/ice [SYNTHETIC]</Reason><End_Time>11:00 am CST.</End_Time></Program></Ground_Stop_List></Delay_type>
<Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List><Ground_Delay><ARPT>MDW</ARPT><Reason>snow/ice [SYNTHETIC]</Reason><Avg>1 hour and 35 minutes</Avg><Max>3 hours and 10 minutes</Max></Ground_Delay></Ground_Delay_List></Delay_type>
</AIRPORT_STATUS_INFORMATION>`,
    taf: async (ids) => ids.map(tafFor),
    metar: async (ids) =>
      ids.map((icao) => {
        const storm = STORM.has(icao.slice(1));
        return {
          icaoId: icao, obsTime: t("2027-01-14T13:51:00Z"),
          rawOb: storm ? `METAR ${icao} 141351Z 03031G44KT 1/4SM +SN BLSN VV004 M09/M11 A2968 [SYNTHETIC]` : `METAR ${icao} 141351Z 27007KT 10SM SKC 02/M05 A3012 [SYNTHETIC]`,
          wspd: storm ? 31 : 7, wgst: storm ? 44 : null, visib: storm ? "1/4" : "10+", wxString: storm ? "+SN BLSN" : null,
          clouds: storm ? [] : [{ cover: "SKC", base: null }], vertVis: storm ? 400 : null,
        };
      }),
    nwsPoint: async (lat, lon) => {
      const a = [...STORM].map((c) => airportByIata(c)!).find((a) => Math.abs(a.lat - lat) < 0.05 && Math.abs(a.lon - lon) < 0.05);
      return { forecastUrl: `synthetic://forecast/${a ? "storm" : "calm"}`, timeZone: "America/Chicago", office: "SYNTHETIC" };
    },
    nwsForecast: async (url) => {
      const storm = url.endsWith("storm");
      const periods = [];
      let start = new Date("2027-01-14T12:00:00Z");
      for (let i = 0; i < 14; i++) {
        const end = new Date(start.getTime() + 12 * 3600_000);
        const bad = storm && i < 3;
        periods.push({
          name: `Period ${i + 1}`, startTime: start.toISOString(), endTime: end.toISOString(),
          windSpeed: bad ? "25 to 45 mph" : "5 to 10 mph", shortForecast: bad ? "Blizzard" : "Sunny",
          detailedForecast: bad ? "Heavy snow and blowing snow, visibility near zero at times. [SYNTHETIC]" : "Sunny. [SYNTHETIC]",
          probabilityOfPrecipitation: { value: bad ? 100 : 0 },
        });
        start = end;
      }
      return { properties: { updateTime: "2027-01-14T11:00:00Z", periods } };
    },
    nwsAlerts: async (lat, lon) => {
      const storm = [...STORM].map((c) => airportByIata(c)!).some((a) => Math.abs(a.lat - lat) < 0.05 && Math.abs(a.lon - lon) < 0.05);
      return {
        features: storm
          ? [{ id: "synthetic-blizzard", properties: { id: "synthetic-blizzard", event: "Blizzard Warning", severity: "Severe", headline: "Blizzard Warning until 6 PM CST Friday [SYNTHETIC]", onset: "2027-01-14T06:00:00Z", ends: "2027-01-16T00:00:00Z", expires: "2027-01-15T00:00:00Z" } }]
          : [],
      };
    },
    adsbdbCallsign: async () => notRecorded("adsbdb (synthetic scenario)"),
    aviationstack: null,
  };
}

export const SCENARIOS: Scenario[] = [
  {
    id: "recorded-2026-09-25",
    label: "Replay of 25 Sep 2026, 16:12 UTC",
    short: "Replay 25 Sep",
    description: "Real FAA, TAF, METAR and NWS responses captured 16:12–16:20 UTC: ground delay programs at LGA (wind, avg 1 h 54) and SFO (low ceilings), wind advisory over New York.",
    synthetic: false,
    recordedAt: "2026-09-25T16:12:33Z",
    preset: { origin: "JFK", destination: "SFO", date: "2026-09-25", flight: "DL 679" },
    provider: () => recordedProvider("recorded-2026-09-25", "2026-09-25T16:12:33Z"),
  },
  {
    id: "synthetic-blizzard",
    label: "Invented Chicago blizzard",
    short: "Blizzard (invented)",
    description: "INVENTED data to exercise the SEVERE path: ground stop at ORD, ground delay program at MDW, blizzard warning.",
    synthetic: true,
    preset: { origin: "BOS", destination: "ORD", date: "2027-01-14" },
    provider: syntheticProvider,
  },
];

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id);
