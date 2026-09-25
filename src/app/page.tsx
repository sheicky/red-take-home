"use client";

import { useEffect, useState } from "react";
import { AirportField } from "@/components/AirportField";
import { Result } from "@/components/Result";
import type { Assessment } from "@/lib/types";

interface ScenarioInfo {
  id: string;
  short: string;
  synthetic: boolean;
  preset: { origin: string; destination: string; date: string; flight?: string };
}

const tomorrow = () => {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const field = "w-full h-12 rounded-full border-[1.5px] border-[var(--noir)] bg-white px-5 text-[16px] outline-offset-2";
const label = "block text-[14px] font-medium mb-1.5 pl-5";

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
    if (!origin || !destination) { setError("Pick both airports from the list."); return; }
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
      setError("The server did not answer. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const sources = [{ id: "", short: "Live" }, ...scenarios];

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-14">
      <h1 className="text-[40px] sm:text-[52px] font-bold leading-none">Trip check</h1>

      <form onSubmit={submit} className="mt-8">
        <div role="radiogroup" aria-label="Data" className="inline-flex max-w-full overflow-x-auto rounded-full border-[1.5px] border-[var(--noir)] p-1">
          {sources.map((s) => (
            <button
              key={s.id || "live"}
              type="button"
              role="radio"
              aria-checked={scenario === s.id}
              onClick={() => chooseScenario(s.id)}
              className={`whitespace-nowrap rounded-full px-4 sm:px-5 h-9 text-[14px] font-semibold ${scenario === s.id ? "bg-[var(--noir)] text-[var(--jaune)]" : "hover:bg-black/5"}`}
            >
              {s.short}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_170px_140px_auto] items-end">
          <AirportField label="From" value={origin} onChange={setOrigin} />
          <AirportField label="To" value={destination} onChange={setDestination} />
          <div>
            <label htmlFor="date" className={label}>Date</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={field} />
          </div>
          <div>
            <label htmlFor="flight" className={label}>Flight</label>
            <input id="flight" placeholder="UA 1234" value={flight} onChange={(e) => setFlight(e.target.value)} className={field} />
          </div>
          <button type="submit" disabled={busy} className="h-12 rounded-full bg-[var(--noir)] text-[var(--jaune)] font-semibold px-7 disabled:opacity-60 cursor-pointer disabled:cursor-wait">
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
      </form>

      {error && <p role="alert" className="mt-5 font-medium" style={{ color: "var(--severe)" }}>{error}</p>}

      <div className="mt-12" aria-live="polite">{result && <Result a={result} />}</div>
    </main>
  );
}
