"use client";

import type { Assessment, Evidence, Factor, Level, SourceState } from "@/lib/types";

const LEVEL_WORD: Record<Level, string> = { LOW: "Low", MODERATE: "Moderate", HIGH: "High", SEVERE: "Severe" };
const CONF_WORD = { HIGH: "high", MEDIUM: "medium", LOW: "low", VERY_LOW: "very low" } as const;
const RANK: Record<Level, number> = { LOW: 0, MODERATE: 1, HIGH: 2, SEVERE: 3 };
const tone = (l: Level) => l.toLowerCase();

function Pill({ level, big = false }: { level: Level; big?: boolean }) {
  return (
    <span
      className={`display inline-block rounded font-semibold ${big ? "text-2xl px-3 py-0.5" : "text-[15px] px-2 leading-6"}`}
      style={{ color: `var(--${tone(level)})`, background: `var(--${tone(level)}-bg)` }}
    >
      {LEVEL_WORD[level]}
    </span>
  );
}

/** "[E3]" in LLM or template text becomes a link to that piece of evidence. */
function Cited({ text }: { text: string }) {
  const parts = text.split(/(\[E\d+(?:,\s*E\d+)*\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const ids = /^\[(E\d+(?:,\s*E\d+)*)\]$/.exec(p)?.[1].split(/,\s*/);
        if (!ids) return <span key={i}>{p}</span>;
        return (
          <sup key={i} className="whitespace-nowrap">
            {ids.map((id) => (
              <a key={id} href={`#${id}`} className="ml-0.5 text-[11px] font-semibold text-[var(--focus)] hover:underline">{id}</a>
            ))}
          </sup>
        );
      })}
    </>
  );
}

const sideLevel = (factors: Factor[], side: Factor["side"][]) =>
  factors.filter((f) => side.includes(f.side)).reduce<Level>((l, f) => (RANK[f.level] > RANK[l] ? f.level : l), "LOW");

const localTime = (iso: string, tz: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });

function TripStrip({ a }: { a: Assessment }) {
  const [ow, dw] = a.windows;
  const o = sideLevel(a.factors, ["origin"]);
  const d = sideLevel(a.factors, ["destination"]);
  const mid = sideLevel(a.factors, ["route", "flight"]);
  const end = (code: string, name: string, lv: Level, w: typeof ow, tz: string, align: string) => (
    <div className={`min-w-0 ${align}`}>
      <div className="display font-semibold leading-none tracking-tight text-[64px] sm:text-[88px]">{code}</div>
      <div className="h-1.5 rounded-full mt-2" style={{ background: `var(--${tone(lv)})` }} aria-hidden />
      <div className="mt-2 text-[13px] text-[var(--muted)] truncate">{name}</div>
      <div className="text-[13px]">
        {w.basis === "scheduled-time" ? "Scheduled window " : "Whole day "}
        {localTime(w.from, tz)}–{localTime(w.to, tz)} local
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-6">
      {end(a.origin.iata, a.origin.name, o, ow, a.origin.tz, "")}
      <div className="pt-7 sm:pt-10 text-center min-w-[88px]">
        <div className="h-0.5 w-full rounded-full" style={{ background: `var(--${tone(mid)})` }} aria-hidden />
        <div className="mt-2 text-[13px] font-semibold">{a.request.date}</div>
        <div className="text-[13px] text-[var(--muted)]">
          {a.horizon.daysAhead === 0 ? "today" : a.horizon.daysAhead === 1 ? "tomorrow" : `in ${a.horizon.daysAhead} days`}
        </div>
        {a.flight && <div className="text-[13px] font-semibold mt-1">{a.flight.normalized}</div>}
      </div>
      {end(a.destination.iata, a.destination.name, d, dw, a.destination.tz, "text-right")}
    </div>
  );
}

