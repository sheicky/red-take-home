// The chat: questions about the assessment on screen, answered from that assessment only.

import { requestFromParams } from "../query";
import type { Run } from "../run";
import type { Assessment, AssessmentRequest } from "../types";
import { fenced } from "./context";
import { BUSY, llmChat, llmConfig, upstreamError } from "./llm";
import { chatSystem } from "./prompts";

export interface Turn { role: "user" | "assistant"; content: string }

const MAX_TURNS = 12;
const MAX_CHARS = 1000;

/** The client sends the conversation back each time. Only plain user/assistant turns get through. */
export function validateHistory(h: unknown): string | null {
  if (!Array.isArray(h)) return "messages must be a list";
  if (!h.length) return "messages needs at least one turn";
  if (h.length > 40) return "conversation too long, start a new one";
  for (const t of h as Turn[]) {
    if (t?.role !== "user" && t?.role !== "assistant") return "each message needs role user or assistant";
    if (typeof t.content !== "string" || !t.content.trim()) return "a message is empty";
    if (t.content.length > MAX_CHARS) return `a message is longer than ${MAX_CHARS} characters`;
  }
  if ((h as Turn[]).at(-1)!.role !== "user") return "the conversation must end with the user";
  return null;
}

export function chatMessages(a: Assessment, history: Turn[]) {
  return [
    { role: "system" as const, content: chatSystem(a.level) },
    { role: "system" as const, content: fenced(a) },
    ...history.slice(-MAX_TURNS).map(({ role, content }) => ({ role, content })),
  ];
}

/** OpenAI-format server-sent events in, the text deltas out. Lines may be split across chunks. */
export function readDeltas(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  const emit = (line: string, out: TransformStreamDefaultController<Uint8Array>) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const text = JSON.parse(data).choices?.[0]?.delta?.content;
      if (text) out.enqueue(enc.encode(text));
    } catch { /* a keep-alive or a partial line we cannot use */ }
  };
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, out) {
      buf += dec.decode(chunk, { stream: true });
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        emit(buf.slice(0, i).trim(), out);
        buf = buf.slice(i + 1);
      }
    },
    flush(out) { emit(buf.trim(), out); },
  }));
}

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function handleChat(
  body: { from?: string; to?: string; date?: string; messages?: unknown },
  deps: { assessment: (req: AssessmentRequest) => Promise<Run>; fetchImpl: typeof fetch; signal?: AbortSignal },
): Promise<Response> {
  if (!llmConfig().key) return fail(503, "Chat is unavailable: OPENROUTER_API_KEY is not set on the server.");
  const req = requestFromParams({ from: body?.from, to: body?.to, date: body?.date });
  if (!req) return fail(400, "from, to and date are required.");
  const bad = validateHistory(body.messages);
  if (bad) return fail(400, bad);

  const run = await deps.assessment(req);
  if (!run.ok) return fail(run.status, run.error);

  const signal = AbortSignal.any([AbortSignal.timeout(60_000), ...(deps.signal ? [deps.signal] : [])]);
  let res: Response;
  try {
    res = await llmChat({ stream: true, messages: chatMessages(run.assessment, body.messages as Turn[]) }, deps.fetchImpl, signal);
  } catch (e) {
    return fail(502, `The model is unavailable: ${(e as Error).message}`);
  }
  if (res.status === 429) { console.warn(`[chat] ${await upstreamError(res)}`); return fail(503, BUSY); }
  if (!res.ok || !res.body) return fail(502, `The model did not answer (${await upstreamError(res)}).`);
  return new Response(readDeltas(res.body), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
