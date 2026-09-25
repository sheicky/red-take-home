# Trip disruption check

A working prototype for an Operations team whose employees fly across the United States.
Enter a route and a date (and, if you have it, a flight number). You get:

- **a verdict**: Low / Moderate / High / Severe, with a stated confidence;
- **the evidence**: every fact that moved the verdict, linked to its source, plus the facts
  that were looked at and deliberately *not* counted, with the reason;
- **what to do**: concrete actions for the Ops agent, most urgent first, including a
  same-metro alternate airport when one is clearly better.

```bash
bun install        # or: npm install
bun run dev        # or: npm run dev   → http://localhost:3000
```

No key is needed. Every data source is free and keyless; the optional keys in `.env.example`
add an LLM-written briefing (OpenAI) and same-day live flight status (aviationstack).

---

## Demo in three runs

The **Data** selector under the form has three positions.

| Run | What it shows |
|---|---|
| **Replay 25 Sep** (JFK → SFO, DL 679) | Real FAA, TAF, METAR and NWS responses captured that afternoon and replayed byte for byte, with the clock frozen at capture time. The recording contains a ground delay program at SFO (low ceilings), another at LGA (wind, avg 1 h 54) and a wind advisory over New York. With DL 679 the verdict is **Moderate**. Clear the flight number and it becomes **High**, because the 37–38 kt gusts arrive at JFK after 19:00 and DL 679 usually leaves at 14:55. adsbdb claims DAL679 flies ATL→SEA; BTS shows 704 flights on JFK→SFO, so adsbdb's claim is shown but not counted. Also look at *Other airports*. |
| **Blizzard (invented)** (BOS → ORD) | **Invented data**, labelled as such. Exercises the **Severe** path: ground stop at ORD, blizzard warning. |
| **Live** | Whatever is true right now. Try tomorrow, then a date three weeks out: the confidence and the sources change, and the verdict becomes "Too early" instead of a misleading "Low". |

Recorded and synthetic runs exist because a demo on a calm day is a wall of "Low" that proves nothing.

---

## Sources, and what each one can honestly say

| Source | What it gives | Reaches | Key |
|---|---|---|---|
| **FAA NAS Status** (`nasstatus.faa.gov/api/airport-status-information`) | Ground stops, ground delay programs, airport-wide delays, closures | **Today only**: it's a snapshot of now | none |
| **TAF** (aviationweather.gov) | Airport forecast in aviation terms: ceiling, visibility, wind, gusts, wind shear | 24–30 h | none |
| **METAR** (aviationweather.gov) | What the airport observes now | Now | none |
| **NWS forecast** (api.weather.gov) | 7-day forecast periods for the airport's grid point | ~7 days | none (needs a User-Agent) |
| **NWS active alerts** | Winter storm / wind / fog warnings and advisories | Whatever is issued now, filtered by each alert's own window | none |
| **BTS On-Time Performance** | 24 months of every U.S. domestic flight: on-time and cancellation rates by route × month and by flight number, and each flight's usual schedule | Any date (history) | none, pre-processed, bundled |
| **adsbdb** | The route currently filed for a callsign | — | none |
| **aviationstack** *(optional)* | Live status for a flight today | Today | free tier, ~100 req/month |

The date decides which sources are consulted. **A source that cannot speak about that date is
marked *Not applicable* with the reason, never silently skipped**, and the confidence drops
with each day of horizon:

| Days ahead | Sources | Confidence |
|---|---|---|
| 0 (today) | all | high |
| 1 (tomorrow) | TAF, NWS, alerts, history, **not FAA** | high |
| 2–7 | NWS, alerts, history | medium → low |
| 8+ | history only, with the dates to re-check | very low |

"Today" is computed **in the origin airport's time zone**. An Ops agent in Singapore at 10 am is
already on the next calendar day compared to New York.

---

## How the verdict is built

```
request ─► resolve airports (+ flight number) ─► horizon: which sources apply
        ─► fetch all applicable sources in parallel (each may fail independently)
        ─► deterministic rules ─► evidence + factors
        ─► verdict = the most serious factor ─► confidence ─► actions
        ─► briefing text (LLM, checked, or template)
```

Decisions worth defending:

1. **The rules set the level; the LLM never does.** See *Where AI is used* below.
2. **The verdict is the maximum factor, not a sum.** The TAF, the NWS forecast and an NWS alert
   often describe the same storm. Adding them would count it three times.
