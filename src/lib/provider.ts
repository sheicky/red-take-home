// The one seam between the rules and the outside world.
// Live mode hits the public APIs; scenario mode replays recorded or synthetic payloads.
// Every source module takes a Provider, so the whole pipeline runs offline in tests and demos.

export interface NwsPoint {
  forecastUrl: string;
  timeZone: string;
  office: string;
}

export interface Provider {
  now(): Date;
  faaStatusXml(): Promise<string>;
  taf(icaos: string[]): Promise<unknown[]>;
  metar(icaos: string[]): Promise<unknown[]>;
  nwsPoint(lat: number, lon: number): Promise<NwsPoint>;
  nwsForecast(url: string): Promise<unknown>;
  nwsAlerts(lat: number, lon: number): Promise<unknown>;
  adsbdbCallsign(callsign: string): Promise<unknown>;
  /** Optional paid-tier-free enrichment; null when no key is configured. */
  aviationstack: ((flightIata: string) => Promise<unknown>) | null;
}

export const URLS = {
  faa: "https://nasstatus.faa.gov/api/airport-status-information",
  faaHuman: "https://nasstatus.faa.gov/",
  taf: (ids: string[]) => `https://aviationweather.gov/api/data/taf?ids=${ids.join(",")}&format=json`,
  metar: (ids: string[]) => `https://aviationweather.gov/api/data/metar?ids=${ids.join(",")}&format=json`,
  tafHuman: (id: string) => `https://aviationweather.gov/data/taf/?ids=${id}`,
  nwsPoint: (lat: number, lon: number) => `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
  nwsAlerts: (lat: number, lon: number) => `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
  nwsHuman: (lat: number, lon: number) => `https://forecast.weather.gov/MapClick.php?lat=${lat}&lon=${lon}`,
  adsbdb: (cs: string) => `https://api.adsbdb.com/v0/callsign/${cs}`,
  bts: "https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FGJ",
  aviationstack: "https://aviationstack.com/documentation",
};

// api.weather.gov answers 403 without a User-Agent (checked 2026-09-25). They ask for a contact in it.
const USER_AGENT = process.env.NWS_USER_AGENT || "travel-risk-prototype (github.com/travel-risk; ops-demo)";
const TIMEOUT_MS = 8000;

type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();

/** Small TTL cache: the demo re-runs the same route often, and FAA/NWS ask clients to be polite. */
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function get(url: string, accept = "application/json"): Promise<Response> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return res;
}

const MIN = 60_000;

export const liveProvider: Provider = {
  now: () => new Date(),
  faaStatusXml: () => cached("faa", 2 * MIN, async () => (await get(URLS.faa, "application/xml")).text()),
  taf: (ids) => cached(`taf:${ids.join()}`, 10 * MIN, async () => (await get(URLS.taf(ids))).json()),
  metar: (ids) => cached(`metar:${ids.join()}`, 5 * MIN, async () => (await get(URLS.metar(ids))).json()),
  nwsPoint: (lat, lon) =>
    cached(`pt:${lat},${lon}`, 24 * 60 * MIN, async () => {
      const j = await (await get(URLS.nwsPoint(lat, lon), "application/geo+json")).json();
      return { forecastUrl: j.properties.forecast, timeZone: j.properties.timeZone, office: j.properties.gridId };
    }),
  nwsForecast: (url) => cached(`fc:${url}`, 15 * MIN, async () => (await get(url, "application/geo+json")).json()),
  nwsAlerts: (lat, lon) =>
    cached(`al:${lat},${lon}`, 5 * MIN, async () => (await get(URLS.nwsAlerts(lat, lon), "application/geo+json")).json()),
  adsbdbCallsign: (cs) => cached(`adsb:${cs}`, 60 * MIN, async () => (await get(URLS.adsbdb(cs))).json()),
  aviationstack: process.env.AVIATIONSTACK_KEY
    ? (flightIata) =>
        cached(`as:${flightIata}`, 10 * MIN, async () => {
          const key = process.env.AVIATIONSTACK_KEY!;
          // The free plan historically served plain HTTP only; the base is configurable for that reason.
          const base = process.env.AVIATIONSTACK_BASE || "https://api.aviationstack.com";
          const r = await fetch(`${base}/v1/flights?access_key=${key}&flight_iata=${flightIata}`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          const j = await r.json();
          if (j.error) throw new Error(`aviationstack: ${j.error.code ?? j.error.type ?? "error"}`);
          return j;
        })
    : null,
};
