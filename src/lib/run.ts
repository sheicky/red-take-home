import { assess, InputError } from "./assess";
import { liveProvider } from "./provider";
import { scenarioById } from "./scenarios";
import type { Assessment, AssessmentRequest } from "./types";

export type Run = { ok: true; assessment: Assessment } | { ok: false; status: 400 | 500; error: string };

/** Server-only entry shared by the page and the API route: API keys never reach the browser. */
export async function runAssessment(req: AssessmentRequest): Promise<Run> {
  const sc = req.scenario ? scenarioById(req.scenario) : undefined;
  if (req.scenario && !sc) return { ok: false, status: 400, error: `Unknown scenario "${req.scenario}".` };
  try {
    const assessment = await assess(
      { origin: req.origin.toUpperCase(), destination: req.destination.toUpperCase(), date: req.date, flight: req.flight || undefined, scenario: req.scenario },
      sc ? sc.provider() : liveProvider,
      sc ? { id: sc.id, label: sc.label, synthetic: sc.synthetic, recordedAt: sc.recordedAt } : undefined,
    );
    return { ok: true, assessment };
  } catch (e) {
    if (e instanceof InputError) return { ok: false, status: 400, error: e.message };
    console.error(e);
    return { ok: false, status: 500, error: "Assessment failed unexpectedly. See server logs." };
  }
}
