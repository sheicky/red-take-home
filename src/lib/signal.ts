import type { Evidence, Factor, Level, SourceId } from "./types";

/** A factor reduced to what fits on a tile: the cause, one number, and where it came from. */
export interface Signal {
  cause: string;
  metric?: string;
  basis: string;
}

const BASIS: Record<SourceId, string> = {
  faa: "FAA",
  metar: "Now",
  taf: "Forecast",
  "nws-forecast": "NWS forecast",
  "nws-alerts": "NWS alert",
  "bts-route": "History",
  "bts-flight": "History",
  adsbdb: "Filed route",
  aviationstack: "Airline",
};

const all = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => Number(m[1]));

/** Weather sentences name several conditions; the tile keeps the one that disrupts most. */
function weather(s: string): Omit<Signal, "basis"> {
  const cause =
    /snow|blizzard|\bSN\b/i.test(s) ? "Snow"
    : /thunder|\bTS/.test(s) ? "Storms"
    : /freezing|FZRA|FZDZ/.test(s) ? "Freezing rain"
    : /IFR|ceiling|visibility/.test(s) ? "Low cloud"
    : /wind|gust|shear/i.test(s) ? "Wind"
    : "Weather";
  const gusts = all(/gust(?:ing|s)? (\d+) kt/g, s);
  const mph = all(/wind up to (\d+) mph/g, s);
  const ceilings = all(/\((\d+) ft,/g, s);
  const metric =
    cause === "Low cloud" && ceilings.length ? `${Math.min(...ceilings)} ft`
    : gusts.length ? `gusts ${Math.max(...gusts)} kt`
    : mph.length ? `${Math.max(...mph)} mph`
    : ceilings.length ? `${Math.min(...ceilings)} ft`
    : undefined;
  return metric ? { cause, metric } : { cause };
}

function parse(source: SourceId | undefined, s: string): Omit<Signal, "basis"> {
  switch (source) {
    case "faa": {
      if (/^Ground delay program/.test(s)) {
        const avg = /avg (\d+) min/.exec(s)?.[1];
        return avg ? { cause: "Ground delay", metric: `${avg} min avg` } : { cause: "Ground delay" };
      }
      if (/^Ground stop/.test(s)) {
        const until = /until ~?(.+?)\.?$/.exec(s)?.[1];
        return until ? { cause: "Ground stop", metric: `until ${until}` } : { cause: "Ground stop" };
      }
      const d = /^(Arrival|Departure) delays at \w+: (\S+ min)/.exec(s);
      if (d) return { cause: `${d[1]} delays`, metric: d[2] };
      if (/as closed/.test(s)) return { cause: "Closed" };
      return { cause: "FAA program" };
    }
    case "nws-alerts":
      return { cause: /^(.+?) in effect/.exec(s)?.[1] ?? "NWS alert" };
    case "bts-route":
    case "bts-flight":
    case "adsbdb": {
      if (/^No regular nonstop/.test(s)) return { cause: "No nonstop" };
      if (/is not known on/.test(s)) return { cause: "Not on route" };
      const late = /(\d+%) late/.exec(s)?.[1];
      return late ? { cause: "Often late", metric: `${late} late` } : { cause: "History" };
    }
    case "aviationstack": {
      const m = /reports \S+ (\w+)(?:, (\d+ min late))?/.exec(s);
      if (!m) return { cause: "Airline status" };
      const cause = m[1][0].toUpperCase() + m[1].slice(1);
      return m[2] ? { cause, metric: m[2] } : { cause };
    }
    default:
      return weather(s);
  }
}

/**
 * Reads the summary the rules wrote. Coupled to the wording in rules.ts and assess.ts on purpose:
 * signal.test.ts runs the real pipeline, so a rewording there fails the build instead of the page.
 */
export function signalOf(f: Factor, evidence: Evidence[]): Signal {
  const source = evidence.find((e) => e.id === f.evidence[0])?.source;
  return { ...parse(source, f.summary), basis: source ? BASIS[source] : "Rule" };
}

export interface SignalGroup {
  cause: string;
  level: Level;
  metric?: string;
  bases: string[];
  factors: Factor[];
}

const RANK: Record<Level, number> = { LOW: 0, MODERATE: 1, HIGH: 2, SEVERE: 3 };

/** One tile per cause: three sources saying "wind" at JFK are one problem seen three ways. */
export function groupSignals(factors: Factor[], evidence: Evidence[]): SignalGroup[] {
  const groups = new Map<string, SignalGroup>();
  for (const f of [...factors].sort((a, b) => RANK[b.level] - RANK[a.level])) {
    const s = signalOf(f, evidence);
    const g = groups.get(s.cause);
    if (!g) { groups.set(s.cause, { cause: s.cause, level: f.level, metric: s.metric, bases: [s.basis], factors: [f] }); continue; }
    g.factors.push(f);
    g.metric ??= s.metric;
    if (!g.bases.includes(s.basis)) g.bases.push(s.basis);
  }
  return [...groups.values()];
}
