#!/usr/bin/env python3
"""Build the historical baseline from BTS On-Time Performance data.

Source: U.S. Bureau of Transportation Statistics, "Reporting Carrier On-Time
Performance (1987-present)", monthly PREZIP files from transtats.bts.gov.
Each month is ~31 MB zipped / ~290 MB of CSV. The zip is held in memory and the
CSV streamed out of it, one month at a time: nothing but the aggregate ever lands
on disk (the machine this was built on had a few hundred MB free).

Output: data/bts.json, a few MB, bundled with the app so it never downloads
anything at runtime.

    python3 scripts/build_bts.py                 # 24 months ending at the latest published month
    python3 scripts/build_bts.py --months 12
    python3 scripts/build_bts.py --end 2026-07   # pin the window (reproducible)

Standard library only, on purpose: the reviewer can re-run it without installing anything.
"""
import argparse
import csv
import io
import json
import os
import sys
import time
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date

URL = "https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_{y}_{m}.zip"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "bts.json")

# Route entries below this sample size are dropped: a rate over 5 flights is noise.
MIN_ROUTE_MONTH_FLIGHTS = 20


def month_exists(y, m):
    req = urllib.request.Request(URL.format(y=y, m=m), method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except Exception:
        return False


def latest_published():
    d = date.today()
    y, m = d.year, d.month
    for _ in range(12):
        if month_exists(y, m):
            return y, m
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    sys.exit("No BTS month found in the last 12 months — is transtats.bts.gov reachable?")


def window(end_y, end_m, n):
    out = []
    y, m = end_y, end_m
    for _ in range(n):
        out.append((y, m))
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return list(reversed(out))


def new_stats():
    # n, arrival delayed 15+, cancelled, diverted, weather-cancelled (code B), delayed-with-weather-or-NAS cause
    return [0, 0, 0, 0, 0, 0]


def f(x):
    try:
        return float(x)
    except ValueError:
        return 0.0


def download(url, attempts=3):
    for i in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read()
        except Exception as e:  # transient network errors happen on 24 sequential downloads
            if i == attempts - 1:
                raise
            print(f" retry ({e})", end="", flush=True)
            time.sleep(5 * (i + 1))


def aggregate(months, routes, airports, airport_info):
    for (y, m) in months:
        print(f"  {y}-{m:02d}: downloading…", end="", flush=True)
        blob = io.BytesIO(download(URL.format(y=y, m=m)))
        rows = 0
        with zipfile.ZipFile(blob) as z:
            name = next(n for n in z.namelist() if n.endswith(".csv"))
            reader = csv.reader(io.TextIOWrapper(z.open(name), encoding="latin-1"))
            h = {c: i for i, c in enumerate(next(reader))}
            iM = h["Month"]
            iO, iOc, iOs, iD, iDc, iDs = h["Origin"], h["OriginCityName"], h["OriginState"], h["Dest"], h["DestCityName"], h["DestState"]
            iDep15, iArr15 = h["DepDel15"], h["ArrDel15"]
            iCan, iCode, iDiv, iWx, iNas = h["Cancelled"], h["CancellationCode"], h["Diverted"], h["WeatherDelay"], h["NASDelay"]
            for r in reader:
                rows += 1
                mo = int(r[iM])
                o, d = r[iO], r[iD]
                if o not in airport_info:
                    airport_info[o] = (r[iOc], r[iOs])
                if d not in airport_info:
                    airport_info[d] = (r[iDc], r[iDs])
                canc = r[iCan].startswith("1")
                div = r[iDiv].startswith("1")
                arr15 = r[iArr15].startswith("1")
                wx_canc = canc and r[iCode] == "B"
                wx_delay = arr15 and (f(r[iWx]) > 0 or f(r[iNas]) > 0)
                s = routes[(o, d, mo)]
                s[0] += 1; s[1] += arr15; s[2] += canc; s[3] += div; s[4] += wx_canc; s[5] += wx_delay
                a = airports[(o, mo)]
                a[0] += 1; a[1] += r[iDep15].startswith("1"); a[2] += canc; a[3] += div; a[4] += wx_canc
        print(f" {rows:,} flights", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=24)
    ap.add_argument("--end", help="YYYY-MM, last month to include (default: latest published)")
    args = ap.parse_args()

    if args.end:
        ey, em = map(int, args.end.split("-"))
    else:
        ey, em = latest_published()
    months = window(ey, em, args.months)
    print(f"BTS window: {months[0][0]}-{months[0][1]:02d} .. {ey}-{em:02d} ({len(months)} months)", flush=True)

    routes = defaultdict(new_stats)          # (O, D, month) -> stats
    airports = defaultdict(new_stats)        # (A, month) as origin -> stats (dep-side: delayed = DepDel15)
    airport_info = {}

    aggregate(months, routes, airports, airport_info)

    out = {
        "source": "BTS Reporting Carrier On-Time Performance (transtats.bts.gov)",
        "window": {"from": f"{months[0][0]}-{months[0][1]:02d}", "to": f"{ey}-{em:02d}", "months": len(months)},
        "fields": ["flights", "arrDel15", "cancelled", "diverted", "weatherCancelled", "weatherOrNasDelayed"],
        "airports": {a: {"city": c, "state": s} for a, (c, s) in sorted(airport_info.items())},
        # routes["JFK-SFO"]["12"] = [flights, arrDel15, cancelled, diverted, wxCancelled, wxOrNasDelayed]
        "routes": {},
        # airportMonths["JFK"]["12"] = same shape; column 1 is DEPARTURE delayed 15+ for this table
        "airportMonths": {},
    }
    for (o, d, mo), s in routes.items():
        if s[0] >= MIN_ROUTE_MONTH_FLIGHTS:
            out["routes"].setdefault(f"{o}-{d}", {})[str(mo)] = s
    for (a, mo), s in airports.items():
        out["airportMonths"].setdefault(a, {})[str(mo)] = s

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"wrote {OUT}: {os.path.getsize(OUT)/1e6:.1f} MB — {len(out['routes'])} routes, "
          f"{len(out['airports'])} airports")


if __name__ == "__main__":
    main()
