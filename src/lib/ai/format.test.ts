import { describe, expect, it } from "vitest";
import { blocks, jsonIn, plain } from "./format";

describe("blocks: model markdown in, well-formed blocks out", () => {
  it("keeps paragraphs apart and joins wrapped lines", () => {
    expect(blocks("Gusts at BOS [E1].\nThey peak at noon.\n\nCheck again tonight.")).toEqual([
      { kind: "p", parts: [{ text: "Gusts at BOS [E1]. They peak at noon." }] },
      { kind: "p", parts: [{ text: "Check again tonight." }] },
    ]);
  });

  it("turns dash, star and numbered lines into lists", () => {
    expect(blocks("Do this:\n- Call the traveler.\n* Check the airline app.\n\n1. First\n2) Second")).toEqual([
      { kind: "p", parts: [{ text: "Do this:" }] },
      { kind: "ul", items: [[{ text: "Call the traveler." }], [{ text: "Check the airline app." }]] },
      { kind: "ol", items: [[{ text: "First" }], [{ text: "Second" }]] },
    ]);
  });

  it("keeps bold, drops single-star emphasis, code ticks, headings marks and rules", () => {
    expect(blocks("## Why **High**\n---\nThe *wind* at `BOS`.")).toEqual([
      { kind: "p", parts: [{ text: "Why High", bold: true }] },
      { kind: "p", parts: [{ text: "The wind at BOS." }] },
    ]);
    expect(blocks("It is **very** windy.")[0]).toEqual({ kind: "p", parts: [{ text: "It is " }, { text: "very", bold: true }, { text: " windy." }] });
  });

  it("leaves citations and plain text alone", () => {
    expect(blocks("Gusts of 45 kt (52 mph) [E1, E2].")).toEqual([{ kind: "p", parts: [{ text: "Gusts of 45 kt (52 mph) [E1, E2]." }] }]);
  });
});

describe("plain and jsonIn", () => {
  it("strips marks and bullets from a JSON string field", () => {
    expect(plain("- **Call** the  traveler.")).toBe("Call the traveler.");
  });
  it("finds the object inside a fence or chatter", () => {
    expect(jsonIn('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => jsonIn("no json here")).toThrow();
  });
});
