// Where the AI sits in the product, and where it does not.
//
// The rules decide the level, the factors and the actions. The model gets THAT (see context.ts),
// never the raw feeds, and writes the short message the Ops agent sends the traveler. A guard
// then checks the draft: citing evidence that does not exist, stating another level, or waving
// off a HIGH/SEVERE risk throws it away, and the page says why. A malformed or rejected
// draft gets ONE retry, told what was wrong: free models slip on format more than on facts. The "Do" list, written by the
// rules, is always there: the tool never depends on the model to be useful.

import type { Assessment, Briefing, Level } from "../types";
import { levelRank } from "../types";
import { fenced } from "./context";
import { jsonIn, plain } from "./format";
import { BUSY, llmChat, llmConfig, upstreamError } from "./llm";
import { briefingSystem } from "./prompts";

export type Draft = { summary: string; steps: string[]; citations: string[] };

const OTHER_LEVEL_WORDS: Record<Level, RegExp> = {
  LOW: /\b(moderate|high|severe|elevated|significant)[- ]risk\b/i,
  MODERATE: /\b(low|minimal|high|severe|no)[- ]risk\b/i,
  HIGH: /\b(low|minimal|moderate|no)[- ]risk\b/i,
  SEVERE: /\b(low|minimal|moderate|no)[- ]risk\b/i,
};

/** Returns the reason to reject a draft, or null when it may be shown. Pure — unit tested. */
export function guardDraft(d: Draft, level: Level, evidenceIds: Set<string>): string | null {
  const steps = Array.isArray(d?.steps) ? d.steps : null;
  if (typeof d?.summary !== "string" || !d.summary.trim() || !steps || steps.some((x) => typeof x !== "string" || !x.trim())) return "empty or malformed summary/steps";
  if (steps.length < 1 || steps.length > 3) return "steps must hold 1 to 3 items";
  const text = `${d.summary} ${steps.join(" ")}`;
  const cites = Array.isArray(d.citations) ? d.citations.map(String) : [];
  const inline = [...text.matchAll(/\bE\d+\b/g)].map((m) => m[0]);
  const bogus = [...new Set([...cites, ...inline])].filter((id) => !evidenceIds.has(id));
  if (bogus.length) return `cited evidence that does not exist: ${bogus.join(", ")}`;
  if (!cites.length && !inline.length && evidenceIds.size) return "no evidence cited";
  if (OTHER_LEVEL_WORDS[level].test(text)) return `text states a risk level other than ${level}`;
  if (levelRank(level) >= 2 && steps.some((x) => /\bno (action|need)|nothing to do|not? (worry|concern)/i.test(x))) return `a step dismisses a ${level} risk`;
  if (d.summary.length > 900 || steps.join("").length > 600) return "draft too long for an Ops handoff";
  return null;
}

/** Parse, clean, check. Returns the draft or why it cannot be shown. */
export function readDraft(content: string, level: Level, ids: Set<string>): { draft: Draft } | { reason: string } {
  let raw: Record<string, unknown>;
  try {
    raw = jsonIn(content) as Record<string, unknown>;
  } catch {
    return { reason: "the reply was not valid JSON" };
  }
  // Older habit of some models: one "action" string instead of a list of steps.
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : typeof raw.action === "string" ? [raw.action] : null;
  const draft: Draft = {
    summary: typeof raw.summary === "string" ? plain(raw.summary) : (raw.summary as string),
    steps: rawSteps ? rawSteps.map((x) => (typeof x === "string" ? plain(x) : x)).filter((x) => x !== "") as string[] : (raw.steps as string[]),
    citations: Array.isArray(raw.citations) ? raw.citations.map(String) : [],
  };
  const reason = guardDraft(draft, level, ids);
  return reason ? { reason } : { draft };
}

const FORMAT = { type: "json_object" };

export async function writeBriefing(a: Assessment, fetchImpl: typeof fetch = fetch): Promise<Briefing> {
  const { key, model } = llmConfig();
  if (!key) return { ok: false, reason: "OPENROUTER_API_KEY is not set on the server." };
  const ids = new Set(a.evidence.map((e) => e.id));
  const messages: { role: string; content: string }[] = [
    { role: "system", content: briefingSystem(a.level) },
    { role: "system", content: fenced(a) },
    { role: "user", content: "Write the message as the JSON object described above. JSON only." },
  ];
  let reason = "";
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await llmChat({ messages, response_format: FORMAT }, fetchImpl, AbortSignal.timeout(45_000));
      if (!res.ok) {
        const detail = await upstreamError(res);
        if (res.status === 429) { console.warn(`[briefing] ${detail}`); return { ok: false, reason: BUSY }; }
        return { ok: false, reason: detail };
      }
      const j = await res.json();
      const content: string = j.choices?.[0]?.message?.content ?? "";
      const r = readDraft(content, a.level, ids);
      // With fallbacks, the model that answered may not be the first one asked: name the real one.
      if ("draft" in r) return { ok: true, ...r.draft, model: typeof j.model === "string" && j.model ? j.model : model };
      reason = r.reason;
      messages.push({ role: "assistant", content }, { role: "user", content: `That draft was rejected: ${reason}. Reply again with only the JSON object, following every rule.` });
    }
    return { ok: false, reason: `the model's draft was rejected twice: ${reason}` };
  } catch (e) {
    return { ok: false, reason: `model unavailable: ${(e as Error).message}` };
  }
}
