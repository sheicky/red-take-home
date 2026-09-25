import { runAssessment } from "@/lib/run";
import type { AssessmentRequest } from "@/lib/types";

export async function POST(request: Request) {
  let body: Partial<AssessmentRequest>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const r = await runAssessment({ origin: String(body.origin ?? ""), destination: String(body.destination ?? ""), date: String(body.date ?? "") });
  return r.ok ? Response.json(r.assessment) : Response.json({ error: r.error }, { status: r.status });
}
