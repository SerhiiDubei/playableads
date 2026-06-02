// Run-scoped on-disk layout: out/runs/<runId>/{run.json, envelope.json, assets/, failures/}.
//
// Provides:
//   - makeRunId()      — sortable timestamp + short random hex
//   - runDirOf()       — pure path join
//   - ensureRunDir()   — mkdir -p for runDir + asset/failure subdirs
//   - readRunState() / writeRunState()    — atomic JSON + zod validation
//   - readEnvelope()  / writeEnvelope()   — atomic JSON + zod validation
//
// Atomic write (tmp + rename) guarantees readers never see a half-written file.
// All schema validation happens here so callers cannot persist invalid state.
//
// See docs/audit-2026-06-02/build-plan.md §0 (run layout).

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  EnvelopeSchema,
  RunStateSchema,
  type Envelope,
  type RunState,
} from "./types.js";

export const RUN_STATE_FILENAME = "run.json";
export const ENVELOPE_FILENAME = "envelope.json";

// ── runId ──────────────────────────────────────────────────────────────────────
// Sortable timestamp (UTC, compact ISO) + 8 hex chars of randomness.
// Example: 20260602T131422-a3f1c8d2
//
// `now` is injectable for deterministic tests.
export function makeRunId(now: Date = new Date()): string {
  const iso = now.toISOString();                      // 2026-06-02T13:14:22.123Z
  const compact = iso.replace(/[-:]/g, "").split(".")[0]; // 20260602T131422
  const short = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${compact}-${short}`;
}

// ── path helpers ───────────────────────────────────────────────────────────────
export function runDirOf(baseDir: string, runId: string): string {
  return path.join(baseDir, runId);
}

export async function ensureRunDir(runDir: string): Promise<string> {
  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(path.join(runDir, "assets"), { recursive: true });
  await fs.mkdir(path.join(runDir, "failures"), { recursive: true });
  return runDir;
}

// ── atomic write ───────────────────────────────────────────────────────────────
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tmp = filePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tmp, filePath);
}

function isENOENT(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

// ── RunState I/O ───────────────────────────────────────────────────────────────
export async function readRunState(runDir: string): Promise<RunState | null> {
  const file = path.join(runDir, RUN_STATE_FILENAME);
  try {
    const raw = await fs.readFile(file, "utf8");
    return RunStateSchema.parse(JSON.parse(raw));
  } catch (err: unknown) {
    if (isENOENT(err)) return null;
    throw err;
  }
}

export async function writeRunState(
  runDir: string,
  state: RunState,
): Promise<void> {
  RunStateSchema.parse(state); // throw on invalid (defence in depth)
  await atomicWriteJson(path.join(runDir, RUN_STATE_FILENAME), state);
}

// ── Envelope I/O ───────────────────────────────────────────────────────────────
export async function readEnvelope(runDir: string): Promise<Envelope | null> {
  const file = path.join(runDir, ENVELOPE_FILENAME);
  try {
    const raw = await fs.readFile(file, "utf8");
    return EnvelopeSchema.parse(JSON.parse(raw));
  } catch (err: unknown) {
    if (isENOENT(err)) return null;
    throw err;
  }
}

export async function writeEnvelope(
  runDir: string,
  envelope: Envelope,
): Promise<void> {
  EnvelopeSchema.parse(envelope);
  await atomicWriteJson(path.join(runDir, ENVELOPE_FILENAME), envelope);
}
