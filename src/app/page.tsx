"use client";

import { useEffect, useState } from "react";
import { AirportField } from "@/components/AirportField";
import { Result } from "@/components/Result";
import type { Assessment } from "@/lib/types";

interface ScenarioInfo {
  id: string;
  label: string;
  description: string;
  synthetic: boolean;
  preset: { origin: string; destination: string; date: string; flight?: string };
}

const tomorrow = () => {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function Page() {
  const [origin, setOrigin] = useState("JFK");
  const [destination, setDestination] = useState("SFO");
  const [date, setDate] = useState(tomorrow);
  const [flight, setFlight] = useState("");
  const [scenario, setScenario] = useState("");
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Assessment | null>(null);

  useEffect(() => {
    fetch("/api/scenarios").then((r) => r.json()).then(setScenarios).catch(() => {});
  }, []);

  const chooseScenario = (id: string) => {
    setScenario(id);
    const s = scenarios.find((x) => x.id === id);
    if (s) {
      setOrigin(s.preset.origin);
      setDestination(s.preset.destination);
      setDate(s.preset.date);
      setFlight(s.preset.flight ?? "");
    } else setDate(tomorrow());
    setResult(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin || !destination) { setError("Pick both airports from the suggestions."); return; }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, date, flight: flight || undefined, scenario: scenario || undefined }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? `Request failed (${r.status}).`); setResult(null); }
      else setResult(j);
    } catch {
      setError("Could not reach the server. Is `bun run dev` still running?");
    } finally {
      setBusy(false);
    }
  };

  const active = scenarios.find((s) => s.id === scenario);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
      <header className="max-w-[68ch]">
        <h1 className="display text-4xl sm:text-5xl font-semibold leading-tight">Will this trip be disrupted?</h1>
        <p className="mt-2 text-[var(--muted)]">
          One check across FAA airport status, airport forecasts, National Weather Service alerts and two years of on-time history,
          with the evidence behind the verdict and what Ops should do about it.
        </p>
      </header>

      <form onSubmit={submit} className="mt-8 rounded-lg border border-[var(--rule)] bg-[var(--panel)] p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_170px_150px_auto] items-end">
          <AirportField label="From" value={origin} onChange={setOrigin} />
          <AirportField label="To" value={destination} onChange={setDestination} />
          <div>
            <label htmlFor="date" className="block text-[13px] font-semibold text-[var(--muted)] mb-1">Date (local, at departure)</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="w-full rounded-md border border-[var(--rule)] bg-[var(--panel)] px-3 py-2" />
          </div>
          <div>
            <label htmlFor="flight" className="block text-[13px] font-semibold text-[var(--muted)] mb-1">Flight (optional)</label>
            <input id="flight" placeholder="UA 1234" value={flight} onChange={(e) => setFlight(e.target.value)} className="w-full rounded-md border border-[var(--rule)] bg-[var(--panel)] px-3 py-2" />
          </div>
          <button type="submit" disabled={busy} className="rounded-md bg-[var(--ink)] text-[var(--paper)] font-semibold px-5 py-2.5 disabled:opacity-60">
            {busy ? "Checking…" : "Check trip"}
          </button>
        </div>

        <fieldset className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
          <legend className="sr-only">Data</legend>
          <span className="text-[13px] font-semibold text-[var(--muted)]">Data:</span>
          {[{ id: "", label: "Live" }, ...scenarios].map((s) => (
            <label key={s.id || "live"} className="inline-flex items-center gap-2 cursor-pointer">
              <input type="radio" name="scenario" checked={scenario === s.id} onChange={() => chooseScenario(s.id)} />
              {s.label}
            </label>
          ))}
        </fieldset>
        {active && <p className="mt-2 text-[13px] text-[var(--muted)] max-w-[80ch]">{active.description}</p>}
      </form>

      {error && <p role="alert" className="mt-4 font-semibold" style={{ color: "var(--high)" }}>{error}</p>}

      <div className="mt-10" aria-live="polite">
        {result ? (
          <Result a={result} />
        ) : (
          !busy && (
            <p className="text-[var(--muted)] max-w-[68ch]">
              Enter a route and a date. Today and tomorrow get live airport status and airport forecasts; up to a week
              gets the general forecast; further out, history only, and the confidence says so.
            </p>
          )
        )}
      </div>
    </main>
  );
}
