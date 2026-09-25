import { assess, InputError } from "./assess";
import { liveProvider, type Provider } from "./provider";
import type { Assessment, AssessmentRequest } from "./types";

export type Run = { ok: true; assessment: Assessment } | { ok: false; status: 400 | 500; error: string };

/** Server-only entry shared by the page, the API route and the chat: API keys never reach the browser. */
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
