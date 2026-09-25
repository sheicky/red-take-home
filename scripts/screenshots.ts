// Takes the demo screenshots in docs/screenshots from a running server, with the local Chrome.
// Usage: bun run screenshots [base URL]   (default http://localhost:3000; a production build looks best)
// The data is live, so the pictures show whatever the sources say on the day they are taken.

import { chromium, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const dir = "docs/screenshots";
mkdirSync(dir, { recursive: true });
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86_400_000));
const trip = (from: string, to: string) => `${base}/?from=${from}&to=${to}&date=${tomorrow}`;

const browser = await chromium.launch({ channel: "chrome" });
const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

const settle = async (p: Page) => {
  await p.waitForSelector("[aria-label=Verdict]", { timeout: 60_000 });
  await p.waitForFunction(() => !document.querySelector("[aria-busy=true]"), undefined, { timeout: 90_000 }).catch(() => {});
  await p.waitForTimeout(400);
};
/** A crop around one element, in PAGE coordinates (what a fullPage screenshot expects). */
const around = (p: Page, selector: string) =>
  p.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: 0, y: Math.max(0, r.top + window.scrollY - 24), width: document.documentElement.clientWidth, height: r.height + 48 };
  });
const shot = async (p: Page, name: string, opts: Parameters<Page["screenshot"]>[0] = {}) => {
  await p.screenshot({ path: `${dir}/${name}.png`, ...opts });
  console.log(`${dir}/${name}.png`);
};

// 1. Search: a city gives every airport of its area.
await desktop.goto(base);
await desktop.waitForFunction(() => Object.keys(document.querySelector("input[role=combobox]")!).some((k) => k.startsWith("__reactProps")));
await desktop.locator("input[role=combobox]").first().click();
await desktop.keyboard.type("chicago");
await desktop.waitForSelector("[role=option]");
await shot(desktop, "1-search", { clip: { x: 0, y: 0, width: 1280, height: 520 } });

// 2. A high-risk trip: the verdict, the tiles opened, the nearby airports.
await desktop.goto(trip("BOS", "LAX"));
await settle(desktop);
await desktop.evaluate(() => document.querySelectorAll("[aria-label=Verdict] details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
await desktop.waitForTimeout(600); // let the chevrons finish turning
await shot(desktop, "2-high-risk", { clip: await around(desktop, "[aria-label=Verdict]"), fullPage: true });

// 3. What to do: the checklist, with the first step ticked.
await desktop.locator("section[aria-labelledby=do] label").first().click();
await shot(desktop, "3-checklist", { clip: await around(desktop, "section[aria-labelledby=do]"), fullPage: true });

// 4. The evidence: every fact, its source, and what was looked at but not counted.
await desktop.evaluate(() => { const e = document.getElementById("evidence") as HTMLDetailsElement | null; if (e) e.open = true; });
await desktop.waitForTimeout(600);
await shot(desktop, "4-evidence", { clip: await around(desktop, "#evidence"), fullPage: true });

// 5. A quiet trip, for contrast.
await desktop.goto(trip("ORD", "DEN"));
await settle(desktop);
await shot(desktop, "5-low-risk", { clip: await around(desktop, "[aria-label=Verdict]"), fullPage: true });

// 6. On a phone.
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await phone.goto(trip("BOS", "LAX"));
await settle(phone);
await shot(phone, "6-mobile");

await browser.close();
