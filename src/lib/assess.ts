// The pipeline: resolve → decide what each source can say about that date → fetch in parallel →
// rules → level & confidence → actions → narrative. Every source failure degrades the answer
// (and says so in `sources` and `confidence`), none of them breaks it.

import type { Airport, Alternate, Assessment, AssessmentRequest, Confidence, Level, SourceId, SourceStatus, Window } from "./types";
import { levelRank, maxLevel } from "./types";
import type { Provider } from "./provider";
import { URLS } from "./provider";
import { airportByIata, loadBts, type Stats } from "./data";
import { metroOf } from "./metros";
import { addDays, daysBetween, horizonFor, localDate, zonedInstant } from "./time";
import { parseFaa, type FaaSnapshot } from "./sources/faa";
import { parseMetars, parseTafs, type Taf } from "./sources/awc";
import { parseAlerts, parseForecast } from "./sources/nws";
import { alertRules, btsRouteRules, EvidenceBook, faaRules, forecastRules, metarRules, tafRules } from "./rules";
import { narrate } from "./narrate";

export class InputError extends Error {}

const SOURCE_NAMES: Record<SourceId, [string, string]> = {
  faa: ["FAA NAS Status (ground stops, delay programs)", URLS.faaHuman],
  metar: ["METAR: current airport observations (aviationweather.gov)", "https://aviationweather.gov/data/metar/"],
  taf: ["TAF: airport forecasts, 24–30 h (aviationweather.gov)", "https://aviationweather.gov/data/taf/"],
  "nws-forecast": ["NWS 7-day forecast (api.weather.gov)", "https://www.weather.gov/documentation/services-web-api"],
  "nws-alerts": ["NWS active alerts (api.weather.gov)", "https://alerts.weather.gov/"],
  "bts-route": ["BTS on-time history, route × month", URLS.bts],
};

const errMsg = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : "");

let nationalCache: { key: string; byMonth: Record<string, Stats> } | null = null;
function nationalStats(month: number): Stats {
  const bts = loadBts();
  const key = bts.window.to;
  if (nationalCache?.key !== key) {
    const byMonth: Record<string, Stats> = {};
    for (const months of Object.values(bts.routes)) {
      for (const [m, s] of Object.entries(months)) {
        const acc = (byMonth[m] ??= [0, 0, 0, 0, 0, 0]);
        s.forEach((v, i) => (acc[i] += v));
      }
    }
    nationalCache = { key, byMonth };
  }
  return nationalCache.byMonth[String(month)] ?? [0, 0, 0, 0, 0, 0];
}

async function nwsBundle(p: Provider, a: Airport, wantForecast: boolean, wantAlerts: boolean) {
  const point = await p.nwsPoint(a.lat, a.lon);
  const [forecast, alerts] = await Promise.allSettled([
    wantForecast ? p.nwsForecast(point.forecastUrl) : Promise.resolve(null),
    wantAlerts ? p.nwsAlerts(a.lat, a.lon) : Promise.resolve(null),
  ]);
  return { point, forecast, alerts };
}

