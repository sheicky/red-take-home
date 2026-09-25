// Deterministic rules: parsed source data → evidence + factors.
// These functions are the source of truth for the risk level. The LLM never sees raw data
// and never sets a level; it only rewrites what these produce (see narrate.ts).
//
// Aggregation principle: the verdict is the MAX of the factors, never a sum. The TAF, the
// NWS forecast and an NWS alert often describe the same storm; adding them would triple-count it.

import type { Evidence, Factor, Level, Side, Window } from "./types";
import { lowerLevel, maxLevel, levelRank } from "./types";
import type { FaaSnapshot } from "./sources/faa";
import { conditionHits, type Metar, type Taf } from "./sources/awc";
import { classifyAlert, forecastHits, overlaps, type Alert, type ForecastPeriod } from "./sources/nws";
import type { Stats } from "./data";
import { URLS } from "./provider";

export class EvidenceBook {
  readonly items: Evidence[] = [];
  readonly factors: Factor[] = [];
  add(e: Omit<Evidence, "id">): string {
    const id = `E${this.items.length + 1}`;
    this.items.push({ id, ...e });
    return id;
  }
  factor(f: Omit<Factor, "id">) {
    this.factors.push({ id: `F${this.factors.length + 1}`, ...f });
  }
}

const hhmm = (d: Date, tz: string) => d.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const uniq = <T>(xs: T[]) => [...new Set(xs)];

// ───────────────────────── FAA ─────────────────────────

/**
 * Where a program sits matters. A Ground Delay Program at the DESTINATION holds your flight at
 * the gate before departure — direct hit. The same program at the ORIGIN meters arrivals into
 * your departure airport — your aircraft may come in late, an indirect knock-on, one level lower.
 */
export function faaRules(book: EvidenceBook, snap: FaaSnapshot, airport: string, side: "origin" | "destination") {
  const events = snap.events.filter((e) => e.airport === airport);
  if (!events.length) {
    book.add({ source: "faa", airport, title: `No FAA program at ${airport}`, detail: `No ground stop, ground delay program, delay or closure listed for ${airport}.`, observedAt: snap.updatedAt, url: URLS.faaHuman });
    return;
  }
  for (const e of events) {
    if (e.ignoredBecause) {
      book.add({ source: "faa", airport, title: `FAA listing for ${airport} not counted`, detail: e.reason, observedAt: snap.updatedAt, url: URLS.faaHuman, ignoredBecause: e.ignoredBecause });
      continue;
    }
    let level: Level = "MODERATE";
    let summary = "";
    let action: string | undefined;
    let title = "";
    switch (e.kind) {
      case "ground-stop":
        title = `Ground stop at ${airport}`;
        level = side === "destination" ? "SEVERE" : "HIGH";
        summary = side === "destination"
          ? `Ground stop for flights to ${airport} (${e.reason}): flights bound there are held at their origin${e.endTime ? ` until ~${e.endTime}` : ""}.`
          : `Ground stop for arrivals into ${airport} (${e.reason}): inbound aircraft are held, so departures may leave late.`;
        action = side === "destination"
          ? `Contact the traveler before they leave for the airport; check the airline app for a gate hold or cancellation.`
          : `Warn the traveler of likely late inbound aircraft at ${airport}; check the flight status before leaving.`;
        break;
      case "ground-delay": {
        title = `Ground delay program at ${airport}`;
        const direct: Level = (e.avgMin ?? 0) >= 90 ? "HIGH" : "MODERATE";
        level = side === "destination" ? direct : lowerLevel(direct);
        summary = side === "destination"
          ? `Ground delay program for ${airport} (${e.reason}): flights to ${airport} are held before departure, avg ${e.avgMin ?? "?"} min, max ${e.maxMin ?? "?"} min.`
          : `Ground delay program on arrivals into ${airport} (${e.reason}, avg ${e.avgMin ?? "?"} min): knock-on delays to departures possible.`;
        action = side === "destination"
          ? `Tell the traveler to expect a ~${e.avgMin ?? "?"} min hold; protect any onward connection or meeting after arrival.`
          : undefined;
        break;
      }
      case "arr-dep-delay": {
        title = `${e.direction} delays at ${airport}`;
        const relevant = (side === "origin" && e.direction === "Departure") || (side === "destination" && e.direction === "Arrival");
        const lvl: Level = (e.maxMin ?? 0) >= 90 ? "HIGH" : (e.maxMin ?? 0) >= 45 ? "MODERATE" : "LOW";
        level = relevant ? lvl : lvl === "LOW" ? "LOW" : lowerLevel(lvl);
        summary = `${e.direction} delays at ${airport}: ${e.minMin ?? "?"}–${e.maxMin ?? "?"} min${e.trend ? `, ${e.trend.toLowerCase()}` : ""} (${e.reason}).`;
        break;
      }
      case "closure":
        title = `Airport closure at ${airport}`;
        level = "SEVERE";
        summary = `FAA lists ${airport} as closed${e.reopen ? ` (reopen ${e.reopen})` : ""}: ${e.reason.slice(0, 160)}`;
        action = `Treat the flight as at risk of cancellation: contact the traveler and the airline now; prepare an alternate airport.`;
        break;
      default:
        title = `Unrecognized FAA program at ${airport}`;
        level = "MODERATE";
        summary = `FAA lists an event for ${airport} this tool does not recognize; read it at the source.`;
    }
    const id = book.add({ source: "faa", airport, title, detail: summary, observedAt: snap.updatedAt, url: URLS.faaHuman });
    if (level !== "LOW") book.factor({ level, side, airport, summary, evidence: [id], action });
  }
}

