// Where the AI sits in the product, and where it does not.
//
// The rules decide the level, the factors and the candidate actions. The LLM gets THAT — never
// the raw feeds — and writes two things an Ops agent can paste to a traveler: a summary and the
// recommended action. Then a guard checks the draft. If the draft cites evidence that doesn't
// exist, contradicts the level, or waves off a HIGH/SEVERE risk, it is thrown away and the
// deterministic template is shown instead — with the reason, so the rejection is visible.
//
// No key, timeout, or API error → template. The tool never depends on the model to work.

import type { Assessment, Level, Narrative } from "./types";
import { levelRank } from "./types";

type Draft = { summary: string; action: string; citations: string[] };

export function templateNarrative(a: Omit<Assessment, "narrative">): Narrative {
  const top = [...a.factors].sort((x, y) => levelRank(y.level) - levelRank(x.level)).slice(0, 2);
  const route = `${a.origin.iata}→${a.destination.iata} on ${a.request.date}`;
  const history = a.evidence.find((e) => e.source === "bts-route");
  const summary = top.length
    ? `${a.level} risk for ${route}. ${top.map((f) => `${f.summary} [${f.evidence.join(", ")}]`).join(" ")}`
    : a.confidence.level === "VERY_LOW"
      ? `Too early to call ${route}: no live source reaches that date yet, and on-time history shows nothing unusual${history ? ` [${history.id}]` : ""}.`
      : `${a.level} risk for ${route}: no source reports a disruption for this window.`;
  return {
    by: "template",
    summary,
    action: a.actions.slice(0, 2).join(" "),
    citations: [...new Set([...top.flatMap((f) => f.evidence), ...(!top.length && history ? [history.id] : [])])],
  };
}

const OTHER_LEVEL_WORDS: Record<Level, RegExp> = {
  LOW: /\b(moderate|high|severe|elevated|significant)[- ]risk\b/i,
  MODERATE: /\b(low|minimal|high|severe|no)[- ]risk\b/i,
  HIGH: /\b(low|minimal|moderate|no)[- ]risk\b/i,
  SEVERE: /\b(low|minimal|moderate|no)[- ]risk\b/i,
};

/** Returns the reason to reject a draft, or null when it may be shown. Pure — unit tested. */
export function guardDraft(d: Draft, level: Level, evidenceIds: Set<string>): string | null {
  if (typeof d?.summary !== "string" || typeof d.action !== "string" || !d.summary.trim() || !d.action.trim()) return "empty or malformed summary/action";
  const cites = Array.isArray(d.citations) ? d.citations.map(String) : [];
  const inline = [...`${d.summary} ${d.action}`.matchAll(/\bE\d+\b/g)].map((m) => m[0]);
  const bogus = [...new Set([...cites, ...inline])].filter((id) => !evidenceIds.has(id));
  if (bogus.length) return `cited evidence that does not exist: ${bogus.join(", ")}`;
  if (!cites.length && !inline.length && evidenceIds.size) return "no evidence cited";
  if (OTHER_LEVEL_WORDS[level].test(`${d.summary} ${d.action}`)) return `text states a risk level other than ${level}`;
  if (levelRank(level) >= 2 && /\bno (action|need)|nothing to do|not? (worry|concern)/i.test(d.action)) return `action dismisses a ${level} risk`;
  if (d.summary.length > 900 || d.action.length > 600) return "draft too long for an Ops handoff";
  return null;
}

export async function narrate(a: Omit<Assessment, "narrative">, fetchImpl: typeof fetch = fetch): Promise<Narrative> {
  const fallback = templateNarrative(a);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallback;
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  // The model sees only the rules' output, trimmed to what a writer needs.
  const brief = {
    trip: { from: `${a.origin.iata} (${a.origin.city})`, to: `${a.destination.iata} (${a.destination.city})`, date: a.request.date, daysAhead: a.horizon.daysAhead },
    level: a.level,
    confidence: a.confidence,
    factors: a.factors.map((f) => ({ level: f.level, where: f.airport ?? f.side, summary: f.summary, evidence: f.evidence })),
    evidence: a.evidence.filter((e) => !e.ignoredBecause).map((e) => ({ id: e.id, source: e.source, title: e.title, detail: e.detail.slice(0, 300) })),
    candidateActions: a.actions,
    alternates: a.alternates.map((x) => ({ airport: x.airport, side: x.side, level: x.level, reasons: x.reasons })),
  };

  const system = [
    "You write travel-disruption briefings for a corporate Operations agent.",
    `The risk level is already decided: ${a.level}. Do not restate it as a different level, do not soften or raise it.`,
    "Use ONLY the facts in the brief. No outside knowledge, no invented numbers or times.",
    "Cite evidence ids inline like [E3] after each fact, and list every id you cite in `citations`.",
    "summary: 2–3 sentences, what is going on and why it matters for this trip.",
    "action: 1–3 concrete steps for the Ops agent, picked and adapted from candidateActions and alternates. Imperative voice.",
    "If confidence is LOW or VERY_LOW, say when to re-check.",
  ].join("\n");

  try {
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(brief) }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "briefing", strict: true,
            schema: {
              type: "object", additionalProperties: false, required: ["summary", "action", "citations"],
              properties: { summary: { type: "string" }, action: { type: "string" }, citations: { type: "array", items: { type: "string" } } },
            },
          },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ...fallback, rejectedReason: `OpenAI ${res.status}: ${body.slice(0, 160)}` };
    }
    const j = await res.json();
    let draft: Draft;
    try {
      draft = JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as Draft;
    } catch {
      return { ...fallback, model, rejectedReason: "LLM draft rejected: not valid JSON" };
    }
    const reason = guardDraft(draft, a.level, new Set(a.evidence.map((e) => e.id)));
    if (reason) return { ...fallback, model, rejectedReason: `LLM draft rejected: ${reason}` };
    return { by: "llm", summary: draft.summary, action: draft.action, citations: draft.citations ?? [], model };
  } catch (e) {
    return { ...fallback, rejectedReason: `OpenAI unavailable: ${(e as Error).message}` };
  }
}
