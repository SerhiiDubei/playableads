// "Create new mechanic": scaffoldMechanic writes a labs draft (manifest + game.ts),
// validates the id, and refuses duplicates.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffoldMechanic, isValidMechanicId } from "./scaffold.js";

let base: string;
before(async () => { base = await fs.mkdtemp(path.join(os.tmpdir(), "scaffold-test-")); });
after(async () => { await fs.rm(base, { recursive: true, force: true }); });

describe("scaffoldMechanic", () => {
  it("creates manifest.json + game.ts; manifest has no catalog (draft)", () => {
    const r = scaffoldMechanic({ id: "swipe-to-slice", name: "Swipe", baseDir: base });
    assert.ok(existsSync(path.join(r.dir, "manifest.json")));
    assert.ok(existsSync(path.join(r.dir, "game.ts")));
    const m = JSON.parse(readFileSync(path.join(r.dir, "manifest.json"), "utf8"));
    assert.equal(m.id, "swipe-to-slice");
    assert.equal(m.name, "Swipe");
    assert.equal(m.catalog, undefined); // draft, not curated
    assert.equal(m.entry, "game.ts");
  });

  it("rejects invalid ids and duplicates", () => {
    assert.equal(isValidMechanicId("Bad Id"), false);
    assert.equal(isValidMechanicId("good-id-1"), true);
    assert.throws(() => scaffoldMechanic({ id: "Bad Id", baseDir: base }), /invalid id/);
    scaffoldMechanic({ id: "dup", baseDir: base });
    assert.throws(() => scaffoldMechanic({ id: "dup", baseDir: base }), /already exists/);
  });
});
