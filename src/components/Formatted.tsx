"use client";

import { blocks, type Inline } from "@/lib/ai/format";
import { Cited } from "./Cited";

const Line = ({ parts, known }: { parts: Inline[]; known?: string[] }) => (
  <>{parts.map((p, i) => (p.bold ? <strong key={i}><Cited text={p.text} known={known} /></strong> : <Cited key={i} text={p.text} known={known} />))}</>
);

/** A model's answer as paragraphs and lists, citations linked. Never raw HTML. */
export function Formatted({ text, known }: { text: string; known?: string[] }) {
  return (
    <div className="space-y-2">
      {blocks(text).map((b, i) =>
        b.kind === "p" ? <p key={i}><Line parts={b.parts} known={known} /></p>
        : b.kind === "ul" ? <ul key={i} className="list-disc pl-5 space-y-1">{b.items.map((it, j) => <li key={j}><Line parts={it} known={known} /></li>)}</ul>
        : <ol key={i} className="list-decimal pl-5 space-y-1">{b.items.map((it, j) => <li key={j}><Line parts={it} known={known} /></li>)}</ol>,
      )}
    </div>
  );
}
