import type { Briefing } from "@/lib/types";
import { Cited } from "./Cited";

const Bar = ({ className }: { className: string }) => <span className={`block rounded-md bg-[var(--filet)] animate-pulse ${className}`} />;

export function BriefingSkeleton() {
  return (
    <div aria-busy="true" className="rounded-2xl border border-[var(--filet)] bg-white p-5 space-y-2.5">
      <span className="sr-only">Writing the message</span>
      <Bar className="h-4 w-full max-w-xl" /><Bar className="h-4 w-4/5 max-w-lg" /><Bar className="h-4 w-2/3 max-w-md" />
    </div>
  );
}

export function BriefingView({ b, known }: { b: Briefing; known: string[] }) {
  if (!b.ok) return <p className="text-[14px] text-[var(--gris)]">No message: {b.reason}</p>;
  return (
    <div className="rounded-2xl border border-[var(--filet)] bg-white p-5 max-w-[72ch] space-y-3">
      <p><Cited text={b.summary} known={known} /></p>
      <ul className="list-disc pl-5 space-y-1 font-semibold">
        {b.steps.map((x, i) => <li key={i}><Cited text={x} known={known} /></li>)}
      </ul>
      <p className="text-[13px] text-[var(--gris)]">Written by {b.model} through OpenRouter, from the evidence below. Checked before display: it cites only this evidence and keeps the level.</p>
    </div>
  );
}
