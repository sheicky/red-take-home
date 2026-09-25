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
      <p className="font-semibold"><Cited text={b.action} known={known} /></p>
      <p className="text-[13px] text-[var(--gris)]">Written by {b.model} from the evidence below, then checked: it cites only this evidence and keeps the level.</p>
    </div>
  );
}
