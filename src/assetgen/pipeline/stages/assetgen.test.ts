// AC2.3: assetgen stage emits envelope.assets[] from out/<style>/ (read-only),
// reading prompt + briefVersion from sidecar <key>.json when present.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { assetgenStage } from "./assetgen.js";
import type { Envelope, RunContext } from "../types.js";

let base: string;
const ctx: RunContext = { runId: "t", runDir: "t" };

function env(style: string): Envelope {
  return {
    runId: "t",
    createdAt: "2026-06-03T00:00:00.000Z",
    brief: { style },
    assets: [],
    font: { family: "Cinzel", path: "x.woff2" },
  };
}

before(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "assetgen-test-"));
  const dir = path.join(base, "demo-style");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "btn-frame.png"), Buffer.from([1, 2, 3, 4]));
  await fs.writeFile(path.join(dir, "hero.png"), Buffer.from([1, 2, 3, 4, 5, 6]));
  // sidecar for hero only
  await fs.writeFile(
    path.join(dir, "hero.json"),
    JSON.stringify({ prompt: "a cyber hero", briefVersion: "3" }),
  );
});
after(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

describe("assetgenStage", () => {
  it("emits one asset per png, sorted, with byte sizes", async () => {
    const out = await assetgenStage({ baseDir: base }).run(env("demo-style"), ctx);
    assert.deepEqual(out.assets.map((a) => a.key), ["btn-frame", "hero"]);
    assert.equal(out.assets[0].bytes, 4);
    assert.equal(out.assets[1].bytes, 6);
  });

  it("reads prompt + briefVersion from sidecar (empty string when absent)", async () => {
    const out = await assetgenStage({ baseDir: base }).run(env("demo-style"), ctx);
    const hero = out.assets.find((a) => a.key === "hero")!;
    const btn = out.assets.find((a) => a.key === "btn-frame")!;
    assert.equal(hero.prompt, "a cyber hero");
    assert.equal(hero.briefVersion, "3");
    assert.equal(btn.prompt, ""); // no sidecar
    assert.equal(btn.briefVersion, "");
  });

  it("throws for a missing style dir", async () => {
    await assert.rejects(() => assetgenStage({ baseDir: base }).run(env("nope"), ctx), /not found/);
  });
});
