// The one seam between the rules and the outside world.
// Live mode hits the public APIs; tests replay payloads captured from those same APIs.
// Every source module takes a Provider, so the whole pipeline runs offline in tests.

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
  bts: "https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FGJ",
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
};
