// Small free models write markdown even when told not to. This turns their text into a few
// well-formed blocks the page can render: paragraphs and lists, with **bold** kept.
// Pure and tested; nothing here is ever injected as HTML.

export type Inline = { text: string; bold?: boolean };
export type Block = { kind: "p"; parts: Inline[] } | { kind: "ul" | "ol"; items: Inline[][] };

const BULLET = /^\s*(?:[-*•]|(\d+)[.)])\s+/;

/** "**a** b *c*" → [{a, bold}, {" b c"}]. Single * or _ emphasis is dropped, not shown raw. */
export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  s.split(/(\*\*[^*]+\*\*|__[^_]+__)/g).forEach((p) => {
    if (!p) return;
    const bold = /^(\*\*|__)(.+)\1$/.exec(p);
    const text = (bold ? bold[2] : p).replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, "$1$2").replace(/`([^`]+)`/g, "$1");
    out.push(bold ? { text, bold: true } : { text });
  });
  return out;
}

export function blocks(raw: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) out.push({ kind: "p", parts: inline(para.join(" ")) }); para = []; };
  for (const line of raw.replace(/\r/g, "").split("\n")) {
    const t = line.trim();
    if (!t || /^([-*_])\1{2,}$/.test(t)) { flush(); continue; }
    const heading = /^#{1,6}\s+(.*)$/.exec(t);
    if (heading) { flush(); out.push({ kind: "p", parts: [{ text: heading[1].replace(/[*_#]+/g, "").trim(), bold: true }] }); continue; }
    const b = BULLET.exec(line);
    if (b) {
      flush();
      const kind = b[1] ? "ol" : "ul";
      const last = out.at(-1);
      const item = inline(line.replace(BULLET, "").trim());
      if (last && last.kind === kind) last.items.push(item); else out.push({ kind, items: [item] });
      continue;
    }
    para.push(t);
  }
  flush();
  return out;
}

/** One line of plain text for a JSON field: no markdown marks, no bullets, single spaces. */
export const plain = (s: string) =>
  inline(String(s).replace(BULLET, "").replace(/^#+\s*/, "")).map((p) => p.text).join("").replace(/\s+/g, " ").trim();

/** The first {...} in a reply, fences and chatter around it ignored. */
export function jsonIn(s: string): unknown {
  const t = s.replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON object in the reply");
  return JSON.parse(t.slice(a, b + 1));
}
