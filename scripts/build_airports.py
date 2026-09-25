#!/usr/bin/env python3
"""Build data/airports.json: every airport with scheduled airline service in the BTS window,
with coordinates, ICAO code and IANA time zone.

Sources:
  - data/bts.json (run build_bts.py first): which airports airlines actually serve, their city
    as BTS spells it, and departure counts (used to rank search results).
  - mwgg/Airports (MIT licence, github.com/mwgg/Airports): coordinates, ICAO code, time zone.
    The time zone matters: "tomorrow" is computed at the origin airport, not on the agent's laptop.

    python3 scripts/build_airports.py
"""
import json
import os
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
MWGG = "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json"


def main():
    bts = json.load(open(os.path.join(ROOT, "data", "bts.json")))
    with urllib.request.urlopen(MWGG, timeout=60) as r:
        world = json.load(r)
    by_iata = {v["iata"]: v for v in world.values() if v.get("iata")}

    out, missing = [], []
    for code, info in bts["airports"].items():
        m = by_iata.get(code)
        if not m:
            missing.append(code)
            continue
        months = bts["airportMonths"].get(code, {})
        departures = sum(s[0] for s in months.values())
        city, _, st = info["city"].rpartition(", ")
        out.append({
            "iata": code,
            "icao": m["icao"],
            "name": m["name"],
            "city": city or info["city"],
            "state": st or info["state"],
            "lat": round(m["lat"], 4),
            "lon": round(m["lon"], 4),
            "tz": m["tz"],
            "departures": departures,
        })
    out.sort(key=lambda a: -a["departures"])
    path = os.path.join(ROOT, "data", "airports.json")
    with open(path, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"wrote {path}: {len(out)} airports; not found in mwgg: {missing or 'none'}")


if __name__ == "__main__":
    main()