// ───────────────────────── TAF / METAR ─────────────────────────

export function tafRules(book: EvidenceBook, taf: Taf | undefined, w: Window, side: Side): "ok" | "not-covered" | "missing" {
  if (!taf) return "missing";
  const from = new Date(w.from), to = new Date(w.to);
  if (from >= taf.validTo) return "not-covered";
  const partial = to > taf.validTo;
  const icao = taf.icao;
  let level: Level = "LOW";
  const byRange = new Map<string, string[]>(); // "07:00–13:00" → reasons, so each range is printed once
  for (const g of taf.groups) {
    if (!overlaps(g.from, g.to, from, to)) continue;
    // A PROB group is a possibility (typically 30–40%): one level down. TEMPO = expected at times.
    const range = `${hhmm(g.from < from ? from : g.from, w.tz)}–${hhmm(g.to > to ? to : g.to, w.tz)}`;
    for (const h of conditionHits(icao, g)) {
      const l = g.change === "PROB" ? lowerLevel(h.level) : h.level;
      level = maxLevel(level, l);
      if (l === "LOW") continue;
      const why = `${h.why}${g.change === "PROB" ? ` (${g.probability ?? ""}% chance)` : g.change === "TEMPO" ? " (at times)" : ""}`;
      byRange.set(range, uniq([...(byRange.get(range) ?? []), why]));
    }
  }
  const whys = [...byRange].map(([r, ws]) => `${r} local, ${ws.join(", ")}`);
  const id = book.add({
    source: "taf", airport: w.airport,
    title: `TAF ${icao}${partial ? " (covers part of the window)" : ""}`,
    detail: taf.raw, observedAt: taf.issued, url: URLS.tafHuman(icao),
  });
  if (levelRank(level) > 0) {
    book.factor({
      level, side, airport: w.airport, evidence: [id],
      summary: `Airport forecast for ${w.airport} during the ${w.basis === "scheduled-time" ? "scheduled time" : "day"}: ${uniq(whys).slice(0, 3).join("; ")}.`,
      action: level === "HIGH" ? `Weather at ${w.airport} is likely to cut capacity. Consider an earlier flight or build a buffer.` : undefined,
    });
  }
  return "ok";
}

