// Dates are the easiest place to be silently wrong in this tool:
// "tomorrow" for an Ops agent in Singapore is not tomorrow at JFK.
// Rule: the travel date is a LOCAL date at the ORIGIN airport, and "today" is computed there too.

import type { Horizon } from "./types";

/** YYYY-MM-DD of `at` in time zone `tz`. */
export function localDate(at: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}

/** Offset (ms) of `tz` from UTC at instant `at`. */
function tzOffsetMs(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => +p.find((x) => x.type === t)!.value;
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - at.getTime();
}

/** The instant of local wall-clock `ymd hh:mm` in `tz` (DST-safe to the minute for real schedules). */
export function zonedInstant(ymd: string, hhmm: string, tz: string): Date {
  const [h, m] = [+hhmm.slice(0, 2), +hhmm.slice(-2)];
  const guess = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), h, m);
  const first = guess - tzOffsetMs(new Date(guess), tz);
  return new Date(guess - tzOffsetMs(new Date(first), tz));
}

/**
 * What each source can honestly say about a date `daysAhead` away.
 * - FAA NAS status is a snapshot of NOW. It is evidence for today only — a ground delay
 *   program running today says nothing about tomorrow. (The first draft of the plan used it
 *   for "today and tomorrow"; that was wrong.)
 * - METAR is an observation: today only.
 * - TAF covers ~24–30 h from issue: today and tomorrow, and we still check its valid-to.
 * - NWS gridded forecast: 7 days. Active alerts: whatever is issued now, filtered by their own window.
 * - BTS: history, any date.
 */
export function horizonFor(daysAhead: number, travelDate: string): Horizon {
  const regime = daysAhead <= 0 ? "today" : daysAhead === 1 ? "tomorrow" : daysAhead <= 7 ? "week" : "beyond";
  const applicable: Horizon["applicable"] = {
    faa: daysAhead === 0,
    metar: daysAhead === 0,
    taf: daysAhead <= 1,
    "nws-forecast": daysAhead <= 6, // periods span ~7 days from now; day 7 is often only half covered
    "nws-alerts": daysAhead <= 7,
    "bts-route": true,
  };
  let recheck: string | undefined;
  if (regime === "beyond") recheck = `Re-check on ${addDays(travelDate, -6)} (forecast becomes available) and on ${addDays(travelDate, -1)} (TAF).`;
  else if (regime === "week") recheck = `Re-check on ${addDays(travelDate, -1)}: airport forecasts (TAF) and live FAA status only cover the last 24–30 h.`;
  else if (regime === "tomorrow") recheck = `Re-check on the morning of ${travelDate}: FAA ground programs are only published same-day.`;
  return { daysAhead, regime, applicable, recheck };
}
