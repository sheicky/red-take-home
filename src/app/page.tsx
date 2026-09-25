import { Suspense } from "react";
import { BriefingSkeleton, BriefingView } from "@/components/BriefingView";
import { Chat } from "@/components/Chat";
import { Result } from "@/components/Result";
import { ResultSkeleton } from "@/components/ResultSkeleton";
import { TripForm } from "@/components/TripForm";
import { llmConfig } from "@/lib/ai/llm";
import { requestFromParams, searchFor } from "@/lib/query";
import { cachedAssessment, cachedBriefing } from "@/lib/run";
import type { Assessment, AssessmentRequest } from "@/lib/types";

const tomorrowInNewYork = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(Date.now() + 86_400_000);

async function Briefed({ a }: { a: Assessment }) {
  return <BriefingView b={await cachedBriefing(a)} known={a.evidence.map((e) => e.id)} />;
}

async function Assessed({ req }: { req: AssessmentRequest }) {
  const r = await cachedAssessment(req);
  if (!r.ok) return <p role="alert" className="font-medium" style={{ color: "var(--severe)" }}>{r.error}</p>;
  const a = r.assessment;
  const known = a.evidence.map((e) => e.id);
  const aiOn = !!llmConfig().key;
  return (
    <Result
      a={a}
      briefing={aiOn
        ? <Suspense key="briefing" fallback={<BriefingSkeleton />}><Briefed a={a} /></Suspense>
        : <p key="briefing-off" className="text-[14px] text-[var(--gris)]">The message and the chat are off: OPENROUTER_API_KEY is not set on the server.</p>}
      chat={aiOn ? <Chat key="chat" trip={{ from: a.request.origin, to: a.request.destination, date: a.request.date }} known={known} /> : null}
    />
  );
}

export default async function Page({ searchParams }: PageProps<"/">) {
  const req = requestFromParams(await searchParams);
  const key = req ? searchFor(req) : "empty";
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-14">
      <h1 className="text-[40px] sm:text-[52px] font-bold leading-none">Trip check</h1>
      <TripForm key={key} initial={req} defaultDate={tomorrowInNewYork()} />
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