export function metarRules(book: EvidenceBook, metar: Metar | undefined, w: Window, side: Side, now: Date) {
  if (!metar) return;
  const ageMin = Math.round((now.getTime() - metar.observed.getTime()) / 60000);
  const hits = conditionHits(metar.icao, metar.cond);
  // An observation describes NOW. It only scores if the flight is within the next ~3 h — and
  // at the destination only when the arrival time is known (whole-day windows would make a
  // morning fog at SFO count against a flight landing at 9 pm).
  const soon = new Date(w.from).getTime() - now.getTime() < 3 * 3600_000 && new Date(w.to) > now
    && (side !== "destination" || w.basis === "scheduled-time");
  const id = book.add({
    source: "metar", airport: w.airport, title: `Current observation ${metar.icao} (${ageMin} min old)`,
    detail: metar.raw, observedAt: metar.observed.toISOString(), url: URLS.tafHuman(metar.icao),
    ignoredBecause: soon ? undefined
      : side === "destination" && w.basis === "whole-day"
        ? "current conditions at the destination; arrival time unknown (give a flight number); the TAF covers the day"
        : "observation is current conditions; the flight window is more than 3 h away (TAF covers it)",
  });
  if (!soon) return;
  const level = hits.reduce<Level>((l, h) => maxLevel(l, h.level), "LOW");
  if (level !== "LOW") book.factor({ level, side, airport: w.airport, evidence: [id], summary: `Right now at ${w.airport}: ${hits.map((h) => h.why).join("; ")}.` });
}

// ───────────────────────── NWS ─────────────────────────

