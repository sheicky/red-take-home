import { Suspense } from "react";
import { Result } from "@/components/Result";
import { ResultSkeleton } from "@/components/ResultSkeleton";
import { TripForm } from "@/components/TripForm";
import { requestFromParams, searchFor } from "@/lib/query";
import { runAssessment } from "@/lib/run";
import type { AssessmentRequest } from "@/lib/types";

const tomorrowInNewYork = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(Date.now() + 86_400_000);

async function Assessed({ req }: { req: AssessmentRequest }) {
  const r = await runAssessment(req);
  if (!r.ok) return <p role="alert" className="font-medium" style={{ color: "var(--severe)" }}>{r.error}</p>;
  return <Result a={r.assessment} />;
}

export default async function Page({ searchParams }: PageProps<"/">) {
  const req = requestFromParams(await searchParams);
  const key = req ? searchFor(req) : "empty";
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-14">
      <h1 className="text-[40px] sm:text-[52px] font-bold leading-none">Trip check</h1>
      <TripForm
        key={key}
        initial={req}
        defaultDate={tomorrowInNewYork()}
      />
      {req && (
        <div className="mt-12">
          {/* A new key per trip: React drops the old result and shows the skeleton while the sources answer. */}
          <Suspense key={key} fallback={<ResultSkeleton req={req} />}>
            <Assessed req={req} />
          </Suspense>
        </div>
      )}
    </main>
  );
}
