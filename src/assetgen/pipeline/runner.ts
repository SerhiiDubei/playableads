// Orchestrator (Phase 1). Runs an ordered list of stages over an Envelope,
// persisting RunState (run.json) + Envelope (envelope.json) after EACH stage.
//
// Capabilities:
//   - fresh start (seed) or RESUME (skip stages already "done")
//   - gate stages pause the run with status "needs-approval" (user resumes)
//   - a throwing stage marks that stage "failed" + run "failed" and stops
//
// run.json is the source of truth for resume: on re-entry we read it and skip
// every stage already marked "done". See build-plan.md Phase 1 (CHECKPOINT B).

import {
  type Envelope,
  type RunState,
  type RunContext,
  type Stage,
} from "./types.js";
import {
  ensureRunDir,
  readRunState,
  writeRunState,
  readEnvelope,
  writeEnvelope,
} from "./runDir.js";

export type EnvelopeStage = Stage<Envelope, Envelope>;

export interface RunSeed {
  envelope: Envelope;
  style: string;
}

export interface RunOptions {
  /** ISO-timestamp source; injectable so tests stay deterministic. */
  clock?: () => string;
}

const nowIso = (): string => new Date().toISOString();

/**
 * Run `stages` in order. If run.json + envelope.json already exist in
 * `ctx.runDir` → RESUME (done stages are skipped); otherwise start fresh
 * (requires `seed`). Persists state after every transition. Returns the final
 * RunState (status: done | needs-approval | failed).
 */
export async function runStages(
  ctx: RunContext,
  stages: EnvelopeStage[],
  seed: RunSeed | null,
  opts: RunOptions = {},
): Promise<RunState> {
  const clock = opts.clock ?? nowIso;
  await ensureRunDir(ctx.runDir);

  let state = await readRunState(ctx.runDir);
  let envelope = await readEnvelope(ctx.runDir);

  if (!state || !envelope) {
    if (!seed) {
      throw new Error(
        `runStages: ${ctx.runDir} has no run.json/envelope.json and no seed was given — cannot start.`,
      );
    }
    envelope = seed.envelope;
    state = {
      runId: ctx.runId,
      style: seed.style,
      status: "running",
      stages: stages.map((s) => ({ name: s.name, status: "todo" as const })),
    };
    await writeEnvelope(ctx.runDir, envelope);
    await writeRunState(ctx.runDir, state);
  }

  // Reconcile records with the stage list (keep prior statuses for resume).
  const prior = state.stages;
  state.stages = stages.map(
    (s) => prior.find((r) => r.name === s.name) ?? { name: s.name, status: "todo" },
  );
  state.status = "running";
  await writeRunState(ctx.runDir, state);

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const rec = state.stages[i];

    if (rec.status === "done") continue; // resume: already finished

    rec.status = "running";
    rec.startedAt = clock();
    rec.error = undefined;
    await writeRunState(ctx.runDir, state);

    try {
      envelope = await stage.run(envelope, ctx);
      await writeEnvelope(ctx.runDir, envelope);
      rec.status = "done";
      rec.endedAt = clock();
      await writeRunState(ctx.runDir, state);
    } catch (err) {
      rec.status = "failed";
      rec.endedAt = clock();
      rec.error = err instanceof Error ? err.message : String(err);
      state.status = "failed";
      await writeRunState(ctx.runDir, state);
      return state;
    }

    if (stage.gate) {
      state.status = "needs-approval";
      await writeRunState(ctx.runDir, state);
      return state;
    }
  }

  state.status = "done";
  await writeRunState(ctx.runDir, state);
  return state;
}
