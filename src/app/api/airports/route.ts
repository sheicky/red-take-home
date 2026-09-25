import { searchAirports } from "@/lib/search";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json(searchAirports(q));
}
