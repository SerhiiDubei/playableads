// Pipeline contracts: Envelope, RunState, Stage, RunContext.
//
// Every stage in the pipeline (assetgen, build, validate, ...) accepts an
// Envelope and returns an enriched Envelope. The orchestrator persists
// RunState (per-run state machine) alongside it. All schemas are validated
// at stage boundaries via zod.
//
// See docs/audit-2026-06-02/build-plan.md (Phase 0) for the contract spec.

import { z } from "zod";

// ── Brief (user input to the pipeline) ─────────────────────────────────────────
// Style is required (resolves to styles/<id>.brief.json). Everything else is
// optional and may grow over time — passthrough keeps forward-compat.
export const BriefSchema = z
  .object({
    style: z.string().min(1),
    prompt: z.string().optional(),
    refs: z.array(z.string()).optional(),
  })
  .passthrough();

// ── AssetEntry (one record in envelope.assets[]) ───────────────────────────────
export const AssetEntrySchema = z.object({
  key: z.string().min(1),
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  prompt: z.string(),
  briefVersion: z.string(),
});

// ── Font (style font reference) ────────────────────────────────────────────────
export const FontSchema = z.object({
  family: z.string().min(1),
  path: z.string().min(1),
});

// ── Plan (appears in Phase 5; permissive for now) ──────────────────────────────
export const PlanScreenSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();

export const PlanSchema = z.object({
  screens: z.array(PlanScreenSchema),
  assetKeys: z.array(z.string()),
});

// ── Build (output of build stage) ──────────────────────────────────────────────
export const BuildSchema = z.object({
  htmlPath: z.string().min(1),
  bytes: z.number().int().nonnegative(),
});

// ── Validation (output of validate stage) ──────────────────────────────────────
export const ValidationSchema = z.object({
  ok: z.boolean(),
  checks: z.record(z.string(), z.unknown()),
});

// ── Envelope (flows through every stage) ───────────────────────────────────────
export const EnvelopeSchema = z.object({
  runId: z.string().min(1),
  createdAt: z.string().min(1), // ISO 8601, stamped by runner
  brief: BriefSchema,
  assets: z.array(AssetEntrySchema),
  font: FontSchema,
  plan: PlanSchema.optional(),
  build: BuildSchema.optional(),
  validation: ValidationSchema.optional(),
});

// ── RunState (orchestrator state machine, persisted as run.json) ───────────────
export const StageStatusSchema = z.enum([
  "todo",
  "running",
  "done",
  "failed",
  "skipped",
]);

export const StageRunRecordSchema = z.object({
  name: z.string().min(1),
  status: StageStatusSchema,
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  error: z.string().optional(),
  note: z.string().optional(),
});

export const RunStatusSchema = z.enum([
  "running",
  "needs-approval",
  "done",
  "failed",
]);

export const RunStateSchema = z.object({
  runId: z.string().min(1),
  style: z.string().min(1),
  status: RunStatusSchema,
  stages: z.array(StageRunRecordSchema),
});

// ── TS types inferred from schemas (single source of truth) ────────────────────
export type Brief = z.infer<typeof BriefSchema>;
export type AssetEntry = z.infer<typeof AssetEntrySchema>;
export type Font = z.infer<typeof FontSchema>;
export type PlanScreen = z.infer<typeof PlanScreenSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Build = z.infer<typeof BuildSchema>;
export type Validation = z.infer<typeof ValidationSchema>;
export type Envelope = z.infer<typeof EnvelopeSchema>;
export type StageStatus = z.infer<typeof StageStatusSchema>;
export type StageRunRecord = z.infer<typeof StageRunRecordSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RunState = z.infer<typeof RunStateSchema>;

// ── RunContext + Stage (TS-only; orchestrator interface) ───────────────────────
// RunContext is what every stage receives alongside its typed input. It carries
// run identity and the absolute path to the per-run output directory. Future
// fields (logger, abort signal, secrets accessor) extend this type — never
// passed via Envelope.
export interface RunContext {
  runId: string;
  runDir: string; // absolute path to out/runs/<runId>/
}

// Stage<In, Out> describes a unit of work. The orchestrator runs stages in
// order, persisting RunState after each. `gate: true` means the orchestrator
// pauses with status "needs-approval" after this stage — user resumes
// explicitly. See Phase 4 of build-plan.md.
export interface Stage<In, Out> {
  name: string;
  gate?: boolean;
  run(input: In, ctx: RunContext): Promise<Out>;
}
