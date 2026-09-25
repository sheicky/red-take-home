// Draws docs/system-design.svg in the Excalidraw style: rough.js strokes, the Virgil font.
// The font is embedded in the SVG, so GitHub shows it as drawn. Run: bun run diagram

import rough from "roughjs";
import { writeFileSync } from "node:fs";

const FONT_URL = "https://cdn.jsdelivr.net/npm/@excalidraw/excalidraw@0.18.0/dist/prod/fonts/Virgil/Virgil-Regular.woff2";
const W = 1200, H = 880;
const INK = "#1e1e1e";
const C = { yellow: "#ffec99", blue: "#a5d8ff", green: "#b2f2bb", violet: "#d0bfff", red: "#ffc9c9", gray: "#e9ecef", teal: "#96f2d7" };

const gen = rough.generator();
let seed = 7;
const opts = (o: Record<string, unknown> = {}) => ({ seed: seed++, roughness: 1.3, bowing: 1.2, stroke: INK, strokeWidth: 1.6, ...o });
const out: string[] = [];

function draw(d: ReturnType<typeof gen.rectangle>, dash = "") {
  for (const p of gen.toPaths(d)) {
    out.push(`<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill ?? "none"}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`);
  }
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function text(x: number, y: number, lines: string | string[], size = 20, anchor = "middle", color = INK) {
  const ls = Array.isArray(lines) ? lines : [lines];
  const lh = size * 1.25;
  const y0 = y - ((ls.length - 1) * lh) / 2;
  out.push(`<text x="${x}" y="${y0}" font-size="${size}" text-anchor="${anchor}" dominant-baseline="middle" fill="${color}">${ls
    .map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join("")}</text>`);
}
function box(x: number, y: number, w: number, h: number, fill: string, label: string[] , size = 20) {
  draw(gen.rectangle(x, y, w, h, opts({ fill, fillStyle: "hachure", hachureGap: 7, fillWeight: 1.2 })));
  text(x + w / 2, y + h / 2, label, size);
}
function frame(x: number, y: number, w: number, h: number, label: string) {
  draw(gen.rectangle(x, y, w, h, opts({ strokeWidth: 1.4, roughness: 0.8 })), "10 8");
  text(x + 18, y + 24, label, 18, "start", "#495057");
}
/** A label on a white patch, so lines passing under it stay readable. */
function label(x: number, y: number, lines: string | string[], size = 17) {
  const ls = Array.isArray(lines) ? lines : [lines];
  const w = Math.max(...ls.map((l) => l.length)) * size * 0.55 + 14, h = ls.length * size * 1.25 + 6;
  out.push(`<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="6" fill="#ffffff"/>`);
  text(x, y, ls, size, "middle", "#495057");
}
/** A hand-drawn arrow along a gentle curve, with its head and an optional label. */
function arrow(x1: number, y1: number, x2: number, y2: number, label?: string, bend = 0, lx = 0, ly = 0) {
  const mx = (x1 + x2) / 2 + bend, my = (y1 + y2) / 2;
  draw(gen.curve([[x1, y1], [mx, my], [x2, y2]], opts({ roughness: 0.9 })));
  const a = Math.atan2(y2 - my, x2 - mx);
  for (const s of [-1, 1]) {
    const t = a + Math.PI + s * 0.45;
    draw(gen.line(x2, y2, x2 + 16 * Math.cos(t), y2 + 16 * Math.sin(t), opts({ roughness: 0.6 })));
  }
  if (label) text(mx + lx, my + ly, label, 17, "middle", "#495057");
}

// ── Title
text(40, 44, "Trip check: how one check works", 30, "start");

// ── The user
draw(gen.ellipse(600, 120, 300, 80, opts({ fill: C.yellow, fillStyle: "hachure", hachureGap: 7 })));
text(600, 120, ["Ops agent", "in the browser"], 20);

// ── Server
frame(40, 230, 1120, 290, "Next.js server");
box(90, 290, 250, 80, C.blue, ["Page + assess API", "streams with Suspense"]);
box(420, 290, 300, 80, C.gray, ["Cache", "5 min per trip, shared"], 19);
box(840, 290, 300, 80, C.blue, ["Chat API", "one trip, one assessment"], 19);
box(90, 410, 250, 80, C.green, ["Rules engine", "decides the level"]);
box(420, 410, 300, 80, C.violet, ["Message writer", "checks JSON, citations, level"], 19);

// ── Data
frame(40, 590, 640, 250, "Public data, fetched live");
box(70, 640, 280, 70, C.teal, ["FAA airport status"], 19);
box(370, 640, 280, 70, C.teal, ["Airport forecasts", "TAF and METAR"], 19);
box(70, 740, 280, 70, C.teal, ["Weather service", "forecast and alerts"], 19);
box(370, 740, 280, 70, C.gray, ["On-time history", "bundled file"], 19);

// ── Model
box(820, 660, 300, 100, C.red, ["OpenRouter", "Gemma 4 31B (free)"], 21);
text(970, 810, ["Rules set the level.", "The model only writes words."], 18, "middle", "#e03131");

// ── Arrows, then their labels on top
arrow(500, 152, 215, 288, undefined, -60);
arrow(700, 152, 990, 288, undefined, 60);
arrow(340, 330, 418, 330);
arrow(215, 372, 215, 408);
arrow(215, 492, 215, 588);
arrow(300, 372, 470, 408, undefined, 30);
arrow(640, 492, 870, 658, undefined, -20);
arrow(990, 372, 985, 658, undefined, 40);
label(300, 196, "route + date");
label(905, 196, "question");
label(262, 540, "reads");
label(420, 390, "assessment");
label(810, 560, "draft, 1 retry");
label(1085, 580, ["assessment", "+ question"]);

const font = Buffer.from(await (await fetch(FONT_URL)).arrayBuffer()).toString("base64");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Virgil, 'Comic Sans MS', cursive">
<defs><style>@font-face { font-family: Virgil; src: url(data:font/woff2;base64,${font}) format("woff2"); }</style></defs>
<rect width="${W}" height="${H}" rx="18" fill="#ffffff"/>
${out.join("\n")}
</svg>
`;
writeFileSync("docs/system-design.svg", svg);
console.log(`docs/system-design.svg (${Math.round(svg.length / 1024)} KB)`);
