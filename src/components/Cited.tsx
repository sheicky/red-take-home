"use client";

const openEvidence = () => { const d = document.getElementById("evidence") as HTMLDetailsElement | null; if (d) d.open = true; };

/**
 * "[E3]" or "[E3, E4]" becomes quiet links to the evidence. With `known`, an id that is not in
 * the assessment is shown as unverified instead of silently linking nowhere.
 */
export function Cited({ text, known }: { text: string; known?: string[] }) {
  return (
    <>
      {text.split(/(\s?\[E\d+(?:,\s*E\d+)*\])/g).map((p, i) => {
        const ids = /^\s?\[(E\d+(?:,\s*E\d+)*)\]$/.exec(p)?.[1].split(/,\s*/);
        if (!ids) return <span key={i}>{p}</span>;
        return (
          <span key={i} className="whitespace-nowrap">
            {ids.map((id) =>
              known && !known.includes(id) ? (
                <span key={id} className="ml-1.5 text-[12px] font-medium" style={{ color: "var(--severe)" }} title="Not in this assessment">{id} unverified</span>
              ) : (
                <a key={id} href={`#${id}`} onClick={openEvidence} className="ml-1.5 text-[12px] text-[var(--gris)] underline hover:text-[var(--noir)]">{id}</a>
              ),
            )}
          </span>
        );
      })}
    </>
  );
}
