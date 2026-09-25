// What the model may know about a trip: the rules' output, nothing else. Never the raw feeds.

import type { Assessment } from "../types";

export function groundingFor(a: Assessment) {
  return {
    generatedAt: a.generatedAt,
    trip: {
      from: a.origin.iata, fromAirport: `${a.origin.name}, ${a.origin.city}`,
      to: a.destination.iata, toAirport: `${a.destination.name}, ${a.destination.city}`,
      date: a.request.date, daysAhead: a.horizon.daysAhead,
      weatherWindow: "the whole travel day at each airport (departure time unknown)",
    },
    level: a.level,
    confidence: a.confidence,
    factors: a.factors.map((f) => ({ id: f.id, level: f.level, where: f.airport ?? f.side, summary: f.summary, evidence: f.evidence })),
    evidence: a.evidence.map((e) => ({
      id: e.id, source: e.source, airport: e.airport, title: e.title, detail: e.detail.slice(0, 400), observedAt: e.observedAt,
      counted: !e.ignoredBecause, notCountedBecause: e.ignoredBecause,
    })),
    actions: a.actions,
    alternates: a.alternates.map((x) => ({
      airport: x.airport, name: x.name, insteadOf: x.side === "origin" ? a.origin.iata : a.destination.iata, level: x.level, reasons: x.reasons,
      onTimeHistorically: x.routeOnTime === undefined ? undefined : `${Math.round(x.routeOnTime * 100)}%`,
    })),
    sources: a.sources.map((s) => ({ source: s.name, state: s.state, note: s.note })),
    recheck: a.horizon.recheck,
  };
}

/** Fenced so the model can tell data from instructions. JSON-encoded, so feed text cannot break out. */
export const fenced = (a: Assessment) => `<assessment>${JSON.stringify(groundingFor(a))}</assessment>`;
