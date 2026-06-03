// AC for Phase 1 (P1-1..P1-3):
//   - runStages runs stages in order and persists run.json + envelope after each
//   - RESUME skips stages already "done" (no re-run)
//   - a gate stage pauses the run with status "needs-approval"
//   - a throwing stage marks itself "failed" + run "failed" and stops the rest
//   - validateStage wraps the Meta validator as a Stage (AC1.1)
//
// Hermetic: everything under os.tmpdir(). Deterministic clock injected.

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runStages, type EnvelopeStage, type RunSeed } from "./runner.js";
import { readRunState, readEnvelope } from "./runDir.js";
import { validateStage } from "./stages/validate.js";
import type { Envelope, RunContext } from "./types.js";

const CLOCK = () => "2026-06-02T00:00:00.000Z";

function makeEnvelope(): Envelope {
  return {
    runId: "test-run",
    createdAt: CLOCK(),
    brief: { style: "cyber-heist" },
    assets: [],
    font: { family: "Cinzel", path: "src/assetgen/kit/cinzel-700.woff2" },
  };
}

// A stage that records its name into `ran` and tags the envelope's brief.
function recStage(name: string, ran: string[], gate = false): EnvelopeStage {
  return {
    name,
    gate,
    async run(env) {
      ran.push(name);
      return { ...env, brief: { ...env.brief, [`saw_${name}`]: true } };
    },
  };
}

let tmpBase: string;
before(async () => {
  tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "runner-test-"));
});
after(async () => {
  await fs.rm(tmpBase, { recursive: true, force: true });
});

let runDir: string;
let ctx: RunContext;
let seedNum = 0;
beforeEach(async () => {
  runDir = path.join(tmpBase, `run-${seedNum++}`);
  ctx = { runId: path.basename(runDir), runDir };
});

const seed = (): RunSeed => ({ envelope: makeEnvelope(), style: "cyber-heist" });

describe("runStages", () => {
  it("runs all stages in order, status done, persists state + envelope", async () => {
    const ran: string[] = [];
    const stages = [recStage("a", ran), recStage("b", ran), recStage("c", ran)];

    const state = await runStages(ctx, stages, seed(), { clock: CLOCK });

    assert.deepEqual(ran, ["a", "b", "c"]);
    assert.equal(state.status, "done");
    assert.deepEqual(state.stages.map((s) => s.status), ["done", "done", "done"]);

    const persisted = await readRunState(runDir);
    assert.equal(persisted?.status, "done");
    const env = await readEnvelope(runDir);
    assert.equal((env?.brief as Record<string, unknown>).saw_c, true);
  });

  it("RESUME skips stages already done (gate pause then resume)", async () => {
    const ran: string[] = [];
    const stages = [recStage("a", ran, true /* gate */), recStage("b", ran)];

    // first pass: 'a' runs, gate pauses before 'b'
    const first = await runStages(ctx, stages, seed(), { clock: CLOCK });
    assert.equal(first.status, "needs-approval");
    assert.deepEqual(ran, ["a"]);
    assert.deepEqual(first.stages.map((s) => s.status), ["done", "todo"]);

    // resume (seed=null): 'a' is skipped, 'b' runs
    const second = await runStages(ctx, stages, null, { clock: CLOCK });
    assert.equal(second.status, "done");
    assert.deepEqual(ran, ["a", "b"]); // 'a' ran exactly once
    assert.deepEqual(second.stages.map((s) => s.status), ["done", "done"]);
  });

  it("a throwing stage → that stage failed, run failed, later stages not run", async () => {
    const ran: string[] = [];
    const boom: EnvelopeStage = {
      name: "boom",
      async run() {
        throw new Error("kaboom");
      },
    };
    const stages = [recStage("a", ran), boom, recStage("c", ran)];

    const state = await runStages(ctx, stages, seed(), { clock: CLOCK });

    assert.equal(state.status, "failed");
    assert.deepEqual(ran, ["a"]); // 'c' never ran
    assert.deepEqual(state.stages.map((s) => s.status), ["done", "failed", "todo"]);
    assert.match(state.stages[1].error ?? "", /kaboom/);
  });

  it("throws when resuming with no prior run and no seed", async () => {
    await assert.rejects(() => runStages(ctx, [recStage("a", [])], null), /no run\.json/i);
  });
});

describe("validateStage", () => {
  it("ok=true for a compliant playable", async () => {
    const html = `<html><script>window.FbPlayableAd={onCTAClick:function(){}};function cta(){window.FbPlayableAd.onCTAClick();}</script><body>hi</body></html>`;
    const htmlPath = path.join(runDir, "good.html");
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(htmlPath, html, "utf8");

    const env: Envelope = { ...makeEnvelope(), build: { htmlPath, bytes: Buffer.byteLength(html) } };
    const out = await validateStage.run(env, ctx);
    assert.equal(out.validation?.ok, true);
  });

  it("ok=false when the CTA hook is missing", async () => {
    const html = `<html><body>no cta hook here</body></html>`;
    const htmlPath = path.join(runDir, "bad.html");
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(htmlPath, html, "utf8");

    const env: Envelope = { ...makeEnvelope(), build: { htmlPath, bytes: Buffer.byteLength(html) } };
    const out = await validateStage.run(env, ctx);
    assert.equal(out.validation?.ok, false);
  });

  it("throws when build.htmlPath is missing", async () => {
    await assert.rejects(() => validateStage.run(makeEnvelope(), ctx), /build\.htmlPath/);
  });
});
