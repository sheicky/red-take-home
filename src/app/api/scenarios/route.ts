import { SCENARIOS } from "@/lib/scenarios";

export async function GET() {
  return Response.json(SCENARIOS.map(({ id, short, synthetic, preset }) => ({ id, short, synthetic, preset })));
}
