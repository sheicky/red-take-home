import type { AssessmentRequest } from "@/lib/types";
import { COLS, RouteHeader } from "./Board";

const Bar = ({ className }: { className: string }) => <span className={`block rounded-md bg-[var(--filet)] animate-pulse ${className}`} />;

function TileShape() {
  return (
    <div className="rounded-xl bg-white border border-[var(--filet)] p-3.5 space-y-2.5">
      <div className="flex justify-between"><Bar className="h-4 w-20" /><Bar className="h-5 w-14" /></div>
      <Bar className="h-6 w-28" />
      <Bar className="h-3 w-16" />
    </div>
  );
}

/** What the result will look like, drawn before any source has answered. The codes are already known. */
export function ResultSkeleton({ req }: { req: AssessmentRequest }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-10">
      <span className="sr-only">Checking {req.origin} to {req.destination}</span>
      <section className="space-y-6">
        <RouteHeader
          origin={req.origin}
          destination={req.destination}
          from={null}
          to={null}
          center={<Bar className="h-12 sm:h-14 w-40" />}
          below={<span className="flex flex-col items-center gap-1.5 w-full"><Bar className="h-3.5 w-28" /><Bar className="h-3.5 w-24" /></span>}
          dep={<Bar className="h-4 w-20" />}
          arr={<span className="flex justify-end"><Bar className="h-4 w-20" /></span>}
        />
        <div className={`${COLS} gap-y-6`}>
          <div className="col-span-2 sm:col-span-1 grid content-start gap-2"><TileShape /><TileShape /></div>
          <div className="hidden sm:block" />
          <div className="col-span-2 sm:col-span-1 grid content-start gap-2"><TileShape /></div>
        </div>
      </section>
      <section>
        <Bar className="h-7 w-12 mb-3" />
        <div className="rounded-2xl border-[1.5px] border-[var(--filet)] bg-white divide-y divide-[var(--filet)]">
          {[0, 1].map((i) => <div key={i} className="flex gap-3.5 p-4"><Bar className="size-[22px]" /><Bar className="h-4 flex-1 max-w-md" /></div>)}
        </div>
      </section>
    </div>
  );
}
