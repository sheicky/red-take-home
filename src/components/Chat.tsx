"use client";

import { useEffect, useRef, useState } from "react";
import { Cited } from "./Cited";

type Turn = { role: "user" | "assistant"; content: string };

/** Questions about the trip on screen. The server answers from its own copy of this assessment. */
export function Chat({ trip, known }: { trip: { from: string; to: string; date: string }; known: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [turns]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || busy) return;
    const history: Turn[] = [...turns, { role: "user", content: q }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...trip, messages: history }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setTurns([...history, { role: "assistant", content: text }]);
      }
      if (!text.trim()) throw new Error("The model returned an empty answer.");
    } catch (err) {
      setTurns(history.slice(0, -1));
      setDraft(q);
      setError(`${(err as Error).message} Your question is back in the box.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="ask">
      <h2 id="ask" className="text-[26px] font-bold mb-3">Ask about this trip</h2>
      <div className="rounded-2xl border-[1.5px] border-[var(--noir)] bg-white">
        {turns.length > 0 && (
          <div className="max-h-[26rem] overflow-y-auto p-4 space-y-4" aria-live="polite">
            {turns.map((t, i) =>
              t.role === "user" ? (
                <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl bg-[var(--noir)] text-[var(--creme)] px-4 py-2.5">{t.content}</p>
              ) : (
                <p key={i} className="max-w-[72ch] whitespace-pre-wrap">
                  {t.content ? <Cited text={t.content} known={known} /> : <span className="inline-block h-4 w-24 rounded-md bg-[var(--filet)] animate-pulse align-middle" aria-label="Answering" />}
                </p>
              ),
            )}
            <div ref={end} />
          </div>
        )}
        <form onSubmit={ask} className={`flex gap-2 p-2 ${turns.length ? "border-t border-[var(--filet)]" : ""}`}>
          <label htmlFor="q" className="sr-only">Question about this trip</label>
          <input
            id="q"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            autoComplete="off"
            placeholder="Why this level? What should I tell the traveler?"
            className="min-w-0 flex-1 h-11 rounded-full border-[1.5px] border-[var(--filet)] focus:border-[var(--noir)] bg-[var(--creme)] px-4 text-[16px] outline-none focus-visible:outline-none"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="h-11 shrink-0 rounded-full bg-[var(--noir)] text-[var(--jaune)] font-semibold px-5 disabled:opacity-50 cursor-pointer disabled:cursor-default">
            {busy ? "…" : "Ask"}
          </button>
        </form>
      </div>
      {error && <p role="alert" className="mt-3 text-[14px] font-medium" style={{ color: "var(--severe)" }}>{error}</p>}
    </section>
  );
}
