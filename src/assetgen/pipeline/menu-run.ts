// Pipeline-backed menu build (P2-3). Runs assetgen → build → validate through
// the orchestrator, producing the SAME playable as a direct build, plus a full
// run record (run.json + envelope.json) under out/runs/<id>/.
//
//   tsx src/assetgen/pipeline/menu-run.ts <style> <layout>
//
// CHECKPOINT C: the produced HTML is byte-identical to `npm run menu` output.

import { writeFileSync, mkdirSync } from "node:fs";
import { makeRunId, runDirOf, readEnvelope } from "./runDir.js";
import { runStages } from "./runner.js";
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

export async function buildMenuViaPipeline(style: string, layout: string): Promise<MenuRunResult> {
  const runId = makeRunId();
  const runDir = runDirOf("out/runs", runId);
  const envelope: Envelope = {
    runId,
    createdAt: new Date().toISOString(),
    brief: { style },
    assets: [],
    font: { family: "Cinzel", path: "src/assetgen/kit/cinzel-700.woff2" },
  };
  const state = await runStages(
    { runId, runDir },
    [assetgenStage(), buildStage({ layout }), validateStage],
    { envelope, style },
  );
  const env = await readEnvelope(runDir);
  return {
    runId,
    runDir,
    htmlPath: env?.build?.htmlPath,
    status: state.status,
    validationOk: env?.validation?.ok,
  };
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
