// Pipeline-backed menu build (P2-3). Runs assetgen → build → validate through
// the orchestrator, producing the SAME playable as a direct build, plus a full
// run record (run.json + envelope.json) under out/runs/<id>/.
//
//   tsx src/assetgen/pipeline/menu-run.ts <style> <layout>
//
// CHECKPOINT C: the produced HTML is byte-identical to `npm run menu` output.

import { writeFileSync, mkdirSync } from "node:fs";
import { makeRunId, runDirOf, readEnvelope } from "./runDir.js";
import { runStages, type EnvelopeStage } from "./runner.js";
import { assetgenStage } from "./stages/assetgen.js";
import { buildStage } from "./stages/build.js";
import { validateStage } from "./stages/validate.js";
import type { Envelope } from "./types.js";

export interface MenuRunResult {
  runId: string;
  runDir: string;
  htmlPath: string | undefined;
  status: string;
  validationOk: boolean | undefined;
}

// The menu pipeline = describe assets → build → validate. Shared by run + resume
// so a resumed run uses the exact same stage list (skipping the done ones).
function menuStages(layout: string): EnvelopeStage[] {
  return [assetgenStage(), buildStage({ layout }), validateStage];
}

function result(runId: string, runDir: string, status: string, env: Envelope | null): MenuRunResult {
  return { runId, runDir, status, htmlPath: env?.build?.htmlPath, validationOk: env?.validation?.ok };
}

export async function buildMenuViaPipeline(style: string, layout: string): Promise<MenuRunResult> {
  const runId = makeRunId();
  const runDir = runDirOf("out/runs", runId);
  const envelope: Envelope = {
    runId,
    createdAt: new Date().toISOString(),
    // layout rides in the brief (BriefSchema.passthrough) so resume can rebuild stages.
    brief: { style, layout },
    assets: [],
    font: { family: "Cinzel", path: "src/assetgen/kit/cinzel-700.woff2" },
  };
  const state = await runStages({ runId, runDir }, menuStages(layout), { envelope, style });
  return result(runId, runDir, state.status, await readEnvelope(runDir));
}

// Resume an existing run: read its envelope for the layout, rebuild the same
// stages, continue (done stages are skipped by the orchestrator).
export async function resumeMenuRun(runId: string): Promise<MenuRunResult> {
  const runDir = runDirOf("out/runs", runId);
  const env = await readEnvelope(runDir);
  if (!env) throw new Error(`resume: no envelope.json in ${runDir} (unknown runId "${runId}")`);
  const layout = String((env.brief as Record<string, unknown>).layout ?? "menu5");
  const state = await runStages({ runId, runDir }, menuStages(layout), null);
  return result(runId, runDir, state.status, await readEnvelope(runDir));
}

async function main() {
  const style = process.argv[2] ?? "cyber-heist";
  const layout = process.argv[3] ?? "menu5";
  const r = await buildMenuViaPipeline(style, layout);
  console.log(`run ${r.runId} · status=${r.status} · validation.ok=${r.validationOk}`);
  console.log(`playable -> ${r.htmlPath}`);
  // also drop a copy at OUT for parity with `npm run menu`
  if (r.htmlPath) {
    const { readFileSync } = await import("node:fs");
    mkdirSync("test/menu-playable", { recursive: true });
    writeFileSync("test/menu-playable/index.html", readFileSync(r.htmlPath));
  }
}

const invoked = process.argv[1]?.endsWith("menu-run.ts") || process.argv[1]?.endsWith("menu-run.js");
if (invoked) main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
