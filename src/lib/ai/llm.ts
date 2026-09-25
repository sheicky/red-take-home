// The only place that talks to the model. OpenRouter, OpenAI-compatible Chat Completions.
// Key and model come from the server env; the key never reaches the browser.

export const DEFAULT_MODEL = "google/gemma-4-31b-it:free";
// Free models share one upstream quota and get rate-limited at busy times. OpenRouter tries these
// next, in order, when the first one cannot answer. Still Gemma 4, still free.
export const DEFAULT_FALLBACKS = "google/gemma-4-26b-a4b-it:free";

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export const llmConfig = () => ({
  key: process.env.OPENROUTER_API_KEY || "",
  model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
  // Set OPENROUTER_FALLBACK_MODELS to an empty string to turn fallbacks off.
  fallbacks: list(process.env.OPENROUTER_FALLBACK_MODELS ?? DEFAULT_FALLBACKS),
  // Any OpenAI-compatible endpoint works: a proxy, or a local stand-in for end-to-end tests.
  base: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
});

const RETRIES = [1500, 4000]; // ms before the 2nd and 3rd attempt, unless the API says otherwise

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((ok, ko) => {
    if (signal.aborted) return ko(signal.reason);
    const t = setTimeout(ok, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); ko(signal.reason); }, { once: true });
  });

/** One Chat Completions call. A 429 or 503 (busy upstream) is retried twice, honouring Retry-After. */
export async function llmChat(body: Record<string, unknown>, fetchImpl: typeof fetch, signal: AbortSignal): Promise<Response> {
  const { key, model, fallbacks, base } = llmConfig();
  const models = [model, ...fallbacks.filter((m) => m !== model)];
  const send = () => fetchImpl(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // OpenRouter's app attribution headers. Optional, harmless elsewhere.
      "HTTP-Referer": "https://github.com/sheicky/red-take-home",
      "X-Title": "Trip check",
    },
    signal,
    body: JSON.stringify({ model, ...(models.length > 1 ? { models } : {}), temperature: 0.2, ...body }),
  });
  let res = await send();
  for (const wait of RETRIES) {
    if (res.status !== 429 && res.status !== 503) break;
    const after = Number(res.headers.get("retry-after"));
    await res.body?.cancel();
    await pause(Number.isFinite(after) && res.headers.has("retry-after") ? Math.min(after * 1000, 8000) : wait, signal);
    res = await send();
  }
  return res;
}

/** What the page says when the free model's shared quota is used up. The detail goes to the log. */
export const BUSY = "The free AI model is busy right now: its provider is limiting requests. Everything else on this page comes from the rules and is complete. Try again in a few minutes.";

/** What the API said went wrong, in one short line: `{"error":{"message":…}}` or the raw text. */
export async function upstreamError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  let msg = text;
  try {
    const e = JSON.parse(text)?.error;
    // OpenRouter's "Provider returned error" hides the real reason in metadata.
    const raw = e?.metadata?.raw ? ` (${e.metadata.provider_name ?? "provider"}: ${String(e.metadata.raw).slice(0, 200)})` : "";
    msg = e?.message ? `${e.message}${raw}` : text;
  } catch { /* not JSON */ }
  return `model API ${res.status}${msg ? `: ${String(msg).slice(0, 300)}` : ""}`;
}
