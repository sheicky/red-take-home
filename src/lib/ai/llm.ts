// The only place that talks to the model. OpenRouter, OpenAI-compatible Chat Completions.
// Key and model come from the server env; the key never reaches the browser.

export const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

export const llmConfig = () => ({
  key: process.env.OPENROUTER_API_KEY || "",
  model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
  // Any OpenAI-compatible endpoint works: a proxy, or a local stand-in for end-to-end tests.
  base: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
});

export function llmChat(body: Record<string, unknown>, fetchImpl: typeof fetch, signal: AbortSignal): Promise<Response> {
  const { key, model, base } = llmConfig();
  return fetchImpl(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // OpenRouter's app attribution headers. Optional, harmless elsewhere.
      "HTTP-Referer": "https://github.com/sheicky/red-take-home",
      "X-Title": "Trip check",
    },
    signal,
    body: JSON.stringify({ model, temperature: 0.2, ...body }),
  });
}

/** What the API said went wrong, in one short line: `{"error":{"message":…}}` or the raw text. */
export async function upstreamError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  let msg = text;
  try { msg = JSON.parse(text)?.error?.message ?? text; } catch { /* not JSON */ }
  return `model API ${res.status}${msg ? `: ${String(msg).slice(0, 160)}` : ""}`;
}
