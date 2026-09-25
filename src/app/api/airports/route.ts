import { popularAirports, searchAirports } from "@/lib/search";

/** ?q=boston searches; ?popular=1 lists the busiest airports, for an empty field. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.get("popular")) return Response.json(popularAirports());
  return Response.json(searchAirports(p.get("q") ?? ""));
}