export async function assess(req: AssessmentRequest, provider: Provider): Promise<Assessment> {
  const now = provider.now();
  const origin = airportByIata(req.origin ?? "");
  const destination = airportByIata(req.destination ?? "");
  if (!origin) throw new InputError(`Unknown origin airport "${req.origin}".`);
  if (!destination) throw new InputError(`Unknown destination airport "${req.destination}".`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.date ?? "")) throw new InputError("Date must be YYYY-MM-DD.");

  const bts = loadBts();
  const btsWindow = `${bts.window.from} to ${bts.window.to}`;
  if (origin.iata === destination.iata) throw new InputError("Origin and destination are the same airport.");

  // ── Horizon, in the ORIGIN's local calendar.
  const today = localDate(now, origin.tz);
  const daysAhead = daysBetween(today, req.date);
  if (daysAhead < 0) throw new InputError(`${req.date} is already past at ${origin.iata} (local date there is ${today}).`);
  if (daysAhead > 366) throw new InputError("Pick a date within the next 12 months.");
  const horizon = horizonFor(daysAhead, req.date);

  // ── The weather is read over the whole travel day: departure is unknown, so morning to night.
  let oFrom = zonedInstant(req.date, "05:00", origin.tz);
  if (daysAhead === 0 && oFrom < now) oFrom = now;
  const oWin: Window = { airport: origin.iata, tz: origin.tz, from: oFrom.toISOString(), to: zonedInstant(req.date, "23:59", origin.tz).toISOString() };
  const dWin: Window = { airport: destination.iata, tz: destination.tz, from: zonedInstant(req.date, "07:00", destination.tz).toISOString(), to: zonedInstant(addDays(req.date, 1), "01:00", destination.tz).toISOString() };

  const altAirports = (a: Airport) => (metroOf(a.iata)?.airports ?? []).filter((x) => x !== a.iata).map((x) => airportByIata(x)).filter((x): x is Airport => !!x);
  const altO = altAirports(origin);
  const altD = altAirports(destination);

  // ── Fetch everything that can say something about this date, in parallel.
  const A = horizon.applicable;
  const icaos = [...new Set([origin, destination, ...altO, ...altD].map((a) => a.icao))];
  const [faaR, tafR, metarR, oNws, dNws] = await Promise.allSettled([
    A.faa ? provider.faaStatusXml() : Promise.resolve(null),
    A.taf ? provider.taf(icaos) : Promise.resolve(null),
    A.metar ? provider.metar([origin.icao, destination.icao]) : Promise.resolve(null),
    A["nws-forecast"] || A["nws-alerts"] ? nwsBundle(provider, origin, !!A["nws-forecast"], !!A["nws-alerts"]) : Promise.resolve(null),
    A["nws-forecast"] || A["nws-alerts"] ? nwsBundle(provider, destination, !!A["nws-forecast"], !!A["nws-alerts"]) : Promise.resolve(null),
  ]);

  const book = new EvidenceBook();
  const sources: SourceStatus[] = [];
  const fetchedAt = now.toISOString();
  const status = (source: SourceId, state: SourceStatus["state"], note?: string) =>
    sources.push({ source, name: SOURCE_NAMES[source][0], url: SOURCE_NAMES[source][1], state, note, fetchedAt: state === "ok" ? fetchedAt : undefined });
  const notApplicable = (why: string) => `Not used for a trip ${daysAhead} day(s) out: ${why}`;

  // FAA
  let faa: FaaSnapshot | null = null;
  if (!A.faa) status("faa", "not-applicable", notApplicable("FAA status is a snapshot of right now; a program running today says nothing about that date."));
  else if (faaR.status === "rejected") status("faa", "error", errMsg(faaR));
  else {
    faa = parseFaa(faaR.value as string, now);
    faaRules(book, faa, origin.iata, "origin");
    faaRules(book, faa, destination.iata, "destination");
    status("faa", "ok", `Snapshot ${faa.updatedAt}`);
  }

  // TAF
  let tafs: Taf[] = [];
  if (!A.taf) status("taf", "not-applicable", notApplicable("TAFs cover 24–30 h from issue."));
  else if (tafR.status === "rejected") status("taf", "error", errMsg(tafR));
  else {
    tafs = parseTafs((tafR.value as unknown[]) ?? []);
    const res = [tafRules(book, tafs.find((t) => t.icao === origin.icao), oWin, "origin"), tafRules(book, tafs.find((t) => t.icao === destination.icao), dWin, "destination")];
    const notes = [`${origin.iata}: ${res[0]}`, `${destination.iata}: ${res[1]}`].filter((n) => !n.endsWith("ok"));
    status("taf", res.includes("ok") ? "ok" : "no-data", notes.length ? `Not covered or missing: ${notes.join(", ")}` : undefined);
  }

  // METAR
  if (!A.metar) status("metar", "not-applicable", notApplicable("an observation describes now."));
  else if (metarR.status === "rejected") status("metar", "error", errMsg(metarR));
  else {
    const ms = parseMetars((metarR.value as unknown[]) ?? []);
    metarRules(book, ms.find((m) => m.icao === origin.icao), oWin, "origin", now);
    metarRules(book, ms.find((m) => m.icao === destination.icao), dWin, "destination", now);
    status("metar", ms.length ? "ok" : "no-data");
  }

  // NWS
  const fcNotes: string[] = [];
  const alNotes: string[] = [];
  let fcOk = false, alOk = false, fcErr = false, alErr = false;
  for (const [r, a, w, side] of [[oNws, origin, oWin, "origin"], [dNws, destination, dWin, "destination"]] as const) {
    if (r.status === "rejected") { fcErr = alErr = true; fcNotes.push(`${a.iata}: ${errMsg(r)}`); alNotes.push(`${a.iata}: ${errMsg(r)}`); continue; }
    if (!r.value) continue;
    const { point, forecast, alerts } = r.value;
    if (A["nws-forecast"]) {
      if (forecast.status === "rejected") { fcErr = true; fcNotes.push(`${a.iata}: ${errMsg(forecast)}`); }
      else if (forecast.value) {
        const used = forecastRules(book, parseForecast(forecast.value).periods, w, side, point.office, URLS.nwsHuman(a.lat, a.lon));
        if (used) fcOk = true; else fcNotes.push(`${a.iata}: no forecast period covers the window`);
      }
    }
    if (A["nws-alerts"]) {
      if (alerts.status === "rejected") { alErr = true; alNotes.push(`${a.iata}: ${errMsg(alerts)}`); }
      else if (alerts.value) { alertRules(book, parseAlerts(alerts.value), w, side); alOk = true; }
    }
  }
  if (!A["nws-forecast"]) status("nws-forecast", "not-applicable", notApplicable("the NWS forecast runs ~7 days."));
  else status("nws-forecast", fcOk ? "ok" : fcErr ? "error" : "no-data", fcNotes.join("; ") || undefined);
  if (!A["nws-alerts"]) status("nws-alerts", "not-applicable", notApplicable("alerts are issued at most a few days ahead."));
  else status("nws-alerts", alOk ? "ok" : alErr ? "error" : "no-data", alNotes.join("; ") || undefined);

  // BTS route history
  const month = +req.date.slice(5, 7);
  const routeMonths = bts.routes[`${origin.iata}-${destination.iata}`] ?? {};
  const routeRes = btsRouteRules(book, routeMonths[String(month)], nationalStats(month), origin.iata, destination.iata, month, btsWindow, Object.keys(routeMonths).map(Number).sort((a, b) => a - b));
  status("bts-route", routeRes === "ok" ? "ok" : "no-data", `${btsWindow}, bundled${routeRes === "no-route" ? ", no nonstop history for this pair" : routeRes === "no-month" ? ", no history for this month" : ""}`);

  // ── Alternates in the same metro area: same checks, same windows, scored separately.
  const alternates: Alternate[] = [];
  for (const [side, alts, w] of [["origin", altO, oWin], ["destination", altD, dWin]] as const) {
    for (const alt of alts) {
      const scratch = new EvidenceBook();
      if (faa) faaRules(scratch, faa, alt.iata, side);
      const t = tafs.find((x) => x.icao === alt.icao);
      if (t) tafRules(scratch, t, { ...w, airport: alt.iata, tz: alt.tz }, side);
      const level = scratch.factors.reduce<Level>((l, f) => maxLevel(l, f.level), "LOW");
      const pair = side === "origin" ? `${alt.iata}-${destination.iata}` : `${origin.iata}-${alt.iata}`;
      const hist = bts.routes[pair]?.[String(month)];
      const onTime = hist ? 1 - (hist[0] - hist[2] - hist[3] > 0 ? hist[1] / (hist[0] - hist[2] - hist[3]) : 0) : undefined;
      alternates.push({
        side, airport: alt.iata, name: alt.name, level,
        reasons: scratch.factors.length ? scratch.factors.map((f) => f.summary) : [faa || t ? "No program or adverse forecast found." : "No live data for this date. History only."],
        routeOnTime: onTime,
      });
    }
  }

  // ── Verdict
  const level = book.factors.reduce<Level>((l, f) => maxLevel(l, f.level), "LOW");

  const reasons: string[] = [];
  let conf: Confidence = daysAhead <= 1 ? "HIGH" : daysAhead <= 3 ? "MEDIUM" : daysAhead <= 7 ? "LOW" : "VERY_LOW";
  reasons.push(
    daysAhead <= 1 ? "Live airport status and airport forecasts cover this date."
      : daysAhead <= 7 ? `Only the general forecast reaches ${daysAhead} days out; forecast skill drops with each day.`
        : "Beyond the forecast horizon: only historical rates are available.",
  );
  const broken = sources.filter((s) => s.state === "error" && ["faa", "taf", "nws-forecast", "nws-alerts"].includes(s.source));
  if (broken.length) {
    const steps: Confidence[] = ["HIGH", "MEDIUM", "LOW", "VERY_LOW"];
    conf = steps[Math.min(3, steps.indexOf(conf) + 1)];
    reasons.push(`Source(s) unavailable: ${broken.map((s) => s.source).join(", ")}. A disruption there would not be seen.`);
  }
  if (daysAhead <= 1) reasons.push("The departure time is not known: weather is read over the whole day, so a short event may be over-weighted.");
  if (routeRes === "no-route") reasons.push("No nonstop history: a connecting hub is not assessed.");
  if (routeRes === "no-month") reasons.push("No on-time history for this month on this route.");

  // ── Actions: from the factors first (most severe first), then alternates, then the horizon.
  const actions: string[] = [];
  for (const f of [...book.factors].sort((a, b) => levelRank(b.level) - levelRank(a.level))) if (f.action && !actions.includes(f.action)) actions.push(f.action);
  if (levelRank(level) >= 2) {
    const worstSide = [...book.factors].sort((a, b) => levelRank(b.level) - levelRank(a.level))[0]?.side;
    const better = alternates.filter((x) => x.side === worstSide && x.level === "LOW" && daysAhead <= 1);
    if (better.length) actions.push(`Consider rebooking via ${better.map((b) => `${b.airport}${b.routeOnTime !== undefined ? ` (${Math.round(b.routeOnTime * 100)}% on time historically)` : ""}`).join(" or ")}: no program or adverse forecast there.`);
  }
  const DEFAULTS: Record<Level, string> = {
    LOW: "No action needed now.",
    MODERATE: "Brief the traveler: allow extra time at the airport, avoid tight onward commitments, turn on airline app notifications.",
    HIGH: "Contact the traveler proactively and line up a rebooking option before the airline's inventory goes.",
    SEVERE: "Contact the traveler now; do not let them head to the airport before the flight status is confirmed.",
  };
  actions.unshift(DEFAULTS[level]);
  if (horizon.recheck) actions.push(horizon.recheck);

  const base: Omit<Assessment, "narrative"> = {
    request: req, origin, destination, horizon, windows: [oWin, dWin], level,
    confidence: { level: conf, reasons },
    factors: book.factors, evidence: book.items, actions, alternates, sources,
    generatedAt: now.toISOString(),
  };
  return { ...base, narrative: await narrate(base) };
}

