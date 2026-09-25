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
};

const all = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => Number(m[1]));

/** Weather sentences name several conditions; the tile keeps the one that disrupts most. */
function weather(s: string): Omit<Signal, "basis"> {
  const cause =
    /snow|blizzard/i.test(s) ? "Snow"
    : /thunder/i.test(s) ? "Storms"
    : /freezing|ice pellets|sleet/i.test(s) ? "Freezing rain"
    : /cloud/i.test(s) ? "Low cloud"
    : /fog/i.test(s) ? "Fog"
    : /wind|gust|shear/i.test(s) ? "Wind"
    : "Weather";
  const gustMph = all(/gusts of \d+ kt \((\d+) mph\)/g, s);
  const windMph = [...all(/steady wind of \d+ kt \((\d+) mph\)/g, s), ...all(/wind up to (\d+) mph/g, s)];
  const ceilings = all(/cloud base (\d+) ft/g, s);
  const metric =
    cause === "Low cloud" && ceilings.length ? `cloud at ${Math.min(...ceilings)} ft`
    : gustMph.length ? `gusts ${Math.max(...gustMph)} mph`
    : windMph.length ? `wind ${Math.max(...windMph)} mph`
    : ceilings.length ? `cloud at ${Math.min(...ceilings)} ft`
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
      return { cause: /has an? (.+?) in effect/.exec(s)?.[1] ?? "NWS alert" };
    case "bts-route": {
      if (/^No regular nonstop/.test(s)) return { cause: "No nonstop" };
      const late = /(\d+%) late/.exec(s)?.[1];
      return late ? { cause: "Often late", metric: `${late} late` } : { cause: "History" };
    }
    default:
      return weather(s);
  }
}

/**
 * Reads the summary the rules wrote. Coupled to the wording in rules.ts on purpose:
 * signal.test.ts runs the real pipeline, so a rewording there fails the build instead of the page.
 */
export function signalOf(f: Factor, evidence: Evidence[]): Signal {
  const source = evidence.find((e) => e.id === f.evidence[0])?.source;
  return { ...parse(source, f.summary), basis: source ? BASIS[source] : "Rule" };
}

/** One plain sentence per cause: what it does to a flight. Shown under the numbers, never scored. */
const IMPACT: Record<string, string> = {
  Wind: "Strong wind slows takeoffs and landings, and can shut a runway.",
  "Low cloud": "In low cloud, planes land further apart, so fewer flights get in each hour.",
  Fog: "In fog, planes land further apart, so fewer flights get in each hour.",
  Storms: "Storms stop work on the ramp and close flight paths. Delays spread fast.",
  Snow: "Every plane needs de-icing and runways need clearing. Expect waits.",
  "Freezing rain": "Every plane needs de-icing before takeoff. Expect waits.",
  "Ground delay": "Flights to this airport wait at their departure gate until a landing slot opens.",
  "Ground stop": "Flights to this airport cannot leave until the stop ends.",
  "Arrival delays": "Planes are landing late here, which pushes back the flights that use them next.",
  "Departure delays": "Flights are leaving this airport late right now.",
  Closed: "No flights in or out while the airport is closed.",
  "No nonstop": "A connection means a second airport, and a chance to miss the next flight.",
  "Often late": "On this route, flights in this month were late more often than average.",
};
export const impactOf = (cause: string): string | undefined =>
  IMPACT[cause] ?? (/warning|advisory|watch/i.test(cause) ? "The weather service expects conditions bad enough to warn the public. Airlines often allow free changes." : undefined);

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
