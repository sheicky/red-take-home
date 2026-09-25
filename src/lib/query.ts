import type { AssessmentRequest } from "./types";

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

/** The trip, read from the page URL. Null until origin, destination and date are all there. */
export function requestFromParams(p: Params): AssessmentRequest | null {
  const origin = one(p.from).toUpperCase();
  const destination = one(p.to).toUpperCase();
  const date = one(p.date);
  return origin && destination && date ? { origin, destination, date } : null;
}

export function searchFor(r: AssessmentRequest): string {
  return new URLSearchParams({ from: r.origin, to: r.destination, date: r.date }).toString();
}
