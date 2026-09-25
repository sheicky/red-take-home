// Aviation Weather Center (aviationweather.gov): TAF = airport forecast for the next 24–30 h,
// METAR = what the airport observes now. Both in aviation terms (ceiling, visibility, knots),
// which is what actually drives airport capacity — better than a general city forecast.

import type { Level } from "../types";

export interface TafGroup {
  from: Date;
  to: Date;
  change: "BASE" | "FM" | "TEMPO" | "BECMG" | "PROB";
  probability?: number;
  wspd?: number;
  wgst?: number;
  visib?: number;
  ceiling?: number;
  wx?: string;
  /** Low-level wind shear ("WS020/01050KT" in the raw TAF; the JSON already gives feet and knots). */
  shearKt?: number;
  shearFt?: number;
}

export interface Taf {
  icao: string;
  issued: string;
  validFrom: Date;
  validTo: Date;
  raw: string;
  groups: TafGroup[];
}

export interface Metar {
  icao: string;
  observed: Date;
  raw: string;
  cond: Omit<TafGroup, "from" | "to" | "change" | "probability">;
}

type Cloud = { cover: string; base: number | null };

/** "6+" → 6, "10+" → 10, "1/2" → 0.5, "1 1/2" → 1.5, 4 → 4. */
export function parseVisib(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || !v.trim()) return undefined;
  const s = v.replace("+", "").replace(/SM$/, "").trim();
  const parts = s.split(" ");
  let total = 0;
  for (const p of parts) {
    if (p.includes("/")) {
      const [a, b] = p.split("/").map(Number);
      if (!b) return undefined;
      total += a / b;
    } else if (!Number.isNaN(+p)) total += +p;
    else return undefined;
  }
  return total;
}

/** Ceiling = lowest broken/overcast layer, or vertical visibility (sky obscured). */
export function ceilingOf(clouds: Cloud[] | undefined, vertVis: unknown): number | undefined {
  const layers = (clouds ?? []).filter((c) => ["BKN", "OVC", "OVX"].includes(c.cover) && c.base !== null).map((c) => c.base as number);
  if (typeof vertVis === "number") layers.push(vertVis);
  return layers.length ? Math.min(...layers) : undefined;
}

const num = (x: unknown) => (typeof x === "number" ? x : undefined);

export function parseTafs(json: unknown[]): Taf[] {
  return (json as Record<string, unknown>[]).map((t) => ({
    icao: String(t.icaoId),
    issued: String(t.issueTime),
    validFrom: new Date(Number(t.validTimeFrom) * 1000),
    validTo: new Date(Number(t.validTimeTo) * 1000),
    raw: String(t.rawTAF),
    groups: ((t.fcsts as Record<string, unknown>[]) ?? []).map((f) => ({
      from: new Date(Number(f.timeFrom) * 1000),
      to: new Date(Number(f.timeTo) * 1000),
      change: ((f.fcstChange as string) || "BASE") as TafGroup["change"],
      probability: num(f.probability),
      wspd: num(f.wspd),
      wgst: num(f.wgst),
      visib: parseVisib(f.visib),
      // A PROB/TEMPO group without clouds changes only what it lists; an empty array means "no change".
      ceiling: (f.clouds as Cloud[])?.length || f.vertVis != null ? ceilingOf(f.clouds as Cloud[], f.vertVis) : undefined,
      wx: (f.wxString as string) || undefined,
      shearKt: num(f.wshearSpd),
      shearFt: num(f.wshearHgt),
    })),
  }));
}

export function parseMetars(json: unknown[]): Metar[] {
  return (json as Record<string, unknown>[]).map((m) => ({
    icao: String(m.icaoId),
    observed: new Date(Number(m.obsTime) * 1000),
    raw: String(m.rawOb),
    cond: {
      wspd: num(m.wspd),
      wgst: num(m.wgst),
      visib: parseVisib(m.visib),
      ceiling: ceilingOf(m.clouds as Cloud[], m.vertVis),
      wx: (m.wxString as string) || undefined,
    },
  }));
}

// Airports whose capacity collapses well above generic IFR minima. SFO's closely spaced parallel
// runways lose simultaneous approaches when the ceiling drops below roughly 3,000 ft; a Ground
// Delay Program for "low ceilings" at 44 min avg was live on 2026-09-25 with a TAF ceiling of 600 ft.
// A real deployment would hold a per-airport table built with each airport's arrival rates.
const LOW_CEILING_SENSITIVE: Record<string, number> = { KSFO: 3000 };

export interface ConditionHit {
  level: Level;
  why: string;
}

/**
 * Thresholds (knots, statute miles, feet). Deliberately simple and printed in the UI:
 * an Ops agent must be able to see WHY a forecast turned amber.
 */
export function conditionHits(icao: string, c: Omit<TafGroup, "from" | "to" | "change" | "probability">): ConditionHit[] {
  const hits: ConditionHit[] = [];
  const wx = c.wx ?? "";
  if (/TS/.test(wx)) hits.push({ level: "HIGH", why: `thunderstorms (${wx})` });
  if (/FZRA|FZDZ|PL/.test(wx)) hits.push({ level: "HIGH", why: `freezing precipitation (${wx}) — de-icing, reduced rates` });
  else if (/\+SN|BLSN/.test(wx)) hits.push({ level: "HIGH", why: `heavy / blowing snow (${wx})` });
  else if (/SN/.test(wx)) hits.push({ level: "MODERATE", why: `snow (${wx}) — de-icing delays likely` });
  if (c.wgst !== undefined && c.wgst >= 35) hits.push({ level: "HIGH", why: `gusts ${c.wgst} kt` });
  else if (c.wspd !== undefined && c.wspd >= 30) hits.push({ level: "HIGH", why: `sustained wind ${c.wspd} kt` });
  else if ((c.wgst ?? 0) >= 30 || (c.wspd ?? 0) >= 22) hits.push({ level: "MODERATE", why: `wind ${c.wspd ?? "?"} kt gusting ${c.wgst ?? "-"} kt` });
  // Seen live in the JFK TAF on 2026-09-25: "WS020/01050KT" — 50 kt at 2,000 ft. Crews go around
  // or divert on approach in shear; airports cut arrival rates.
  if (c.shearKt !== undefined) hits.push({ level: "MODERATE", why: `low-level wind shear forecast (${c.shearKt} kt at ${c.shearFt ?? "?"} ft)` });
  const vis = c.visib;
  const ceil = c.ceiling;
  if ((ceil !== undefined && ceil < 500) || (vis !== undefined && vis < 1)) {
    hits.push({ level: "HIGH", why: `very low ceiling/visibility (${ceil ?? "—"} ft, ${vis ?? "—"} SM) — arrival rates cut` });
  } else if ((ceil !== undefined && ceil < 1000) || (vis !== undefined && vis < 3)) {
    hits.push({ level: "MODERATE", why: `IFR conditions (${ceil ?? "—"} ft, ${vis ?? "—"} SM)` });
  } else if (ceil !== undefined && LOW_CEILING_SENSITIVE[icao] && ceil < LOW_CEILING_SENSITIVE[icao]) {
    hits.push({ level: "MODERATE", why: `ceiling ${ceil} ft — below ~${LOW_CEILING_SENSITIVE[icao]} ft this airport loses parallel approaches` });
  }
  return hits;
}
