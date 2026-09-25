// Shared vocabulary of the assessment. Everything the UI shows is one of these.

export const LEVELS = ["LOW", "MODERATE", "HIGH", "SEVERE"] as const;
export type Level = (typeof LEVELS)[number];

export const levelRank = (l: Level) => LEVELS.indexOf(l);
export const maxLevel = (a: Level, b: Level): Level => (levelRank(a) >= levelRank(b) ? a : b);
export const lowerLevel = (l: Level): Level => LEVELS[Math.max(0, levelRank(l) - 1)];

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW";

export type SourceId =
  | "faa"
  | "metar"
  | "taf"
  | "nws-forecast"
  | "nws-alerts"
  | "bts-route"
  | "bts-flight"
  | "adsbdb"
  | "aviationstack";

export type Side = "origin" | "destination" | "route" | "flight";

/** One observable fact from one source. Factors and the narrative may only point at these. */
export interface Evidence {
  id: string; // "E1", "E2"… stable within one assessment
  source: SourceId;
  airport?: string;
  title: string;
  detail: string;
  /** When the source says this was true / issued (not when we fetched it). */
  observedAt?: string;
  url: string;
  /** Evidence we looked at and deliberately did NOT count, with the reason. Shown, never scored. */
  ignoredBecause?: string;
}

/** A risk the rules derived from one or more pieces of evidence. */
export interface Factor {
  id: string;
  level: Level;
  side: Side;
  airport?: string;
  summary: string;
  evidence: string[];
  action?: string;
}

export type SourceState = "ok" | "error" | "not-applicable" | "no-data" | "disabled";

export interface SourceStatus {
  source: SourceId;
  name: string;
  url: string;
  state: SourceState;
  note?: string;
  fetchedAt?: string;
}

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
  tz: string;
  /** Scheduled flights departing, from BTS, over the data window. Used for ranking only. */
  departures: number;
  metro?: string;
}

export interface Horizon {
  /** Calendar days between "today at the origin airport" and the travel date. */
  daysAhead: number;
  regime: "today" | "tomorrow" | "week" | "beyond";
  /** Which live sources can say something about that date, and why the others can't. */
  applicable: Partial<Record<SourceId, boolean>>;
  recheck?: string;
}

export interface Window {
  airport: string;
  tz: string;
  from: string; // ISO
  to: string; // ISO
  basis: "scheduled-time" | "whole-day";
}

export interface FlightInfo {
  input: string;
  carrier: string;
  number: string;
  normalized: string; // "UA1234"
  /** Where BTS says this number flew over the data window. */
  btsRoutes: { o: string; d: string; flights: number }[];
  matchesRoute: boolean | null;
  scheduledDeparture?: string; // "HH:MM" local at origin
  scheduledArrival?: string; // "HH:MM" local at destination
  adsbdbRoute?: { o: string; d: string };
  live?: { status: string; depDelayMin?: number; note?: string };
}

export interface Alternate {
  side: "origin" | "destination";
  airport: string;
  name: string;
  level: Level;
  reasons: string[];
  routeOnTime?: number; // historical on-time share for the alternate pair, if BTS has it
}

export interface Narrative {
  by: "llm" | "template";
  summary: string;
  action: string;
  citations: string[];
  model?: string;
  /** Why an LLM draft was thrown away, when it was. */
  rejectedReason?: string;
}

export interface AssessmentRequest {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD, local date at the origin
  flight?: string;
  scenario?: string;
}

export interface Assessment {
  request: AssessmentRequest;
  origin: Airport;
  destination: Airport;
  horizon: Horizon;
  windows: Window[];
  level: Level;
  confidence: { level: Confidence; reasons: string[] };
  factors: Factor[];
  evidence: Evidence[];
  actions: string[];
  alternates: Alternate[];
  flight?: FlightInfo;
  sources: SourceStatus[];
  narrative: Narrative;
  /** Things the tool changed or assumed on the agent's behalf, said out loud. */
  adjustments: string[];
  generatedAt: string;
  scenario?: { id: string; label: string; synthetic: boolean; recordedAt?: string };
}
