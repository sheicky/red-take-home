// Live check of the AI parts against a running server: the message and one chat answer.
// Usage: bun run smoke:ai [base URL]   (default http://localhost:3000)
// Needs OPENROUTER_API_KEY on the SERVER, not here. Exits 1 if either part fails.

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86_400_000));
const trip = { origin: "JFK", destination: "SFO", date };

const a = await fetch(`${base}/api/assess`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(trip) });
if (!a.ok) { console.error(`assess: HTTP ${a.status} ${await a.text()}`); process.exit(1); }
const { level, briefing } = await a.json();
console.log(`JFK → SFO ${date}: ${level}`);
if (!briefing?.ok) { console.error(`message: FAILED, ${briefing?.reason}`); process.exit(1); }
console.log(`message (${briefing.model}):\n  ${briefing.summary}\n${briefing.steps.map((s: string) => `  - ${s}`).join("\n")}`);

const c = await fetch(`${base}/api/chat`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ from: trip.origin, to: trip.destination, date, messages: [{ role: "user", content: "Why is the risk at this level?" }] }),
});
const answer = await c.text();
if (!c.ok || !answer.trim()) { console.error(`chat: FAILED, HTTP ${c.status} ${answer.slice(0, 300)}`); process.exit(1); }
console.log(`chat:\n  ${answer.trim().replace(/\n/g, "\n  ")}`);

export {};
