// Pipeline CLI (Phase 3). Three commands over the orchestrator:
//
//   pipeline run <style> [layout]   — fresh run (assetgen → build → validate)
//   pipeline resume <runId>         — continue a run (skips done stages)
//   pipeline inspect <runId>        — show run.json + envelope summary
//
// Wired as `npm run pipeline -- <cmd> ...`. CHECKPOINT D: you run all three.

import { buildMenuViaPipeline, resumeMenuRun, type MenuRunResult } from "./menu-run.js";
import { readRunState, readEnvelope, runDirOf } from "./runDir.js";

const G = "\x1b[32m", Y = "\x1b[33m", R = "\x1b[31m", DIM = "\x1b[90m", X = "\x1b[0m";

function printResult(r: MenuRunResult): void {
  const col = r.status === "done" ? G : r.status === "failed" ? R : Y;
  console.log(`run ${r.runId}`);
  console.log(`  status:     ${col}${r.status}${X}`);
  console.log(`  validation: ${r.validationOk === true ? G + "ok" + X : r.validationOk === false ? R + "FAIL" + X : DIM + "—" + X}`);
  console.log(`  playable:   ${r.htmlPath ?? DIM + "—" + X}`);
  console.log(`  runDir:     ${r.runDir}`);
}

async function cmdInspect(runId: string): Promise<void> {
  const runDir = runDirOf("out/runs", runId);
  const state = await readRunState(runDir);
  if (!state) {
    console.error(`${R}inspect:${X} no run.json for "${runId}" (looked in ${runDir})`);
    process.exit(1);
  }
  const env = await readEnvelope(runDir);
  console.log(`run ${state.runId}  ${DIM}(${state.style})${X}  status=${state.status}`);
  console.log("stages:");
  for (const s of state.stages) {
    const col = s.status === "done" ? G : s.status === "failed" ? R : s.status === "running" ? Y : DIM;
    const span = s.startedAt && s.endedAt ? ` ${DIM}${s.startedAt}→${s.endedAt}${X}` : "";
    console.log(`  ${col}●${X} ${s.name.padEnd(10)} ${col}${s.status}${X}${span}${s.error ? ` ${R}${s.error}${X}` : ""}`);
  }
  if (env) {
    console.log(`envelope: ${env.assets.length} assets · build=${env.build ? env.build.bytes + "b" : "—"} · validation=${env.validation ? (env.validation.ok ? "ok" : "FAIL") : "—"}`);
  }
}

function usage(): void {
  console.log(`pipeline — orchestrated playable runs

  pipeline run <style> [layout]   fresh run (default layout: menu5)
  pipeline resume <runId>         continue a run (skips done stages)
  pipeline inspect <runId>        show run.json + envelope summary`);
}

async function main(): Promise<void> {
  const [cmd, a1, a2] = process.argv.slice(2);
  switch (cmd) {
    case "run": {
      if (!a1) return fail("run needs a <style>");
      printResult(await buildMenuViaPipeline(a1, a2 ?? "menu5"));
      return;
    }
    case "resume": {
      if (!a1) return fail("resume needs a <runId>");
      printResult(await resumeMenuRun(a1));
      return;
    }
    case "inspect": {
      if (!a1) return fail("inspect needs a <runId>");
      return cmdInspect(a1);
    }
    default:
      usage();
  }
}

function fail(msg: string): void {
  console.error(`${R}error:${X} ${msg}\n`);
  usage();
  process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exit(1);
});
