"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface AirportHit {
  iata: string;
  name: string;
  city: string;
  state: string;
  metro?: string;
}

/** City or code in, one airport out. Typing a city lists every airport of that metro area. */
export function AirportField({ label, value, onChange }: { label: string; value: string; onChange: (iata: string) => void }) {
  const id = useId();
  const [text, setText] = useState(value);
  const [hits, setHits] = useState<AirportHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) setText(value);
  }, [value]);

  useEffect(() => {
    if (!typed.current || !text.trim()) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/airports?q=${encodeURIComponent(text)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((h: AirportHit[]) => { setHits(h); setActive(0); setOpen(true); })
        .catch(() => {});
    }, 120);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [text]);

  const pick = (h: AirportHit) => {
    typed.current = false;
    setText(h.iata);
    setOpen(false);
    onChange(h.iata);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-[14px] font-medium mb-1.5 pl-5">{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="City or code"
        value={text}
        onChange={(e) => { typed.current = true; setText(e.target.value); onChange(""); }}
        onFocus={() => hits.length > 0 && typed.current && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || !hits.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter") { e.preventDefault(); pick(hits[active]); }
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-full h-12 rounded-full border-[1.5px] border-[var(--noir)] bg-white px-5 text-[16px]"
      />
      {open && hits.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-2 w-full min-w-[260px] max-h-80 overflow-auto rounded-2xl border-[1.5px] border-[var(--noir)] bg-white py-1">
          {hits.map((h, i) => (
            <li
              key={h.iata}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(h); }}
              onMouseEnter={() => setActive(i)}
              className={`flex gap-3 px-4 py-2 cursor-pointer ${i === active ? "bg-[var(--creme)]" : ""}`}
            >
              <span className="display text-[20px] font-bold w-12 shrink-0 leading-6">{h.iata}</span>
              <span className="min-w-0">
                <span className="block truncate">{h.name}</span>
                <span className="block text-[13px] text-[var(--gris)] truncate">{h.city}, {h.state}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
