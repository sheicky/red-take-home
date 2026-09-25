// Cities an Ops agent types, mapped to the commercial airports that actually serve them.
// "New York" is three airports with three different FAA programs on the same day
// (2026-09-25: LGA under a 1 h 54 ground delay program, JFK and EWR not). Picking one silently
// would be wrong, so the tool evaluates the chosen airport AND shows the others as alternates.

export interface Metro {
  id: string;
  name: string;
  aliases: string[];
  airports: string[]; // primary first
}

export const METROS: Metro[] = [
  { id: "NYC", name: "New York City area", aliases: ["new york", "nyc", "ny", "manhattan", "newark"], airports: ["JFK", "LGA", "EWR"] },
  { id: "SFBAY", name: "San Francisco Bay Area", aliases: ["san francisco", "sf", "bay area", "oakland", "san jose", "silicon valley"], airports: ["SFO", "OAK", "SJC"] },
  { id: "LA", name: "Los Angeles area", aliases: ["los angeles", "la", "burbank", "long beach", "orange county", "santa ana", "ontario"], airports: ["LAX", "BUR", "LGB", "SNA", "ONT"] },
  { id: "CHI", name: "Chicago", aliases: ["chicago", "chi"], airports: ["ORD", "MDW"] },
  { id: "WAS", name: "Washington, D.C. / Baltimore", aliases: ["washington", "dc", "washington dc", "baltimore"], airports: ["DCA", "IAD", "BWI"] },
  { id: "DFW", name: "Dallas–Fort Worth", aliases: ["dallas", "fort worth", "dfw"], airports: ["DFW", "DAL"] },
  { id: "HOU", name: "Houston", aliases: ["houston"], airports: ["IAH", "HOU"] },
  { id: "MIA", name: "South Florida", aliases: ["miami", "fort lauderdale", "west palm beach", "south florida"], airports: ["MIA", "FLL", "PBI"] },
  { id: "BOS", name: "Boston", aliases: ["boston"], airports: ["BOS"] },
  { id: "SEA", name: "Seattle", aliases: ["seattle"], airports: ["SEA"] },
  { id: "ATL", name: "Atlanta", aliases: ["atlanta"], airports: ["ATL"] },
  { id: "DEN", name: "Denver", aliases: ["denver"], airports: ["DEN"] },
  { id: "PHX", name: "Phoenix", aliases: ["phoenix"], airports: ["PHX"] },
  { id: "ORL", name: "Orlando", aliases: ["orlando"], airports: ["MCO", "SFB"] },
  { id: "DTT", name: "Detroit", aliases: ["detroit"], airports: ["DTW"] },
  { id: "MSP", name: "Minneapolis–St. Paul", aliases: ["minneapolis", "st paul", "saint paul", "twin cities"], airports: ["MSP"] },
  { id: "LAS", name: "Las Vegas", aliases: ["las vegas", "vegas"], airports: ["LAS"] },
];

export const metroOf = (iata: string) => METROS.find((m) => m.airports.includes(iata));