function EvidenceItem({ e }: { e: Evidence }) {
  return (
    <li id={e.id} className="scroll-mt-6 py-3 border-t border-[var(--rule)] target:bg-[var(--paper)]">
      <div className="flex gap-3">
        <span className="text-[12px] font-semibold text-[var(--muted)] w-7 shrink-0 pt-0.5">{e.id}</span>
        <div className="min-w-0">
          <div className="font-semibold">{e.title}</div>
          <div className="text-[14px] break-words">{e.detail}</div>
          {e.ignoredBecause && <div className="text-[13px] mt-1 text-[var(--muted)]">Not counted: {e.ignoredBecause}.</div>}
          <div className="text-[12px] text-[var(--muted)] mt-1">
            {e.source}{e.airport ? `, ${e.airport}` : ""}{e.observedAt ? `, as of ${e.observedAt}` : ""}{" "}
            <a href={e.url} target="_blank" rel="noreferrer" className="text-[var(--focus)] hover:underline">open source</a>
          </div>
        </div>
      </div>
    </li>
  );
}

const STATE_LABEL: Record<SourceState, string> = { ok: "Used", error: "Failed", "not-applicable": "Not applicable", "no-data": "No data", disabled: "Off" };

export function Result({ a }: { a: Assessment }) {
  const counted = a.evidence.filter((e) => !e.ignoredBecause);
  const tooEarly = a.confidence.level === "VERY_LOW" && a.factors.length === 0;
  const ignored = a.evidence.filter((e) => e.ignoredBecause);
  const factorsBy = (sides: Factor["side"][]) => a.factors.filter((f) => sides.includes(f.side)).sort((x, y) => RANK[y.level] - RANK[x.level]);
  const columns: [string, Factor[]][] = [
    [a.origin.iata, factorsBy(["origin"])],
    ["Route & flight", factorsBy(["route", "flight"])],
    [a.destination.iata, factorsBy(["destination"])],
  ];

  return (
    <article className="space-y-8">
      {a.scenario && (
        <div className="rounded-md border px-4 py-3 text-[14px]" style={{ borderColor: a.scenario.synthetic ? "var(--severe)" : "var(--rule)", background: "var(--panel)" }}>
          <strong>{a.scenario.synthetic ? "Invented data. " : "Replayed data. "}</strong>
          {a.scenario.label}.{" "}
          {a.scenario.synthetic ? "Nothing here happened; it exists to show how a severe day reads." : `Real responses captured at ${a.scenario.recordedAt}; the clock is frozen at that moment.`}
        </div>
      )}

      <section aria-label="Verdict" className="rounded-lg bg-[var(--panel)] border border-[var(--rule)] p-5 sm:p-7">
        <TripStrip a={a} />
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          {tooEarly ? (
            // "Low" with no live source is an absence of evidence, not evidence of absence.
            <span className="display inline-block rounded font-semibold text-2xl px-3 py-0.5 border border-[var(--rule)] text-[var(--muted)]">Nothing known yet</span>
          ) : (
            <Pill level={a.level} big />
          )}
          <span className="text-[15px]">
            {tooEarly ? "no live source reaches this date; history shows nothing unusual" : <>disruption risk, <strong>{CONF_WORD[a.confidence.level]}</strong> confidence</>}
          </span>
        </div>
        <ul className="mt-2 text-[13px] text-[var(--muted)] list-disc pl-5">
          {a.confidence.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        {a.adjustments.length > 0 && (
          <div className="mt-4 text-[14px] border-l-4 pl-3" style={{ borderColor: "var(--moderate)" }}>
            {a.adjustments.map((x) => <p key={x}>{x}</p>)}
          </div>
        )}
      </section>

      <section aria-labelledby="brief" className="grid gap-6 md:grid-cols-[3fr_2fr]">
        <div>
          <h2 id="brief" className="display text-2xl font-semibold">Briefing for the traveler&apos;s file</h2>
          <p className="mt-2 max-w-[68ch]"><Cited text={a.narrative.summary} /></p>
          <p className="mt-3 max-w-[68ch]"><strong>Do: </strong><Cited text={a.narrative.action} /></p>
          <p className="mt-3 text-[12px] text-[var(--muted)] max-w-[68ch]">
            {a.narrative.by === "llm"
              ? `Written by ${a.narrative.model} from the evidence below, then checked: every citation exists and the risk level matches the rules. The model does not set the level.`
              : "Written from a template (no LLM used)."}
            {a.narrative.rejectedReason && ` ${a.narrative.rejectedReason}.`}
          </p>
        </div>
        <div>
          <h2 className="display text-2xl font-semibold">Actions, most urgent first</h2>
          <ol className="mt-2 list-decimal pl-5 space-y-1.5 text-[14px]">
            {a.actions.map((x) => <li key={x}>{x}</li>)}
          </ol>
        </div>
      </section>

      <section aria-labelledby="why">
        <h2 id="why" className="display text-2xl font-semibold">Why this level</h2>
        <p className="text-[13px] text-[var(--muted)] max-w-[68ch]">The verdict is the most serious single factor, never a sum: two sources describing the same storm must not count twice.</p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {columns.map(([title, fs]) => (
            <div key={title} className="rounded-lg border border-[var(--rule)] bg-[var(--panel)] p-4">
              <h3 className="display text-xl font-semibold">{title}</h3>
              {fs.length === 0 ? (
                <p className="text-[14px] text-[var(--muted)] mt-1">Nothing found.</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {fs.map((f) => (
                    <li key={f.id} className="text-[14px]">
                      <Pill level={f.level} /> <Cited text={`${f.summary} [${f.evidence.join(", ")}]`} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {a.alternates.length > 0 && (
        <section aria-labelledby="alts">
          <h2 id="alts" className="display text-2xl font-semibold">Other airports in the same area</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[14px] border-collapse min-w-[520px]">
              <thead>
                <tr className="text-left text-[13px] text-[var(--muted)]">
                  <th className="py-2 pr-3 font-semibold">Airport</th>
                  <th className="py-2 pr-3 font-semibold">Instead of</th>
                  <th className="py-2 pr-3 font-semibold">Level</th>
                  <th className="py-2 pr-3 font-semibold">On time historically</th>
                  <th className="py-2 font-semibold">What we see</th>
                </tr>
              </thead>
              <tbody>
                {a.alternates.map((x) => (
                  <tr key={x.airport} className="border-t border-[var(--rule)] align-top">
                    <td className="py-2 pr-3"><span className="display text-lg font-semibold">{x.airport}</span> <span className="text-[var(--muted)]">{x.name}</span></td>
                    <td className="py-2 pr-3">{x.side === "origin" ? a.origin.iata : a.destination.iata}</td>
                    <td className="py-2 pr-3"><Pill level={x.level} /></td>
                    <td className="py-2 pr-3">{x.routeOnTime !== undefined ? `${Math.round(x.routeOnTime * 100)}%` : "no nonstop"}</td>
                    <td className="py-2">{x.reasons.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="evidence">
        <h2 id="evidence" className="display text-2xl font-semibold">Evidence</h2>
        <ul className="mt-2">{counted.map((e) => <EvidenceItem key={e.id} e={e} />)}</ul>
        {ignored.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[14px] font-semibold">Looked at, not counted ({ignored.length})</summary>
            <ul className="mt-1">{ignored.map((e) => <EvidenceItem key={e.id} e={e} />)}</ul>
          </details>
        )}
      </section>

      <section aria-labelledby="sources">
        <h2 id="sources" className="display text-2xl font-semibold">Sources checked</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[14px] border-collapse min-w-[520px]">
            <tbody>
              {a.sources.map((s) => (
                <tr key={s.source} className="border-t border-[var(--rule)] align-top">
                  <td className="py-2 pr-3"><a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">{s.name}</a></td>
                  <td className="py-2 pr-3 whitespace-nowrap font-semibold" style={{ color: s.state === "error" ? "var(--high)" : s.state === "ok" ? "var(--low)" : "var(--na)" }}>{STATE_LABEL[s.state]}</td>
                  <td className="py-2 text-[var(--muted)]">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-[var(--muted)]">Generated {a.generatedAt}.</p>
      </section>
    </article>
  );
}
