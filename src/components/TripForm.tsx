"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchFor } from "@/lib/query";
import type { AssessmentRequest } from "@/lib/types";
import { AirportField } from "./AirportField";

export interface ScenarioChoice {
  id: string;
  short: string;
  preset: { origin: string; destination: string; date: string; flight?: string };
}

const field = "w-full h-12 rounded-full border-[1.5px] border-[var(--noir)] bg-white px-5 text-[16px]";
const label = "block text-[14px] font-medium mb-1.5 pl-5";

/** Writes the trip into the URL; the page reads it back and streams the result. */
export function TripForm({ initial, defaultDate, scenarios }: { initial: AssessmentRequest | null; defaultDate: string; scenarios: ScenarioChoice[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [origin, setOrigin] = useState(initial?.origin ?? "JFK");
  const [destination, setDestination] = useState(initial?.destination ?? "SFO");
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [flight, setFlight] = useState(initial?.flight ?? "");
  const [scenario, setScenario] = useState(initial?.scenario ?? "");
  const [error, setError] = useState("");

  const choose = (id: string) => {
    setScenario(id);
    const s = scenarios.find((x) => x.id === id);
    setOrigin(s?.preset.origin ?? origin);
    setDestination(s?.preset.destination ?? destination);
    setDate(s?.preset.date ?? defaultDate);
    setFlight(s?.preset.flight ?? "");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin || !destination) { setError("Pick both airports from the list."); return; }
    setError("");
    start(() => router.push(`/?${searchFor({ origin, destination, date, flight, scenario: scenario || undefined })}`, { scroll: false }));
  };

  return (
    <form onSubmit={submit} className="mt-8">
      <div role="radiogroup" aria-label="Data" className="flex w-full sm:inline-flex sm:w-auto rounded-full border-[1.5px] border-[var(--noir)] p-1">
        {[{ id: "", short: "Live" }, ...scenarios].map((s) => (
          <button
            key={s.id || "live"}
            type="button"
            role="radio"
            aria-checked={scenario === s.id}
            onClick={() => choose(s.id)}
            className={`flex-1 sm:flex-none whitespace-nowrap rounded-full px-2 sm:px-5 h-9 text-[13px] sm:text-[14px] font-semibold cursor-pointer ${scenario === s.id ? "bg-[var(--noir)] text-[var(--jaune)]" : "hover:bg-black/5"}`}
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
        <button type="submit" disabled={pending} className="h-12 rounded-full bg-[var(--noir)] text-[var(--jaune)] font-semibold px-7 disabled:opacity-60 cursor-pointer disabled:cursor-wait">
          {pending ? "Checking…" : "Check"}
        </button>
      </div>
      {error && <p role="alert" className="mt-5 font-medium" style={{ color: "var(--severe)" }}>{error}</p>}
    </form>
  );
}
