// P4-3: estimateCost counts cached source PNGs and prices a full regen.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { estimateCost, PER_IMAGE_USD } from "./cost-preview.js";

let base: string;
before(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "cost-test-"));
  const dir = path.join(base, "styleA");
  await fs.mkdir(dir, { recursive: true });
  for (const f of ["a.png", "b.png", "c.png", "notes.txt"]) await fs.writeFile(path.join(dir, f), "x");
});
after(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

describe("estimateCost", () => {
  it("counts only .png as cached assets and prices full regen", () => {
    const c = estimateCost("styleA", base);
    assert.equal(c.cachedAssets, 3); // notes.txt ignored
    assert.equal(c.chargeNowUsd, 0); // menu reuses cached → no charge now
    assert.equal(c.fullRegenUsd, +(3 * PER_IMAGE_USD).toFixed(2));
  });

  it("returns 0 cached for a missing style dir", () => {
    const c = estimateCost("nope", base);
    assert.equal(c.cachedAssets, 0);
    assert.equal(c.fullRegenUsd, 0);
  });
});
