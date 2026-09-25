// National Weather Service (api.weather.gov): 7-day forecast periods and active alerts.
// Used for days 2–7 where no TAF exists, and for alerts on any day they cover.

import type { Level } from "../types";

export interface ForecastPeriod {
  name: string;
  start: Date;
  end: Date;
  shortForecast: string;
  detailed: string;
  windMaxMph?: number;
  pop?: number;
}

export interface Alert {
  id: string;
  event: string;
  severity: string;
  headline: string;
  onset: Date;
  end: Date;
  url: string;
}

export function parseForecast(json: unknown): { updated: string; periods: ForecastPeriod[] } {
  const p = (json as { properties: Record<string, unknown> }).properties;
  const periods = (p.periods as Record<string, unknown>[]).map((x) => {
    const winds = String(x.windSpeed ?? "").match(/\d+/g)?.map(Number) ?? [];
    return {
      name: String(x.name),
      start: new Date(String(x.startTime)),
      end: new Date(String(x.endTime)),
      shortForecast: String(x.shortForecast),
      detailed: String(x.detailedForecast ?? ""),
      windMaxMph: winds.length ? Math.max(...winds) : undefined,
      pop: (x.probabilityOfPrecipitation as { value: number | null } | undefined)?.value ?? undefined,
    };
  });
  return { updated: String(p.updateTime ?? p.updated ?? ""), periods };
}

export function parseAlerts(json: unknown): Alert[] {
  const features = (json as { features?: Record<string, unknown>[] }).features ?? [];
  return features.map((f) => {
    const p = f.properties as Record<string, string | null>;
    return {
      id: String(p.id ?? f.id),
      event: String(p.event),
      severity: String(p.severity),
      headline: String(p.headline ?? p.event),
      onset: new Date(p.onset ?? p.effective ?? p.sent ?? 0),
      // `ends` is null for many alerts; `expires` is when the product itself lapses.
      end: new Date(p.ends ?? p.expires ?? 0),
      url: String(f.id ?? ""),
    };
  });
}

/**
 * NWS "severity" is about life and property, not about flights: on 2026-09-25 JFK's point
 * carried a *Severe* Coastal Flood Warning and a Rip Current Statement — neither touches a
 * runway — next to a merely *Moderate* Wind Advisory, the one that matters (LGA was under a
 * wind ground delay program at the same time). So we classify by EVENT, not by severity.
 */
const ALERT_LEVELS: [RegExp, Level][] = [
  [/^(Blizzard|Ice Storm|Winter Storm|Lake Effect Snow|Hurricane|Tropical Storm|High Wind|Extreme Wind|Tornado|Severe Thunderstorm|Dust Storm|Snow Squall) Warning$/, "HIGH"],
  [/^(Winter Storm|Hurricane|Tropical Storm|High Wind|Severe Thunderstorm|Tornado|Blizzard) Watch$/, "MODERATE"],
  [/^(Winter Weather|Wind|Dense Fog|Freezing Fog|Freezing Rain|Freezing Drizzle|Lake Wind|Blowing Dust|Ashfall) Advisory$/, "MODERATE"],
  [/^Freeze Warning$|^Frost Advisory$/, "LOW"],
];

export function classifyAlert(event: string): Level | null {
  for (const [re, level] of ALERT_LEVELS) if (re.test(event)) return level;
  return null; // not flight-relevant (coastal flood, rip current, heat, air quality…)
}

export interface ForecastHit {
  level: Level;
  why: string;
}

/** "Chance Showers And Thunderstorms" → "chance of showers and thunderstorms": the NWS words, readable. */
export const plainForecast = (s: string) =>
  s.toLowerCase().replace(/\b(slight chance|chance)\b(?! of)/g, "$1 of").replace(/\s+/g, " ").trim();

export function forecastHits(p: ForecastPeriod): ForecastHit[] {
  const hits: ForecastHit[] = [];
  const t = `${p.shortForecast}. ${p.detailed}`;
  const slight = /Slight Chance|Isolated/i.test(p.shortForecast);
  const soften = (l: Level): Level => (slight ? (l === "HIGH" ? "MODERATE" : "LOW") : l);
  const said = plainForecast(p.shortForecast);
  if (/severe thunderstorm/i.test(t)) hits.push({ level: soften("HIGH"), why: /thunder/i.test(said) ? `${said}, some severe` : "severe thunderstorms" });
  else if (/thunderstorm|t-storm/i.test(p.shortForecast)) hits.push({ level: soften("MODERATE"), why: said });
  if (/blizzard|heavy snow|freezing rain|ice storm|sleet/i.test(t)) hits.push({ level: soften("HIGH"), why: /snow|blizzard|freezing|ice|sleet/i.test(said) ? said : "heavy snow or ice" });
  else if (/snow/i.test(p.shortForecast)) hits.push({ level: soften("MODERATE"), why: said });
  if (/fog/i.test(p.shortForecast)) hits.push({ level: "MODERATE", why: said });
  // mph here (NWS), knots in the TAF: 40 mph ≈ 35 kt, 30 mph ≈ 26 kt.
  if ((p.windMaxMph ?? 0) >= 40) hits.push({ level: "HIGH", why: `wind up to ${p.windMaxMph} mph` });
  else if ((p.windMaxMph ?? 0) >= 30) hits.push({ level: "MODERATE", why: `wind up to ${p.windMaxMph} mph` });
  return hits.filter((h) => h.level !== "LOW");
}

export const overlaps = (aFrom: Date, aTo: Date, bFrom: Date, bTo: Date) => aFrom < bTo && bFrom < aTo;
