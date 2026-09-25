import { SCENARIOS } from "@/lib/scenarios";

export async function GET() {
  return Response.json(SCENARIOS.map(({ id, label, description, synthetic, recordedAt, preset }) => ({ id, label, description, synthetic, recordedAt, preset })));
}