3. **History is a prior, capped at Moderate.** "32% of these flights arrive late in December" can
   turn a quiet day Moderate, never High. It says nothing about *this* day.
4. **Where an FAA program sits matters.** A ground delay program at the *destination* holds your
   flight at the gate before departure: a direct hit. The same program at the *origin* meters
   arrivals into your departure airport, so its effect on you is a knock-on delay, one level lower.
5. **A city is several airports.** "New York" is JFK, LGA and EWR, and on 25 Sep 2026 they did not
   have the same day. The tool assesses the airport you picked and scores the others alongside it.
   When the trip is High and an alternate is clear, it says so.
6. **A flight number never blocks the assessment.** It narrows the weather windows to the usual
   scheduled times, adds that flight's own on-time record, and catches a wrong number. It also
   moves you to the right airport in the same metro area (and says it did).
7. **Every failure degrades, none breaks.** Each source has an 8 s timeout and its own status row.
   If one fails, the verdict is still produced, the confidence drops a step, and the reason is printed.

### Thresholds (printed in the code and the UI, not hidden in a model)

| Signal | Moderate | High | Severe |
|---|---|---|---|
| FAA ground stop | — | at origin | at destination |
| FAA ground delay program | avg < 90 min (dest.) | avg ≥ 90 min (dest.) | — |
| Wind (TAF/METAR) | gusts ≥ 30 kt or sustained ≥ 22 kt | gusts ≥ 35 kt or sustained ≥ 30 kt | — |
| Ceiling / visibility | < 1,000 ft or < 3 SM (SFO: < 3,000 ft) | < 500 ft or < 1 SM | — |
| Precipitation | snow | thunderstorms, freezing rain, heavy/blowing snow | — |
| Low-level wind shear | forecast | — | — |
| NWS alerts | advisories and watches (wind, winter, fog…) | warnings (blizzard, winter storm, high wind…) | — |
| History (route × month) | late ≥ 30% and ≥ 1.25× national, or cancelled ≥ 3% | never | never |
| Live flight status | delay ≥ 30 min | delay ≥ 60 min, diverted | cancelled |

A PROB30/40 group in a TAF counts one level lower; a "slight chance" in the NWS text too.

---

## What the real data taught (each one is now a test)

These came from reading actual responses, not from documentation:

- **The FAA listed LAX and SAN as "Airport Closures"**: NOTAMs closing them to *non-scheduled
  general aviation* only. Airline flights were unaffected. A naive parser reports "LAX closed".
  They are shown under *Evidence > Not counted*.
- **The FAA "Reopen" date has no year.** LAX said "May 28 at 16:00 UTC". Guessing the nearest
  year makes it look over. The NOTAM text itself says `2605271826-2705281600`, so it actually runs to
  **May 2027**. The parser reads the NOTAM range first.
- **NWS "severity" is about life and property, not runways.** JFK's grid point carried a *Severe*
  Coastal Flood Warning and a *Moderate* Wind Advisory. The wind advisory is the one that matters
  (LGA was under a wind ground delay program at the same time). Alerts are classified by event.
- **LGA→SFO has no nonstop history.** That is LaGuardia's 1,500-mile perimeter rule, and the tool
  finds it from the data. It says a connection is likely and that hub risk is not assessed.
- **A month with no history is not a missing route.** A seasonal route, or a gap in the data window, is reported as such.
  It is not reported as "probably a connection".
- **The JFK TAF carried low-level wind shear** (`WS020/01050KT`, 50 kt at 2,000 ft). The first
  parser ignored the field.
- **SFO had a ground delay program for "low ceilings" at 600 ft.** Generic IFR thresholds would call
  that Moderate at best. SFO's close parallel runways lose capacity below roughly 3,000 ft. That is
  the one airport-specific threshold in the prototype, and a real deployment needs a table of them.
- **Flight numbers move.** `UA1234` flew GEG→DEN in the BTS data and EWR→ORD in adsbdb. The tool flags a
  number that doesn't match the route instead of trusting it.
- **api.weather.gov answers 403 without a User-Agent.**

---

## Where AI is used

**In building it.** Claude Code was used as a pair throughout:
- to stress-test the scope before writing code (a "grilling" pass, then a red-team pass on those
  decisions, which caught that FAA status was planned as evidence for *tomorrow*);
- to write the code and tests;
- to read real API responses and find the traps listed above.

