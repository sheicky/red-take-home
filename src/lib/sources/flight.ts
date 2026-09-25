// Flight-number enrichment. The decision was: a flight number must NEVER block the assessment.
// Three layers, from free and always-there to optional:
//   1. BTS history (bundled): where this number actually flies, its usual schedule, its on-time record.
//   2. adsbdb (free, keyless): the route currently filed for the callsign — catches a wrong number.
//   3. aviationstack (optional key, free tier ~100 req/month): live status, same day only.

import type { BtsData, Stats } from "../data";

// IATA → ICAO airline designators for the carriers that report to BTS (callsigns use ICAO).
export const ICAO_OF: Record<string, string> = {
  AA: "AAL", UA: "UAL", DL: "DAL", WN: "SWA", B6: "JBU", AS: "ASA", NK: "NKS", F9: "FFT", HA: "HAL",
  G4: "AAY", SY: "SCX", MX: "MXY", OO: "SKW", YX: "RPA", MQ: "ENY", "9E": "EDV", OH: "JIA", YV: "ASH",
  G7: "GJS", ZW: "AWI", C5: "UCA", QX: "QXE", PT: "PDT",
};
const IATA_OF = Object.fromEntries(Object.entries(ICAO_OF).map(([i, c]) => [c, i]));

// Regional operators report under THEIR code: "UA 5123" operated by SkyWest is "OO 5123" in BTS.
const REGIONALS = ["OO", "YX", "MQ", "9E", "OH", "YV", "G7", "ZW", "C5", "QX", "PT"];

export interface ParsedFlight {
  carrier: string; // IATA
  number: string;
  normalized: string;
  callsign: string;
}

/** "UA 1234", "ua1234", "UAL1234", "B6 415" → parsed; anything else → null. */
export function parseFlightNumber(input: string): ParsedFlight | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  let m = /^([A-Z]{3})(\d{1,4})$/.exec(s);
  if (m && IATA_OF[m[1]]) {
    const carrier = IATA_OF[m[1]];
    return { carrier, number: String(+m[2]), normalized: carrier + +m[2], callsign: m[1] + +m[2] };
  }
  m = /^([A-Z0-9]{2})(\d{1,4})$/.exec(s);
  if (m && /[A-Z]/.test(m[1])) {
    const icao = ICAO_OF[m[1]];
    return { carrier: m[1], number: String(+m[2]), normalized: m[1] + +m[2], callsign: icao ? icao + +m[2] : m[1] + +m[2] };
  }
  return null;
}

export interface BtsFlightMatch {
  operatedAs: string; // key used in BTS, may be a regional
  routes: { o: string; d: string; flights: number }[];
  match?: { o: string; d: string; s: Stats; crsDep: string; crsArr: string };
}

/** Look the number up in BTS; accept any airport pair inside the given origin/destination sets. */
export function btsFlightLookup(bts: BtsData, f: ParsedFlight, origins: string[], dests: string[]): BtsFlightMatch | null {
  const tryKey = (key: string): BtsFlightMatch | null => {
    const rows = bts.flights[key];
    if (!rows) return null;
    const match = rows.find((r) => origins.includes(r.o) && dests.includes(r.d));
    return { operatedAs: key, routes: rows.map((r) => ({ o: r.o, d: r.d, flights: r.s[0] })), match };
  };
  const direct = tryKey(f.normalized);
  if (direct?.match) return direct;
  for (const r of REGIONALS) {
    const alt = tryKey(r + f.number);
    if (alt?.match) return alt;
  }
  return direct;
}

export function parseAdsbdb(json: unknown): { o: string; d: string } | null {
  const fr = (json as { response?: { flightroute?: { origin?: { iata_code?: string }; destination?: { iata_code?: string } } } })
    .response?.flightroute;
  if (!fr?.origin?.iata_code || !fr.destination?.iata_code) return null;
  return { o: fr.origin.iata_code, d: fr.destination.iata_code };
}

export function parseAviationstack(json: unknown, date: string): { status: string; depDelayMin?: number } | null {
  const rows = (json as { data?: Record<string, unknown>[] }).data ?? [];
  const row = rows.find((r) => r.flight_date === date) ?? null;
  if (!row) return null;
  const dep = row.departure as { delay?: number | null } | undefined;
  return { status: String(row.flight_status ?? "unknown"), depDelayMin: dep?.delay ?? undefined };
}
