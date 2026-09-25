import { handleChat } from "@/lib/ai/chat";
import { cachedAssessment } from "@/lib/run";

export async function POST(request: Request) {
  let body: Parameters<typeof handleChat>[0];
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  return handleChat(body, { assessment: cachedAssessment, fetchImpl: fetch, signal: request.signal });
}
