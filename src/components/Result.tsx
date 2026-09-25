"use client";

import { useState } from "react";
import { groupSignals, impactOf, signalOf, type SignalGroup } from "@/lib/signal";
import type { Alternate, Assessment, Evidence, Factor, Level as LevelT, SourceState } from "@/lib/types";
import { COLS, RouteHeader } from "./Board";
import { Cited } from "./Cited";
import { Check, Chevron } from "./icons";

const WORD: Record<LevelT, string> = { LOW: "Low", MODERATE: "Moderate", HIGH: "High", SEVERE: "Severe" };
const CONF = { HIGH: "High confidence", MEDIUM: "Medium confidence", LOW: "Low confidence", VERY_LOW: "Very low confidence" } as const;
const RANK: Record<LevelT, number> = { LOW: 0, MODERATE: 1, HIGH: 2, SEVERE: 3 };
const INK = (l: LevelT) => (l === "SEVERE" ? "var(--creme)" : "var(--noir)");
const OUTLINE = "inset 0 0 0 1.5px var(--noir)";

function Level({ l, big = false }: { l: LevelT; big?: boolean }) {
  return (
    <span
      className={`display inline-flex items-center rounded-md font-bold leading-none whitespace-nowrap ${big ? "text-[26px] sm:text-[30px] px-4 h-12 sm:h-14" : "text-[13px] px-1.5 h-6"}`}
      style={{ background: `var(--${l.toLowerCase()})`, color: INK(l), boxShadow: l === "LOW" ? OUTLINE : undefined }}
    >
      {WORD[l]}
    </span>
  );
}

const Swatch = ({ l }: { l: LevelT }) => (
  <span className="inline-block size-2.5 rounded-[3px] shrink-0" style={{ background: `var(--${l.toLowerCase()})`, boxShadow: l === "LOW" ? OUTLINE : undefined }} aria-hidden />
);

const worst = (fs: Factor[]): LevelT | null => (fs.length ? fs.reduce<LevelT>((l, f) => (RANK[f.level] > RANK[l] ? f.level : l), "LOW") : null);
const shortDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).replace("Sept", "Sep");
const when = (s?: string) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).replace("Sept", "Sep") + " UTC"
    : s;
};

/** One cause as a tile: the number that matters and who says so. Opens to each source's sentence. */
function Tile({ g, evidence }: { g: SignalGroup; evidence: Evidence[] }) {
  return (
    <details className="group rounded-xl bg-white border border-[var(--filet)] open:border-[var(--noir)] transition-colors">
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer p-3.5 rounded-xl">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-[15px] leading-tight">{g.cause}</span>
          <Level l={g.level} />
        </div>
        {g.metric && <div className="display font-bold text-[24px] leading-none mt-2">{g.metric}</div>}
        <div className="mt-2 flex items-center justify-between gap-2 text-[13px] text-[var(--gris)]">
          <span>{g.bases.join(", ")}</span>
          <Chevron className="shrink-0 transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <ul className="px-3.5 pb-3.5 -mt-1 space-y-2 text-[14px] leading-snug">
        {g.factors.map((f) => (
          <li key={f.id}>
            {g.factors.length > 1 && <span className="font-semibold">{signalOf(f, evidence).basis}: </span>}
            <Cited text={`${f.summary} [${f.evidence.join(", ")}]`} />
          </li>
        ))}
        {impactOf(g.cause) && <li className="text-[var(--gris)]">{impactOf(g.cause)}</li>}
      </ul>
    </details>
  );
}

