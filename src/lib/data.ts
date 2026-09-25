// Bundled, pre-computed datasets. Built offline by scripts/build_bts.py and scripts/build_airports.py,
// loaded once per server process. Nothing here is fetched at request time.

import fs from "node:fs";
import path from "node:path";
import type { Airport } from "./types";

/** [flights, arrDel15, cancelled, diverted, weatherCancelled, weatherOrNasDelayed] */
export type Stats = [number, number, number, number, number, number];

export interface BtsData {
  source: string;
  window: { from: string; to: string; months: number };
  airports: Record<string, { city: string; state: string }>;
  routes: Record<string, Record<string, Stats>>;
  airportMonths: Record<string, Record<string, Stats>>;
}

let bts: BtsData | null = null;
let airports: Airport[] | null = null;

const dataDir = () => path.join(process.cwd(), "data");

export function loadBts(): BtsData {
  bts ??= JSON.parse(fs.readFileSync(path.join(dataDir(), "bts.json"), "utf8")) as BtsData;
  return bts;
}

export function loadAirports(): Airport[] {
  airports ??= JSON.parse(fs.readFileSync(path.join(dataDir(), "airports.json"), "utf8")) as Airport[];
  return airports;
}

export function airportByIata(code: string): Airport | undefined {
  return loadAirports().find((a) => a.iata === code.toUpperCase());
}
