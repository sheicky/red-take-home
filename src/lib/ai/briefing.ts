// Where the AI sits in the product, and where it does not.
//
// The rules decide the level, the factors and the actions. The model gets THAT (see context.ts),
// never the raw feeds, and writes the short message the Ops agent sends the traveler. A guard
// then checks the draft: citing evidence that does not exist, stating another level, or waving
// off a HIGH/SEVERE risk throws it away, and the page says why. The "Do" list, written by the
// rules, is always there: the tool never depends on the model to be useful.

import type { Assessment, Briefing, Level } from "../types";
import { levelRank } from "../types";
import { fenced } from "./context";
import { openaiChat, openaiConfig } from "./openai";
import { briefingSystem } from "./prompts";

type Draft = { summary: string; action: string; citations: string[] };

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

const SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "briefing", strict: true,
    schema: {
      type: "object", additionalProperties: false, required: ["summary", "action", "citations"],
      properties: { summary: { type: "string" }, action: { type: "string" }, citations: { type: "array", items: { type: "string" } } },
    },
  },
};

export async function writeBriefing(a: Assessment, fetchImpl: typeof fetch = fetch): Promise<Briefing> {
  const { key, model } = openaiConfig();
  if (!key) return { ok: false, reason: "OPENAI_API_KEY is not set on the server." };
  try {
    const res = await openaiChat(
      { messages: [{ role: "system", content: briefingSystem(a.level) }, { role: "system", content: fenced(a) }], response_format: SCHEMA },
      fetchImpl, AbortSignal.timeout(45_000),
    );
    if (!res.ok) return { ok: false, reason: `OpenAI ${res.status}: ${(await res.text()).slice(0, 160)}` };
    const j = await res.json();
    let draft: Draft;
    try {
      draft = JSON.parse(j.choices?.[0]?.message?.content ?? "") as Draft;
    } catch {
      return { ok: false, reason: "the model's draft was not valid JSON" };
    }
    const reason = guardDraft(draft, a.level, new Set(a.evidence.map((e) => e.id)));
    if (reason) return { ok: false, reason: `the model's draft was rejected: ${reason}` };
    return { ok: true, summary: draft.summary, action: draft.action, citations: draft.citations ?? [], model };
  } catch (e) {
    return { ok: false, reason: `OpenAI unavailable: ${(e as Error).message}` };
  }
}
