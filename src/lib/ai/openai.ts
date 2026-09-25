// The only place that talks to OpenAI. Chat Completions, key and model from the server env.

export const openaiConfig = () => ({ key: process.env.OPENAI_API_KEY || "", model: process.env.OPENAI_MODEL || "gpt-5-mini" });

/** Reasoning models (gpt-5*, o*) take an effort instead of a temperature. */
const tuning = (model: string) => (/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: "low" } : { temperature: 0.2 });

export function openaiChat(body: Record<string, unknown>, fetchImpl: typeof fetch, signal: AbortSignal): Promise<Response> {
  const { key, model } = openaiConfig();
  return fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ model, ...tuning(model), ...body }),
  });
}
