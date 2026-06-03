// CHECKPOINT B demo — run the orchestrator with real on-disk artifacts so you
// can SEE run.json + resume with your own eyes (until the real CLI lands in Phase 3).
//
//   npm run pipeline:demo            # fresh run -> pauses at the gate (needs-approval)
//   npm run pipeline:demo <runId>    # resume   -> finishes; done stages are NOT re-run
//
// Watch: out/runs/<runId>/run.json (state machine) and trace.log (proves each
// stage ran exactly once across the pause/resume).

import { promises as fs } from "node:fs";
import path from "node:path";
import { makeRunId, runDirOf, readRunState } from "./runDir.js";
import { runStages, type EnvelopeStage } from "./runner.js";
import { validateStage } from "./stages/validate.js";
import { assetgenStage } from "./stages/assetgen.js";
import type { Envelope } from "./types.js";

const BASE = "out/runs";

async function trace(runDir: string, line: string): Promise<void> {
  await fs.appendFile(path.join(runDir, "trace.log"), line + "\n", "utf8");
}

// Stage 1: REAL assetgen (P2-1) — reads out/<style>/ and emits envelope.assets[].
// Wrapped with gate:true so the orchestrator pauses AFTER it (future cost-preview).
const realAssetgen = assetgenStage();
const assetgenStub: EnvelopeStage = {
  name: "assetgen",
  gate: true,
  async run(env, ctx) {
    const out = await realAssetgen.run(env, ctx);
    await trace(ctx.runDir, `assetgen ran @ ${ctx.runId} → ${out.assets.length} assets`);
    return out;
  },
};

// Stage 2: pretend to build — write a tiny valid playable into the run dir and
// point envelope.build at it (this is what the real builder will do in Phase 2).
const buildStub: EnvelopeStage = {
  name: "build",
  async run(env, ctx) {
    await trace(ctx.runDir, "build ran");
    const html =
      `<!doctype html><html><script>window.FbPlayableAd={onCTAClick:function(){}};` +
      `function cta(){window.FbPlayableAd.onCTAClick();}</script><body>demo</body></html>`;
    const htmlPath = path.join(ctx.runDir, "playable.html");
    await fs.writeFile(htmlPath, html, "utf8");
    return { ...env, build: { htmlPath, bytes: Buffer.byteLength(html, "utf8") } };
  },
};

// Stage 3: the REAL validate stage.
const stages: EnvelopeStage[] = [assetgenStub, buildStub, validateStage];

async function main() {
  const arg = process.argv[2];
  const runId = arg ?? makeRunId();
  const runDir = runDirOf(BASE, runId);
  const resuming = Boolean(arg);

  const seed = resuming
    ? null
    : {
        style: "cyber-heist",
        envelope: {
          runId,
          createdAt: new Date().toISOString(),
          brief: { style: "cyber-heist" },
          assets: [],
          font: { family: "Cinzel", path: "src/assetgen/kit/cinzel-700.woff2" },
        } as Envelope,
      };

  console.log(`\n${resuming ? "RESUME" : "FRESH"} run: ${runId}`);
  const state = await runStages({ runId, runDir }, stages, seed);

  const persisted = await readRunState(runDir);
  console.log(`status: ${state.status}`);
  console.log(`stages: ${persisted?.stages.map((s) => `${s.name}=${s.status}`).join(", ")}`);
  console.log(`run.json -> ${path.join(runDir, "run.json")}`);
  const traceTxt = await fs.readFile(path.join(runDir, "trace.log"), "utf8").catch(() => "(none)");
  console.log(`trace.log:\n${traceTxt.trim()}`);
  if (state.status === "needs-approval") {
    console.log(`\n⏸  paused at gate. resume with:  npm run pipeline:demo ${runId}`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exit(1);
});
