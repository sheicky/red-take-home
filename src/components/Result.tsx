"use client";

import type { Assessment, Evidence, Factor, Level as LevelT, SourceState } from "@/lib/types";

const WORD: Record<LevelT, string> = { LOW: "Low", MODERATE: "Moderate", HIGH: "High", SEVERE: "Severe" };
const CONF = { HIGH: "High confidence", MEDIUM: "Medium confidence", LOW: "Low confidence", VERY_LOW: "Very low confidence" } as const;
const RANK: Record<LevelT, number> = { LOW: 0, MODERATE: 1, HIGH: 2, SEVERE: 3 };
const INK: Record<LevelT, string> = { LOW: "var(--noir)", MODERATE: "var(--noir)", HIGH: "var(--noir)", SEVERE: "var(--creme)" };

/** The risk stamp. A filled block, not a pill: pills are for things you press. */
function Level({ l, big = false }: { l: LevelT; big?: boolean }) {
  return (
    <span
      className={`display inline-flex items-center rounded-md font-bold leading-none ${big ? "text-[28px] px-4 h-12" : "text-[14px] px-2 h-6"}`}
      style={{ background: `var(--${l.toLowerCase()})`, color: INK[l], boxShadow: l === "LOW" ? "inset 0 0 0 1.5px var(--noir)" : undefined }}
    >
      {WORD[l]}
    </span>
  );
}

/** "[E3]" or "[E3, E4]" in rule or LLM text becomes quiet links to the evidence. */
function Cited({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\s?\[E\d+(?:,\s*E\d+)*\])/g).map((p, i) => {
        const ids = /^\s?\[(E\d+(?:,\s*E\d+)*)\]$/.exec(p)?.[1].split(/,\s*/);
        if (!ids) return <span key={i}>{p}</span>;
        return (
          <span key={i} className="whitespace-nowrap">
            {ids.map((id) => (
              <a key={id} href={`#${id}`} className="ml-1.5 text-[12px] text-[var(--gris)] underline hover:text-[var(--noir)]">{id}</a>
            ))}
          </span>
        );
      })}
    </>
  );
}

const worst = (fs: Factor[]) => fs.reduce<LevelT>((l, f) => (RANK[f.level] > RANK[l] ? f.level : l), "LOW");
const hhmm = (iso: string, tz: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
const when = (s?: string) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"
    : s;
};

function Strip({ a }: { a: Assessment }) {
  const [ow, dw] = a.windows;
  const side = (code: string, name: string, l: LevelT, time: string | undefined, right = false) => (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <div className="display font-bold leading-[0.85] text-[64px] sm:text-[96px]">{code}</div>
      <div className="mt-3 h-1.5 rounded-full" style={{ background: l === "LOW" ? "var(--noir)" : `var(--${l.toLowerCase()})`, opacity: l === "LOW" ? 0.15 : 1 }} aria-hidden />
      <div className="mt-2 text-[14px] text-[var(--gris)] truncate hidden sm:block">{name}</div>
      {time && <div className="text-[15px] font-medium">{time}</div>}
    </div>
  );
  const sched = ow.basis === "scheduled-time";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4 sm:gap-8">
      {side(a.origin.iata, a.origin.name, worst(a.factors.filter((f) => f.side === "origin")), sched && a.flight?.scheduledDeparture ? `Dep ${a.flight.scheduledDeparture}` : undefined)}
      <div className="pt-6 sm:pt-10 text-center text-[14px] leading-tight">
        <div className="font-semibold">{new Date(a.request.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).replace("Sept", "Sep")}</div>
        <div className="text-[var(--gris)]">{a.horizon.daysAhead === 0 ? "today" : a.horizon.daysAhead === 1 ? "tomorrow" : `in ${a.horizon.daysAhead} days`}</div>
        {a.flight && <div className="mt-1 font-semibold">{a.flight.normalized}</div>}
      </div>
      {side(a.destination.iata, a.destination.name, worst(a.factors.filter((f) => f.side === "destination")), sched && a.flight?.scheduledArrival ? `Arr ${a.flight.scheduledArrival}` : undefined, true)}
      {!sched && <span className="sr-only">Weather read for the whole day, {hhmm(ow.from, a.origin.tz)} to {hhmm(dw.to, a.destination.tz)}</span>}
    </div>
  );
}

const Rows = ({ children }: { children: React.ReactNode }) => <ul className="border-t-[1.5px] border-[var(--noir)]">{children}</ul>;
const Row = ({ children, id }: { children: React.ReactNode; id?: string }) => (
  <li id={id} className="scroll-mt-6 py-3.5 border-b border-[var(--filet)] target:bg-white">{children}</li>
);
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="text-[26px] font-bold mb-3">{children}</h2>;

function EvidenceRow({ e }: { e: Evidence }) {
  return (
    <Row id={e.id}>
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
    </Row>
  );
}

const STATE: Record<SourceState, string> = { ok: "Used", error: "Failed", "not-applicable": "Not for this date", "no-data": "No data", disabled: "Off" };

