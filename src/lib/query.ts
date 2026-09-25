import type { AssessmentRequest } from "./types";

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

/** The trip, read from the page URL. Null until origin, destination and date are all there. */
export function requestFromParams(p: Params): AssessmentRequest | null {
  const origin = one(p.from).toUpperCase();
  const destination = one(p.to).toUpperCase();
  const date = one(p.date);
  if (!origin || !destination || !date) return null;
  const req: AssessmentRequest = { origin, destination, date };
  if (one(p.flight)) req.flight = one(p.flight);
  if (one(p.data)) req.scenario = one(p.data);
  return req;
}

export function searchFor(r: AssessmentRequest): string {
  const q = new URLSearchParams({ from: r.origin, to: r.destination, date: r.date });
  if (r.flight?.trim()) q.set("flight", r.flight.trim());
  if (r.scenario) q.set("data", r.scenario);
  return q.toString();
}
