import { cachedAssessment, cachedBriefing } from "@/lib/run";
import type { AssessmentRequest } from "@/lib/types";

/** The same assessment as the page, as JSON, with the AI briefing attached. */
export async function POST(request: Request) {
  let body: Partial<AssessmentRequest>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const r = await cachedAssessment({ origin: String(body.origin ?? ""), destination: String(body.destination ?? ""), date: String(body.date ?? "") });
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ ...r.assessment, briefing: await cachedBriefing(r.assessment) });
}