Every threshold and rule was chosen deliberately and is covered by a test. Two tests were
**mutation-checked**: the rule was broken on purpose to confirm the test goes red. One wasn't, so a test was added.

**In the product: one narrow job.** The rules produce the level, the factors, the evidence and
candidate actions. The LLM receives *that*, never the raw feeds, and writes a two-part briefing
an Ops agent can paste to a traveler. A guard then checks the draft and throws it away if it:
- cites evidence that doesn't exist;
- states a different risk level;
- tells the agent to do nothing about a High/Severe risk;
- is malformed or too long.

When a draft is discarded, the page keeps the rule-based actions and **states the reason**.
With no key, or on a timeout or API error, the tool uses the template, and it keeps working.

Why not let the model decide? Because an Ops verdict has to be reproducible, explainable
threshold by threshold, and impossible to talk into a different answer. The model is good at
turning eight heterogeneous facts into two readable sentences. That job, and nothing else.

> The LLM path is unit-tested with a mocked API (grounded draft accepted, level contradiction rejected,
> API error falls back). It was **not** exercised against the live OpenAI API while building,
> because no key was available.

---

## Assumptions

- Air travel only. Trips are domestic U.S. and use airports with scheduled service reported to BTS (352 airports).
- The route entered is the flight; connections are detected (no nonstop history) but not assessed leg by leg.
- The date is the local departure date at the origin airport.
- A flight's schedule is its most common scheduled time over the last 24 months. Seasonal
  retimings are missed. A live schedule source would fix that.
- BTS records regional flights under the operating carrier ("UA 5xxx" is often "OO 5xxx"). The lookup tries the regional operators.

---

## What I would change before real users

1. **Monitoring, not lookups.** Ops doesn't want to type trips. Ingest itineraries from the travel
   management company, re-assess on a schedule (D-7, D-3, D-1, day-of), and alert only on a change
   of level. The horizon model already says *when* each re-check is worth doing.
2. **A real schedule and status feed** (FlightAware, Cirium, OAG). It would give exact times,
   aircraft rotation (the inbound flight is the best predictor of a late departure) and
   cancellations as they happen. The free tiers do not support production use.
3. **Calibrate the thresholds against outcomes.** Log every assessment, join it to BTS actuals two
   months later, and measure: when we said High, how often was the flight 60+ min late or
   cancelled? Tune per airport. The SFO ceiling rule is the first entry of a table that should
   cover the top 30 airports.
4. **Connections as first-class legs**, including a minimum-connection-time check at the hub.
5. **When programs end.** The FAA feed gives a ground delay program's average delay but not its
   end time. On 25 Sep the SFO program (morning low ceilings) still counted against an 18:23 arrival
   whose TAF window was clear. The ATCSCC advisories publish end times; wire them in.
6. **Airline waiver feeds.** A published waiver is the single most actionable fact for Ops.
7. **Operational hardening:**
   - a shared cache (Redis) instead of in-process memory;
   - backoff when FAA or NWS rate-limit;
   - an uptime check per source, so an outage is noticed before an agent misses a disruption;
   - structured logs with the evidence ids behind each verdict, for audit.
8. **Security and privacy:**
   - SSO in front of the tool;
   - no traveler names in logs;
   - keys in a secret manager;
   - the LLM call behind a data-processing agreement, or on a model with zero data retention.
9. **Evaluate the LLM briefings**: sample and grade them, and track the guard's rejection rate by reason.

---

## Project layout

```
src/lib/
  assess.ts        the pipeline (resolve → horizon → fetch → rules → verdict → actions → narrative)
  rules.ts         deterministic rules: parsed data → evidence + factors
  narrate.ts       LLM briefing + guard + template fallback
  time.ts          local dates, DST-safe instants, horizon model
  provider.ts      the only place that talks to the network (live), with timeouts and a TTL cache
  scenarios.ts     recorded and synthetic providers for the demo
  sources/         one parser per source (faa, awc = TAF/METAR, nws, flight)
  metros.ts        city → airports
src/components/    form field and result view
scripts/
  build_bts.py     24 months of BTS → data/bts.json (stdlib only, streams from memory)
  build_airports.py airports with coordinates and time zones → data/airports.json
fixtures/          real responses recorded on 2026-09-25, used by tests and the demo
```

```bash
bun run test        # 55 tests (unit + end-to-end on the recorded and synthetic scenarios)
bun run typecheck
bun run data        # rebuild the bundled BTS + airport data (~30 min, downloads ~750 MB, keeps none of it)
```
