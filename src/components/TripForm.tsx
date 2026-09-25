"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchFor } from "@/lib/query";
import type { AssessmentRequest } from "@/lib/types";
import { AirportField } from "./AirportField";

const field = "w-full h-12 rounded-full border-[1.5px] border-[var(--noir)] bg-white px-5 text-[16px]";

/** Writes the trip into the URL; the page reads it back and streams the result. */
export function TripForm({ initial, defaultDate }: { initial: AssessmentRequest | null; defaultDate: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [origin, setOrigin] = useState(initial?.origin ?? "JFK");
  const [destination, setDestination] = useState(initial?.destination ?? "SFO");
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin || !destination) { setError("Pick both airports from the list."); return; }
    setError("");
    start(() => router.push(`/?${searchFor({ origin, destination, date })}`, { scroll: false }));
  };

  return (
    <form onSubmit={submit} className="mt-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_190px_auto] items-end">
        <AirportField label="From" value={origin} onChange={setOrigin} />
        <AirportField label="To" value={destination} onChange={setDestination} />
        <div>
          <label htmlFor="date" className="block text-[14px] font-medium mb-1.5 pl-5">Date</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={field} />
        </div>
        <button type="submit" disabled={pending} className="h-12 rounded-full bg-[var(--noir)] text-[var(--jaune)] font-semibold px-7 disabled:opacity-60 cursor-pointer disabled:cursor-wait">
          {pending ? "Checking…" : "Check"}
        </button>
      </div>
      {error && <p role="alert" className="mt-5 font-medium" style={{ color: "var(--severe)" }}>{error}</p>}
    </form>
  );
}