export function forecastRules(book: EvidenceBook, periods: ForecastPeriod[], w: Window, side: Side, office: string, url: string) {
  const from = new Date(w.from), to = new Date(w.to);
  const used = periods.filter((p) => overlaps(p.start, p.end, from, to));
  if (!used.length) return false;
  let level: Level = "LOW";
  const ids: string[] = [];
  const whys: string[] = [];
  for (const p of used) {
    const id = book.add({
      source: "nws-forecast", airport: w.airport, title: `NWS forecast for ${w.airport}, ${p.name}`,
      detail: `${p.shortForecast}. Wind up to ${p.windMaxMph ?? "?"} mph.${p.pop != null ? ` Precipitation ${p.pop}%.` : ""} (${office})`,
      observedAt: p.start.toISOString(), url,
    });
    for (const h of forecastHits(p)) {
      level = maxLevel(level, h.level);
      whys.push(`${p.name}: ${h.why}`);
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (level !== "LOW") book.factor({ level, side, airport: w.airport, evidence: ids, summary: `Forecast for ${w.airport}: ${uniq(whys).slice(0, 3).join("; ")}.` });
  return true;
}

export function alertRules(book: EvidenceBook, alerts: Alert[], w: Window, side: Side) {
  const from = new Date(w.from), to = new Date(w.to);
  for (const a of alerts) {
    if (!overlaps(a.onset, a.end, from, to)) continue;
    const level = classifyAlert(a.event);
    const id = book.add({
      source: "nws-alerts", airport: w.airport, title: `${a.event} (${a.severity})`, detail: a.headline,
      observedAt: a.onset.toISOString(), url: a.url || "https://alerts.weather.gov/",
      ignoredBecause: level === null ? `not flight-relevant (NWS severity "${a.severity}" is about life and property, not runways)` : undefined,
    });
    if (level && level !== "LOW") {
      book.factor({
        level, side, airport: w.airport, evidence: [id], summary: `${a.event} in effect at ${w.airport} during the travel window.`,
        action: level === "HIGH" ? `Check the airline's travel-waiver page for ${w.airport}: free changes are usually offered ahead of a ${a.event.toLowerCase()}.` : undefined,
      });
    }
  }
}

// ───────────────────────── BTS history ─────────────────────────

export const delayRate = (s: Stats) => (s[0] - s[2] - s[3] > 0 ? s[1] / (s[0] - s[2] - s[3]) : 0);
export const cancelRate = (s: Stats) => (s[0] ? s[2] / s[0] : 0);

/**
 * History is a PRIOR, not a signal: "24% of JFK→SFO flights in December arrive 15+ min late"
 * says nothing about THIS flight on THIS day. So it is capped at MODERATE — it can make an
 * otherwise quiet day amber, it can never make it red.
 */
export function btsRouteRules(
  book: EvidenceBook, route: Stats | undefined, national: Stats, o: string, d: string, month: number, window: string,
  flownOtherMonths: number[] = [],
): "ok" | "no-route" | "no-month" {
  const mname = new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  if (!route && flownOtherMonths.length) {
    // Flown in other months, not this one: seasonal service or a gap in the data window —
    // NOT evidence of a connection. Say so, don't score it.
    book.add({
      source: "bts-route", title: `No ${mname} history for ${o}→${d}`,
      detail: `BTS has nonstop ${o}→${d} flights in other months (${flownOtherMonths.join(", ")}) but not in ${mname} over ${window}: seasonal service, or ${mname} is outside the data window.`,
      url: URLS.bts,
    });
    return "no-month";
  }
  if (!route) {
    const id = book.add({
      source: "bts-route", title: `No nonstop history ${o}→${d} in ${mname}`,
      detail: `BTS shows fewer than 20 nonstop ${o}→${d} flights in ${mname} over ${window}. The trip is probably a connection; hub risk is not assessed.`,
      url: URLS.bts,
    });
    book.factor({ level: "MODERATE", side: "route", evidence: [id], summary: `No regular nonstop ${o}→${d}: a connection adds a second airport and a missed-connection risk this tool does not score.`, action: `Get the actual itinerary: if it connects, re-run the check for each leg.` });
    return "no-route";
  }
  const dr = delayRate(route), cr = cancelRate(route), nd = delayRate(national), nc = cancelRate(national);
  const id = book.add({
    source: "bts-route", title: `${o}→${d} in ${mname}: ${pct(1 - dr)} on time`,
    detail: `${route[0].toLocaleString("en-US")} flights (${window}): ${pct(dr)} arrived 15+ min late (national ${pct(nd)}), ${(cr * 100).toFixed(1)}% cancelled (national ${(nc * 100).toFixed(1)}%), ${route[5]} delays with a weather/airspace cause.`,
    url: URLS.bts,
  });
  if (route[0] >= 40 && (dr >= Math.max(0.3, nd * 1.25) || cr >= Math.max(0.03, nc * 1.5))) {
    book.factor({ level: "MODERATE", side: "route", evidence: [id], summary: `Historically fragile in ${mname}: ${pct(dr)} late, ${(cr * 100).toFixed(1)}% cancelled vs ${pct(nd)} / ${(nc * 100).toFixed(1)}% nationally.` });
  }
  return "ok";
}

export function btsFlightRules(book: EvidenceBook, key: string, s: Stats, o: string, d: string, dep: string | undefined, window: string) {
  const dr = delayRate(s), cr = cancelRate(s);
  const id = book.add({
    source: "bts-flight", title: `${key} ${o}→${d}: ${pct(1 - dr)} on time`,
    detail: `${s[0]} operations (${window})${dep ? `, usually departs ${dep}` : ""}: ${pct(dr)} arrived 15+ min late, ${(cr * 100).toFixed(1)}% cancelled.`,
    url: URLS.bts,
  });
  if (s[0] >= 30 && (dr >= 0.35 || cr >= 0.04)) {
    book.factor({ level: "MODERATE", side: "flight", evidence: [id], summary: `This specific flight has a weak record: ${pct(dr)} late, ${(cr * 100).toFixed(1)}% cancelled.` });
  }
}
