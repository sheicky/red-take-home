import { assess, InputError } from "@/lib/assess";
import { liveProvider } from "@/lib/provider";
import { scenarioById } from "@/lib/scenarios";
import type { AssessmentRequest } from "@/lib/types";

// Server-only: API keys (OpenAI, aviationstack) never reach the browser.
export async function POST(request: Request) {
  let body: AssessmentRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const sc = body.scenario ? scenarioById(body.scenario) : undefined;
  if (body.scenario && !sc) return Response.json({ error: `Unknown scenario "${body.scenario}".` }, { status: 400 });
  try {
    const result = await assess(
      { origin: String(body.origin ?? "").toUpperCase(), destination: String(body.destination ?? "").toUpperCase(), date: String(body.date ?? ""), flight: body.flight ? String(body.flight) : undefined, scenario: body.scenario },
      sc ? sc.provider() : liveProvider,
      sc ? { id: sc.id, label: sc.label, synthetic: sc.synthetic, recordedAt: sc.recordedAt } : undefined,
    );
    return Response.json(result);
  } catch (e) {
    if (e instanceof InputError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Assessment failed unexpectedly. See server logs." }, { status: 500 });
  }
}
