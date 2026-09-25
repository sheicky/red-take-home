import { writeBriefing } from "./ai/briefing";
import { assess, InputError } from "./assess";
import { liveProvider, type Provider } from "./provider";
import { searchFor } from "./query";
import type { Assessment, AssessmentRequest, Briefing } from "./types";

export type Run = { ok: true; assessment: Assessment } | { ok: false; status: 400 | 500; error: string };

/** Server-only entry: API keys never reach the browser. */
export async function runAssessment(req: AssessmentRequest, provider: Provider = liveProvider): Promise<Run> {
  try {
    const assessment = await assess({ origin: req.origin.toUpperCase(), destination: req.destination.toUpperCase(), date: req.date }, provider);
    return { ok: true, assessment };
  } catch (e) {
    if (e instanceof InputError) return { ok: false, status: 400, error: e.message };
    console.error(e);
    return { ok: false, status: 500, error: "Assessment failed unexpectedly. See server logs." };
  }
}

// One assessment per trip for five minutes. The page and the chat read the same object, so the
// chat answers about exactly what is on screen, and a chat message costs no source calls and
// no second briefing. Failures are not kept.
const TTL_MS = 5 * 60_000;
const MAX_TRIPS = 200;
const memo = new WeakMap<Provider, Map<string, { at: number; run: Promise<Run> }>>();

export function cachedAssessment(req: AssessmentRequest, provider: Provider = liveProvider): Promise<Run> {
  let trips = memo.get(provider);
  if (!trips) memo.set(provider, (trips = new Map()));
  const key = searchFor({ ...req, origin: req.origin.toUpperCase(), destination: req.destination.toUpperCase() });
  const hit = trips.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.run;
  const run = runAssessment(req, provider);
  trips.set(key, { at: Date.now(), run });
  if (trips.size > MAX_TRIPS) trips.delete(trips.keys().next().value!);
  run.then((r) => { if (!r.ok) trips.delete(key); });
  return run;
}

// The briefing is cached with the same key: reloading the page does not pay for a second draft.
const briefings = new Map<string, { at: number; b: Promise<Briefing> }>();

export function cachedBriefing(a: Assessment): Promise<Briefing> {
  const key = `${searchFor(a.request)}@${a.generatedAt}`;
  const hit = briefings.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.b;
  const b = writeBriefing(a);
  briefings.set(key, { at: Date.now(), b });
  if (briefings.size > MAX_TRIPS) briefings.delete(briefings.keys().next().value!);
  b.then((x) => { if (!x.ok) briefings.delete(key); });
  return b;
}
