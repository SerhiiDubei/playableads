// AC for P0-3:
//   - runId is sortable (compact ISO + short hex) and unique per call.
//   - ensureRunDir creates run + assets + failures.
//   - read*/write* round-trip and reject invalid payloads (zod gate).
//   - read* returns null when file missing (not throws), which the runner needs
//     to differentiate "fresh run" from "corrupt run".
//
// Uses os.tmpdir() so the suite is hermetic — no writes inside the repo.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  makeRunId,
  runDirOf,
  ensureRunDir,
  readRunState,
  writeRunState,
  readEnvelope,
  writeEnvelope,
  RUN_STATE_FILENAME,
  ENVELOPE_FILENAME,
} from "./runDir.js";
import type { Envelope, RunState } from "./types.js";

let tmpBase: string;

before(async () => {
  tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "forge-test-rundir-"));
});

after(async () => {
  await fs.rm(tmpBase, { recursive: true, force: true });
});

describe("makeRunId", () => {
  it("uses compact ISO + 8 hex chars", () => {
    const id = makeRunId(new Date("2026-06-02T13:14:22.000Z"));
    // 20260602T131422-XXXXXXXX
    assert.match(id, /^20260602T131422-[0-9a-f]{8}$/);
  });

  it("produces distinct ids on rapid calls", () => {
    const ids = new Set<string>();
    const now = new Date("2026-06-02T00:00:00.000Z");
    for (let i = 0; i < 100; i++) ids.add(makeRunId(now));
    assert.equal(ids.size, 100);
  });

  it("sorts lexicographically by time", () => {
    const a = makeRunId(new Date("2026-01-01T00:00:00.000Z"));
    const b = makeRunId(new Date("2026-12-31T23:59:59.000Z"));
    assert.ok(a < b, `expected ${a} < ${b}`);
  });
});

describe("ensureRunDir / runDirOf", () => {
  it("creates run/, assets/, failures/", async () => {
    const runId = makeRunId();
    const runDir = runDirOf(tmpBase, runId);
    await ensureRunDir(runDir);
    const stats = await Promise.all([
      fs.stat(runDir),
      fs.stat(path.join(runDir, "assets")),
      fs.stat(path.join(runDir, "failures")),
    ]);
    for (const s of stats) assert.ok(s.isDirectory());
  });

  it("is idempotent (second call does not throw)", async () => {
    const runId = makeRunId();
    const runDir = runDirOf(tmpBase, runId);
    await ensureRunDir(runDir);
    await ensureRunDir(runDir); // should be fine
    assert.ok((await fs.stat(runDir)).isDirectory());
  });
});

describe("RunState round-trip", () => {
  const sampleState: RunState = {
    runId: "20260602T131422-a3f1c8d2",
    style: "heroes3",
    status: "running",
    stages: [
      { name: "assetgen", status: "done", startedAt: "t0", endedAt: "t1" },
      { name: "build", status: "todo" },
    ],
  };

  it("writes then reads identical RunState", async () => {
    const runId = makeRunId();
    const runDir = runDirOf(tmpBase, runId);
    await ensureRunDir(runDir);
    await writeRunState(runDir, sampleState);
    const got = await readRunState(runDir);
    assert.deepEqual(got, sampleState);
  });

  it("readRunState returns null when file missing", async () => {
    const runId = makeRunId();
    const runDir = runDirOf(tmpBase, runId);
    await ensureRunDir(runDir);
    const got = await readRunState(runDir);
    assert.equal(got, null);
  });

  it("writeRunState throws on invalid payload", async () => {
    const runId = makeRunId();
    const runDir = runDirOf(tmpBase, runId);
    await ensureRunDir(runDir);
    await assert.rejects(() =>
      writeRunState(runDir, {
        ...sampleState,
        // @ts-expect-error — intentional invalid for the test
        status: "paused",
      }),
    );
  });

  it("writes file at run.json (canonical name)", async () => {
    const runId = makeRunId();
    const runDir = runDirOf(tmpBase, runId);
    await ensureRunDir(runDir);
    await writeRunState(runDir, sampleState);
    const exists = await fs
      .stat(path.join(runDir, RUN_STATE_FILENAME))
      .then(() => true)
      .catch(() => false);
    assert.ok(exists);
  });
});

describe("Envelope round-trip", () => {
  const sampleEnv: Envelope = {
    runId: "20260602T131422-a3f1c8d2",
    createdAt: "2026-06-02T13:14:22.000Z",
    brief: { style: "heroes3", prompt: "test" },
    assets: [
      {
        key: "btn-frame",
        path: "assets/btn-frame.webp",
        bytes: 12345,
        prompt: "ornate gold UI button frame",
        briefVersion: "1.0.0",
      },
    ],
    font: { family: "Cinzel", path: "assets/Cinzel-700.woff2" },
  };

  it("writes then reads identical Envelope", async () => {
    const runId = makeRunId();
    const runDir = runDirOf(tmpBase, runId);
    await ensureRunDir(runDir);
    await writeEnvelope(runDir, sampleEnv);
    const got = await readEnvelope(runDir);
    assert.deepEqual(got, sampleEnv);
  });

  it("readEnvelope returns null when file missing", async () => {
    const runId = makeRunId();
    const runDir = runDirOf(tmpBase, runId);
    await ensureRunDir(runDir);
    const got = await readEnvelope(runDir);
    assert.equal(got, null);
  });

  it("writeEnvelope throws on invalid payload", async () => {
    const runId = makeRunId();
    const runDir = runDirOf(tmpBase, runId);
    await ensureRunDir(runDir);
    await assert.rejects(() =>
      writeEnvelope(runDir, {
        ...sampleEnv,
        assets: [{ ...sampleEnv.assets[0], bytes: -5 }],
      }),
    );
  });

  it("writes file at envelope.json (canonical name)", async () => {
    const runId = makeRunId();
    const runDir = runDirOf(tmpBase, runId);
    await ensureRunDir(runDir);
    await writeEnvelope(runDir, sampleEnv);
    const exists = await fs
      .stat(path.join(runDir, ENVELOPE_FILENAME))
      .then(() => true)
      .catch(() => false);
    assert.ok(exists);
  });

  it("write is atomic — no .tmp file remains after success", async () => {
    const runId = makeRunId();
    const runDir = runDirOf(tmpBase, runId);
    await ensureRunDir(runDir);
    await writeEnvelope(runDir, sampleEnv);
    const tmpExists = await fs
      .stat(path.join(runDir, ENVELOPE_FILENAME + ".tmp"))
      .then(() => true)
      .catch(() => false);
    assert.equal(tmpExists, false);
  });
});
