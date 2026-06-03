// Pipeline CLI (Phase 3). Three commands over the orchestrator:
//
//   pipeline run <style> [layout]   — fresh run (assetgen → build → validate)
//   pipeline resume <runId>         — continue a run (skips done stages)
//   pipeline inspect <runId>        — show run.json + envelope summary
//
// Wired as `npm run pipeline -- <cmd> ...`. CHECKPOINT D: you run all three.

import { readFileSync } from "node:fs";
import path from "node:path";
import { buildMenuViaPipeline, resumeMenuRun, type MenuRunResult } from "./menu-run.js";
import { readRunState, readEnvelope, writeEnvelope, runDirOf } from "./runDir.js";
import { addScreen, rmScreen, addAsset, rmAsset } from "./plan-edit.js";

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
    console.log(`  ${col}●${X} ${s.name.padEnd(12)} ${col}${s.status}${X}${span}${s.error ? ` ${R}${s.error}${X}` : ""}`);
  }
  if (env?.plan) {
    console.log(`plan: ${env.plan.screens.length} screens [${env.plan.screens.map((s) => s.id).join(", ")}] · ${env.plan.assetKeys.length} assetKeys`);
  }
  if (env) {
    console.log(`envelope: ${env.assets.length} assets · build=${env.build ? env.build.bytes + "b" : "—"} · validation=${env.validation ? (env.validation.ok ? "ok" : "FAIL") : "—"}`);
  }
  try {
    const cost = JSON.parse(readFileSync(path.join(runDir, "cost.json"), "utf8"));
    console.log(`cost: charge now $${cost.chargeNowUsd?.toFixed(2)} · full regen ≈ $${cost.fullRegenUsd?.toFixed(2)} (${cost.cachedAssets} cached)`);
  } catch {
    /* no cost gate on this run */
  }
  if (state.status === "needs-approval") {
    console.log(`${Y}⏸  awaiting approval — run: pipeline approve ${state.runId}${X}`);
  }
}

// epic C — review/edit the plan BEFORE asset-gen (planner gate must have run).
async function cmdPlan(sub: string, runId: string, arg: string): Promise<void> {
  if (!runId) return fail("plan needs a <runId>");
  const runDir = runDirOf("out/runs", runId);
  const env = await readEnvelope(runDir);
  if (!env) return fail(`no envelope for "${runId}"`);
  if (!env.plan) return fail(`run "${runId}" has no plan — run with --plan`);

  const showPlan = () =>
    console.log(`plan: ${env.plan!.screens.length} screens [${env.plan!.screens.map((s) => s.id).join(", ")}] · ${env.plan!.assetKeys.length} assetKeys [${env.plan!.assetKeys.join(", ")}]`);

  if (sub === "show") return showPlan();

  if (!arg) return fail(`plan ${sub} needs an argument`);
  switch (sub) {
    case "add-screen": env.plan = addScreen(env.plan, arg); break;
    case "rm-screen": env.plan = rmScreen(env.plan, arg); break;
    case "add-asset": env.plan = addAsset(env.plan, arg); break;
    case "rm-asset": env.plan = rmAsset(env.plan, arg); break;
    default: return fail(`unknown plan subcommand "${sub}" (show|add-screen|rm-screen|add-asset|rm-asset)`);
  }
  await writeEnvelope(runDir, env);
  console.log(`${G}✓ plan updated${X} ${DIM}(no regeneration)${X}`);
  showPlan();
}

function usage(): void {
  console.log(`pipeline — orchestrated playable runs

  pipeline run <style> [layout] [--plan] [--gate]   --plan = plan-review pause, --gate = cost pause
  pipeline plan show|add-screen|rm-screen|add-asset|rm-asset <runId> [arg]   review/edit plan before asset-gen
  pipeline approve <runId>                 approve a gated (needs-approval) run → continue
  pipeline resume <runId>                  continue a run (skips done stages)
  pipeline inspect <runId>                 show run.json + envelope + cost summary`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const gate = args.includes("--gate");
  const plan = args.includes("--plan");
  const [cmd, a1, a2, a3] = args.filter((a) => !a.startsWith("--"));
  switch (cmd) {
    case "run": {
      if (!a1) return fail("run needs a <style>");
      printResult(await buildMenuViaPipeline(a1, a2 ?? "menu5", { gate, plan }));
      return;
    }
    case "plan":
      return cmdPlan(a1, a2, a3);
    case "approve":
    case "resume": {
      if (!a1) return fail(`${cmd} needs a <runId>`);
      if (cmd === "approve") console.log(`${G}✅ approved${X} — continuing run ${a1}`);
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
