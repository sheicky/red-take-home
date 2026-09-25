// The product runs on live data only. Captured and invented payloads exist for tests, and this
// test fails the build if application code ever imports them.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(__dirname, "..");
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? files(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });

describe("test data boundary", () => {
  it("no application file imports the test providers or the fixtures", () => {
    const app = files(SRC).filter((f) => !f.includes(`${path.sep}test${path.sep}`) && !/\.test\.tsx?$/.test(f));
    expect(app.length).toBeGreaterThan(10);
    const leaks = app.filter((f) => /@\/test\/|\/test\/providers|fixtures/.test(fs.readFileSync(f, "utf8")));
    expect(leaks).toEqual([]);
  });
});