export function Result({ a }: { a: Assessment }) {
  const counted = a.evidence.filter((e) => !e.ignoredBecause);
  const ignored = a.evidence.filter((e) => e.ignoredBecause);
  const tooEarly = a.confidence.level === "VERY_LOW" && a.factors.length === 0;
  const factors = [...a.factors].sort((x, y) => RANK[y.level] - RANK[x.level]);
  const where = (f: Factor) => f.airport ?? (f.side === "flight" ? a.flight?.normalized ?? "Flight" : "Route");
  const summary = "cursor-pointer select-none list-none text-[18px] font-semibold py-3.5 border-b border-[var(--filet)] flex justify-between [&::-webkit-details-marker]:hidden";

  return (
    <article className="space-y-12">
      <section aria-label="Verdict">
        {a.scenario && (
          <p className="mb-5 text-[14px] font-medium" style={{ color: a.scenario.synthetic ? "var(--severe)" : "var(--gris)" }}>
            {a.scenario.synthetic ? "Invented data" : a.scenario.label}
          </p>
        )}
        <Strip a={a} />
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
          {tooEarly ? (
            <span className="display inline-flex items-center rounded-md text-[28px] font-bold px-4 h-12" style={{ boxShadow: "inset 0 0 0 1.5px var(--noir)" }}>Too early</span>
          ) : (
            <Level l={a.level} big />
          )}
          <span className="text-[var(--gris)]">{tooEarly ? "History only" : CONF[a.confidence.level]}</span>
        </div>
        {a.adjustments.map((x) => <p key={x} className="mt-3 text-[15px] max-w-[68ch]">{x}</p>)}
      </section>

      <section aria-labelledby="do">
        <H2><span id="do">Do</span></H2>
        <Rows>
          {a.actions.map((x, i) => (
            <Row key={x}><span className={i === 0 ? "font-semibold" : ""}>{x}</span></Row>
          ))}
        </Rows>
      </section>

      {factors.length > 0 && (
        <section aria-labelledby="why">
          <H2><span id="why">Why</span></H2>
          <Rows>
            {factors.map((f) => (
              <Row key={f.id}>
                <div className="grid grid-cols-[3.5rem_1fr_auto] sm:grid-cols-[5rem_1fr_auto] gap-3 items-baseline">
                  <span className="display text-[18px] font-bold">{where(f)}</span>
                  <span className="text-[15px] min-w-0"><Cited text={`${f.summary} [${f.evidence.join(", ")}]`} /></span>
                  <Level l={f.level} />
                </div>
              </Row>
            ))}
          </Rows>
        </section>
      )}

      {a.alternates.length > 0 && (
        <section aria-labelledby="alts">
          <H2><span id="alts">Other airports</span></H2>
          <Rows>
            {a.alternates.map((x) => (
              <Row key={x.airport}>
                <div className="grid grid-cols-[3.5rem_1fr_auto] sm:grid-cols-[5rem_1fr_auto] gap-3 items-baseline">
                  <span className="display text-[18px] font-bold">{x.airport}</span>
                  <span className="text-[15px] text-[var(--gris)] min-w-0">
                    Instead of {x.side === "origin" ? a.origin.iata : a.destination.iata}
                    {x.routeOnTime !== undefined ? `, ${Math.round(x.routeOnTime * 100)}% on time` : ""}
                  </span>
                  <Level l={x.level} />
                </div>
              </Row>
            ))}
          </Rows>
        </section>
      )}

      <section className="border-t-[1.5px] border-[var(--noir)]">
        {a.narrative.by === "llm" && (
          <details>
            <summary className={summary}>Message for the traveler <span aria-hidden>+</span></summary>
            <div className="py-4 max-w-[68ch] space-y-2">
              <p><Cited text={a.narrative.summary} /></p>
              <p><Cited text={a.narrative.action} /></p>
              <p className="text-[13px] text-[var(--gris)]">Written by {a.narrative.model}, checked against the evidence.</p>
            </div>
          </details>
        )}
        <details>
          <summary className={summary}>Evidence ({counted.length}) <span aria-hidden>+</span></summary>
          <ul>{counted.map((e) => <EvidenceRow key={e.id} e={e} />)}</ul>
          {ignored.length > 0 && (
            <details className="mt-2 ml-11">
              <summary className="cursor-pointer py-3 text-[15px] font-semibold">Not counted ({ignored.length})</summary>
              <ul>{ignored.map((e) => <EvidenceRow key={e.id} e={e} />)}</ul>
            </details>
          )}
        </details>
        <details>
          <summary className={summary}>Sources ({a.sources.filter((s) => s.state === "ok").length} of {a.sources.length} used) <span aria-hidden>+</span></summary>
          <ul>
            {a.sources.map((s) => (
              <Row key={s.source}>
                <div className="flex justify-between gap-4 text-[15px]">
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline min-w-0">{s.name}</a>
                  <span className="shrink-0 font-medium" style={{ color: s.state === "error" ? "var(--severe)" : s.state === "ok" ? "var(--noir)" : "var(--gris)" }}>{STATE[s.state]}</span>
                </div>
                {s.state === "error" && s.note && <div className="text-[13px] text-[var(--gris)] mt-1">{s.note}</div>}
              </Row>
            ))}
          </ul>
        </details>
        {a.narrative.rejectedReason && <p className="mt-3 text-[13px] text-[var(--gris)]">{a.narrative.rejectedReason}.</p>}
      </section>
    </article>
  );
}
