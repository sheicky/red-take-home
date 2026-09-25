// Airport search for the form. Typing a CITY returns every commercial airport of that metro area
// (primary first), because "New York" is not one airport.

import { loadAirports } from "./data";
import { METROS, metroOf } from "./metros";

export interface AirportHit {
  iata: string;
  name: string;
  city: string;
  state: string;
  metro?: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function searchAirports(q: string, limit = 8): AirportHit[] {
  const query = norm(q);
  if (!query) return [];
  const all = loadAirports();
  const hit = (iata: string): AirportHit | null => {
    const a = all.find((x) => x.iata === iata);
    return a ? { iata: a.iata, name: a.name, city: a.city, state: a.state, metro: metroOf(a.iata)?.name } : null;
  };
  const out: AirportHit[] = [];
  const push = (h: AirportHit | null) => h && !out.some((o) => o.iata === h.iata) && out.push(h);

  if (query.length === 3) push(hit(query.toUpperCase()));
  for (const m of METROS) {
    if (m.aliases.some((al) => al === query || (query.length >= 3 && al.startsWith(query))) || norm(m.name).startsWith(query)) {
      m.airports.forEach((c) => push(hit(c)));
    }
  }
  // Then plain matches on city / name / code, busiest airports first (loadAirports is pre-sorted).
  for (const a of all) {
    if (out.length >= limit) break;
    // Word starts only: "chi" must find Chicago, not Wi-chi-ta; "ord" must not find Gerald R. F-ord.
    const words = `${norm(a.city)} ${norm(a.name)}`.split(" ");
    if (norm(a.city).startsWith(query) || words.some((w) => w.startsWith(query)) || a.iata.toLowerCase() === query) push(hit(a.iata));
  }
  return out.slice(0, limit);
}
