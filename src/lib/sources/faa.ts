// FAA NAS Status — the only free, keyless, authoritative source for ground stops,
// ground delay programs and airport-wide delays. A snapshot of NOW.
//
// No DTD is reachable any more (www.fly.faa.gov/AirportStatus.dtd serves the SPA, 2026-09-25),
// so the parser is tolerant: it walks every <Delay_type>, recognizes the programs it knows and
// surfaces anything else as "unrecognized" instead of dropping it.

import { XMLParser } from "fast-xml-parser";

export type FaaEventKind = "ground-stop" | "ground-delay" | "arr-dep-delay" | "closure" | "other";

export interface FaaEvent {
  kind: FaaEventKind;
  airport: string;
  reason: string;
  /** Average delay in minutes, for GDPs. */
  avgMin?: number;
  maxMin?: number;
  minMin?: number;
  direction?: "Arrival" | "Departure";
  trend?: string;
  endTime?: string;
  reopen?: string;
  /** Set when the event must not count for airline travel, with why. */
  ignoredBecause?: string;
  raw: string;
}

export interface FaaSnapshot {
  updatedAt: string;
  events: FaaEvent[];
}

/** "1 hour and 54 minutes" → 114; "44 minutes" → 44; "2 hours" → 120. */
export function parseDuration(s: unknown): number | undefined {
  if (typeof s !== "string") return undefined;
  const h = /(\d+)\s*hour/.exec(s);
  const m = /(\d+)\s*min/.exec(s);
  if (!h && !m) return undefined;
  return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
}

const arr = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const text = (x: unknown) => (x === undefined || x === null ? "" : String(x));

// Seen live on 2026-09-25: LAX and SAN listed under "Airport Closures" by NOTAMs that close the
// field to NON-SCHEDULED transient general aviation only. Airline flights are unaffected.
const GA_ONLY = /NON[\s-]?SKED|TRANSIENT|\bGA\b.*ACFT|PPR/i;

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/**
 * When the closure comes from a NOTAM, its reason ends with the validity range "YYMMDDhhmm-YYMMDDhhmm",
 * WITH the year. Trust that first: on 2026-09-25 LAX showed "Reopen: May 28 at 16:00 UTC." while its
 * NOTAM ran "2605271826-2705281600" — May 28, 2027. Guessing the year would have called it over.
 */
export function notamEnd(reason: string): Date | undefined {
  const m = /(\d{10})-(\d{10})\b/.exec(reason);
  if (!m) return undefined;
  const e = m[2];
  return new Date(Date.UTC(2000 + +e.slice(0, 2), +e.slice(2, 4) - 1, +e.slice(4, 6), +e.slice(6, 8), +e.slice(8, 10)));
}

/** "May 28 at 16:00 UTC." — no year in the feed. Fallback only: pick the year closest to `now`. */
export function parseReopen(s: string, now: Date): Date | undefined {
  const m = /([A-Z][a-z]{2})\s+(\d{1,2})\s+at\s+(\d{2}):(\d{2})\s*UTC/.exec(s);
  if (!m || MONTHS[m[1]] === undefined) return undefined;
  const cands = [-1, 0, 1].map((dy) => new Date(Date.UTC(now.getUTCFullYear() + dy, MONTHS[m[1]], +m[2], +m[3], +m[4])));
  return cands.sort((a, b) => Math.abs(a.getTime() - now.getTime()) - Math.abs(b.getTime() - now.getTime()))[0];
}

export function parseFaa(xml: string, now: Date): FaaSnapshot {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" }).parse(xml);
  const root = doc.AIRPORT_STATUS_INFORMATION ?? {};
  const events: FaaEvent[] = [];

  for (const dt of arr<Record<string, unknown>>(root.Delay_type)) {
    const raw = (o: unknown) => JSON.stringify(o);
    for (const g of arr<Record<string, unknown>>((dt.Ground_Delay_List as Record<string, unknown>)?.Ground_Delay as never)) {
      events.push({ kind: "ground-delay", airport: text(g.ARPT), reason: text(g.Reason), avgMin: parseDuration(g.Avg), maxMin: parseDuration(g.Max), raw: raw(g) });
    }
    for (const p of arr<Record<string, unknown>>((dt.Ground_Stop_List as Record<string, unknown>)?.Program as never)) {
      events.push({ kind: "ground-stop", airport: text(p.ARPT), reason: text(p.Reason), endTime: text(p.End_Time).replace(/\.$/, ""), raw: raw(p) });
    }
    for (const d of arr<Record<string, unknown>>((dt.Arrival_Departure_Delay_List as Record<string, unknown>)?.Delay as never)) {
      for (const ad of arr<Record<string, unknown>>(d.Arrival_Departure as never)) {
        events.push({
          kind: "arr-dep-delay", airport: text(d.ARPT), reason: text(d.Reason),
          direction: text(ad["@Type"]) === "Departure" ? "Departure" : "Arrival",
          minMin: parseDuration(ad.Min), maxMin: parseDuration(ad.Max), trend: text(ad.Trend), raw: raw(d),
        });
      }
    }
    for (const a of arr<Record<string, unknown>>((dt.Airport_Closure_List as Record<string, unknown>)?.Airport as never)) {
      const reason = text(a.Reason);
      const reopen = text(a.Reopen);
      const reopenAt = notamEnd(reason) ?? parseReopen(reopen, now);
      let ignoredBecause: string | undefined;
      if (GA_ONLY.test(reason)) ignoredBecause = "NOTAM closes the airport to non-scheduled / general aviation only. Airline flights are not affected";
      else if (reopenAt && reopenAt.getTime() < now.getTime()) ignoredBecause = `closure ended ${reopenAt.toISOString().slice(0, 16).replace("T", " ")} UTC but is still listed`;
      events.push({ kind: "closure", airport: text(a.ARPT), reason, reopen, ignoredBecause, raw: raw(a) });
    }
    const known = ["Name", "Ground_Delay_List", "Ground_Stop_List", "Arrival_Departure_Delay_List", "Airport_Closure_List"];
    for (const [k, v] of Object.entries(dt)) {
      if (known.includes(k)) continue;
      // Unknown program type: keep it visible rather than silently lose it.
      const s = JSON.stringify(v);
      for (const m of s.matchAll(/"ARPT":"([A-Z0-9]{3,4})"/g)) {
        events.push({ kind: "other", airport: m[1], reason: `${text(dt.Name)}: ${s.slice(0, 200)}`, raw: s });
      }
    }
  }
  return { updatedAt: text(root.Update_Time), events };
}
