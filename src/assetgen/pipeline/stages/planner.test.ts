// P5-1: planner produces a valid plan — screens from the template, assetKeys
// from the style's source assets.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { plannerStage } from "./planner.js";
import { PlanSchema } from "../types.js";
import type { Envelope, RunContext } from "../types.js";

let base: string;
const ctx: RunContext = { runId: "t", runDir: "t" };
const env = (style: string): Envelope => ({
  runId: "t", createdAt: "2026-06-03T00:00:00.000Z",
  brief: { style }, assets: [], font: { family: "Cinzel", path: "x.woff2" },
});

before(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "planner-test-"));
  const dir = path.join(base, "s1");
  await fs.mkdir(dir, { recursive: true });
  for (const f of ["bg.png", "hero.png", "btn-frame.png"]) await fs.writeFile(path.join(dir, f), "x");
});
after(async () => { await fs.rm(base, { recursive: true, force: true }); });

describe("plannerStage", () => {
  it("screens come from the template, assetKeys from disk; plan is schema-valid", async () => {
    const out = await plannerStage("endcard", { baseDir: base }).run(env("s1"), ctx);
    assert.ok(out.plan);
    PlanSchema.parse(out.plan); // throws if invalid
    assert.deepEqual(out.plan!.screens.map((s) => s.id), ["endcard"]);
    assert.deepEqual(out.plan!.assetKeys, ["bg", "btn-frame", "hero"]); // sorted
  });

  it("multi-screen template (showcase) plans all its screens", async () => {
    const out = await plannerStage("showcase", { baseDir: base }).run(env("s1"), ctx);
    assert.equal(out.plan!.screens.length, 10);
  });
});
