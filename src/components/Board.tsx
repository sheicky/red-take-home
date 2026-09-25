import type { Level } from "@/lib/types";
import { Plane } from "./icons";

/** Three columns shared by the route header, the signal columns and the skeleton, so they line up. */
export const COLS = "grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1fr)] gap-x-4 sm:gap-x-6";

export const tone = (l: Level | null) => (l === null ? "var(--filet)" : l === "LOW" ? "#d9d5c3" : `var(--${l.toLowerCase()})`);

/** The trip as a route: codes, a track tinted by each end's risk, and whatever sits in the middle. */
export function RouteHeader({ origin, destination, from, to, center, below, dep, arr }: {
  origin: string;
  destination: string;
  from: Level | null;
  to: Level | null;
  center: React.ReactNode;
  below: React.ReactNode;
  dep?: React.ReactNode;
  arr?: React.ReactNode;
}) {
  return (
    <div>
      <div className={COLS}>
        <div className="display font-bold leading-[0.8] text-[64px] sm:text-[104px]">{origin}</div>
        <div className="hidden sm:flex items-center justify-center">{center}</div>
        <div className="display font-bold leading-[0.8] text-[64px] sm:text-[104px] text-right">{destination}</div>
      </div>
      <div className="mt-4 flex items-center gap-2" aria-hidden>
        <span className="h-2 flex-1 rounded-full" style={{ background: tone(from) }} />
        <Plane className="shrink-0" />
        <span className="h-2 flex-1 rounded-full" style={{ background: tone(to) }} />
      </div>
      <div className={`${COLS} mt-2 text-[15px]`}>
        <div className="font-medium">{dep}</div>
        <div className="hidden sm:block text-center text-[var(--gris)]">{below}</div>
        <div className="font-medium text-right">{arr}</div>
      </div>
      <div className="sm:hidden mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        {center}
        <span className="text-[var(--gris)] text-[15px]">{below}</span>
      </div>
    </div>
  );
}