function Nearby({ alts }: { alts: Alternate[] }) {
  if (!alts.length) return null;
  return (
    <div className="mt-3 text-[13px]">
      <p className="text-[var(--gris)] mb-1.5">{alts[0].side === "origin" ? "Or fly from a nearby airport" : "Or fly into a nearby airport"}</p>
      <ul className="flex flex-wrap gap-1.5">
        {alts.map((x) => (
          <li key={x.airport} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--filet)] bg-white px-2" title={`${x.name}: ${WORD[x.level].toLowerCase()} risk`}>
            <Swatch l={x.level} />
            <span className="font-semibold">{x.airport}</span>
            <span>{x.city}</span>
            {x.routeOnTime !== undefined && <span className="text-[var(--gris)]">{Math.round(x.routeOnTime * 100)}% on time</span>}
            <span className="sr-only">, {WORD[x.level]} risk</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Column({ code, factors, evidence, alts, empty, className = "" }: { code: string; factors: Factor[]; evidence: Evidence[]; alts: Alternate[]; empty: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <h3 className="sm:sr-only display text-[20px] font-bold mb-2">{code}</h3>
      <div className="grid gap-2">
        {factors.length ? groupSignals(factors, evidence).map((g) => <Tile key={g.cause} g={g} evidence={evidence} />) : (
          <p className="rounded-xl border border-dashed border-[#d9d5c3] p-3.5 text-[14px] text-[var(--gris)]">{empty}</p>
        )}
      </div>
      <Nearby alts={alts} />
    </div>
  );
}

function DoList({ actions }: { actions: string[] }) {
  const [done, setDone] = useState<boolean[]>(() => actions.map(() => false));
  const n = done.filter(Boolean).length;
  return (
    <section aria-labelledby="do">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="do" className="text-[26px] font-bold">Do</h2>
        <span className="text-[14px] text-[var(--gris)]" aria-live="polite">{n} of {actions.length} done</span>
      </div>
      <ul className="rounded-2xl border-[1.5px] border-[var(--noir)] bg-white divide-y divide-[var(--filet)] overflow-hidden">
        {actions.map((x, i) => (
          <li key={x}>
            <label className="flex gap-3.5 p-4 cursor-pointer hover:bg-[var(--creme)] has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:-outline-offset-4">
              <input type="checkbox" className="sr-only" checked={done[i]} onChange={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))} />
              <span
                className={`mt-0.5 grid place-items-center size-[22px] shrink-0 rounded-md border-[1.5px] border-[var(--noir)] ${done[i] ? "bg-[var(--noir)] text-[var(--jaune)]" : ""}`}
                aria-hidden
              >
                {done[i] && <Check />}
              </span>
              <span className={`${i === 0 && !done[i] ? "font-semibold" : ""} ${done[i] ? "line-through text-[var(--gris)]" : ""}`}>{x}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EvidenceRow({ e }: { e: Evidence }) {
  return (
    <li id={e.id} className="scroll-mt-6 py-3.5 border-b border-[var(--filet)] target:bg-white">
      <div className="flex gap-4">
        <span className="text-[13px] text-[var(--gris)] w-7 shrink-0 pt-0.5">{e.id}</span>
        <div className="min-w-0 text-[15px]">
          <div className="font-semibold">{e.title}</div>
          <div className="break-words text-[var(--gris)]">{e.detail}</div>
          {e.ignoredBecause && <div className="mt-1">Not counted: {e.ignoredBecause}.</div>}
          <div className="mt-1 text-[13px] text-[var(--gris)]">
            {e.observedAt ? `${when(e.observedAt)}, ` : ""}
            <a href={e.url} target="_blank" rel="noreferrer" className="underline hover:text-[var(--noir)]">source</a>
          </div>
        </div>
      </div>
    </li>
  );
}

const STATE: Record<SourceState, string> = { ok: "Used", error: "Failed", "not-applicable": "Not for this date", "no-data": "No data", disabled: "Off" };
const FOLD = "cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-[17px] font-semibold py-3.5 border-b border-[var(--filet)] flex items-center justify-between";

function Fold({ id, title, children }: { id?: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <details id={id} className="group">
      <summary className={FOLD}>{title}<Chevron className="transition-transform group-open:rotate-180" /></summary>
      {children}
    </details>
  );
}

export function Result({ a, briefing, chat }: { a: Assessment; briefing: React.ReactNode; chat: React.ReactNode }) {
  const counted = a.evidence.filter((e) => !e.ignoredBecause);
  const ignored = a.evidence.filter((e) => e.ignoredBecause);
  const tooEarly = a.confidence.level === "VERY_LOW" && a.factors.length === 0;
  const sorted = [...a.factors].sort((x, y) => RANK[y.level] - RANK[x.level]);
  const side = (s: Factor["side"][]) => sorted.filter((f) => s.includes(f.side));
  const [o, d, mid] = [side(["origin"]), side(["destination"]), side(["route"])];
  const empty = tooEarly ? "No live data this far out" : "Nothing reported";
  const days = a.horizon.daysAhead;

  const verdict = tooEarly
    ? <span className="display inline-flex items-center rounded-md text-[26px] sm:text-[30px] font-bold px-4 h-12 sm:h-14" style={{ boxShadow: OUTLINE }}>Too early</span>
    : <Level l={a.level} big />;

  return (
    <article className="space-y-10">
      <section aria-label="Verdict" className="space-y-6">
        <RouteHeader
          origin={a.origin.iata}
          destination={a.destination.iata}
          from={worst(o)}
          to={worst(d)}
          center={verdict}
          below={<>
            <span className="block">{tooEarly ? "History only" : CONF[a.confidence.level]}</span>
            <span className="block">{shortDate(a.request.date)}, {days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}</span>
          </>}
          dep={<span className="text-[var(--gris)] font-normal">{a.origin.city}</span>}
          arr={<span className="text-[var(--gris)] font-normal">{a.destination.city}</span>}
        />

        <div className={`${COLS} gap-y-6`}>
          <Column code={a.origin.iata} factors={o} evidence={a.evidence} alts={a.alternates.filter((x) => x.side === "origin")} empty={empty} className="col-span-2 sm:col-span-1" />
          <Column code="Route" factors={mid} evidence={a.evidence} alts={[]} empty="" className={`col-span-2 sm:col-span-1 sm:order-none order-last ${mid.length ? "" : "hidden sm:block sm:invisible"}`} />
          <Column code={a.destination.iata} factors={d} evidence={a.evidence} alts={a.alternates.filter((x) => x.side === "destination")} empty={empty} className="col-span-2 sm:col-span-1" />
        </div>
      </section>

      <DoList actions={a.actions} />

      <section aria-labelledby="message">
        <h2 id="message" className="text-[26px] font-bold mb-3">Message for the traveler</h2>
        {briefing}
      </section>

      {chat}

      <section className="border-t-[1.5px] border-[var(--noir)]">
        <Fold id="evidence" title={`Evidence (${counted.length})`}>
          <ul>{counted.map((e) => <EvidenceRow key={e.id} e={e} />)}</ul>
          {ignored.length > 0 && (
            <details className="mt-2 ml-11">
              <summary className="cursor-pointer py-3 text-[15px] font-semibold">Not counted ({ignored.length})</summary>
              <ul>{ignored.map((e) => <EvidenceRow key={e.id} e={e} />)}</ul>
            </details>
          )}
        </Fold>
        <Fold title={`Sources (${a.sources.filter((s) => s.state === "ok").length} of ${a.sources.length} used)`}>
          <ul>
            {a.sources.map((s) => (
              <li key={s.source} className="py-3.5 border-b border-[var(--filet)]">
                <div className="flex justify-between gap-4 text-[15px]">
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline min-w-0">{s.name}</a>
                  <span className="shrink-0 font-medium" style={{ color: s.state === "error" ? "var(--severe)" : s.state === "ok" ? "var(--noir)" : "var(--gris)" }}>{STATE[s.state]}</span>
                </div>
                {s.state === "error" && s.note && <div className="text-[13px] text-[var(--gris)] mt-1">{s.note}</div>}
              </li>
            ))}
          </ul>
        </Fold>
      </section>
    </article>
  );
}

