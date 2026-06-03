// Epic B: UserBrief schema (mandatory prompt+refs), versioned store with
// non-triggering rollback, summarize → top-3 + superbutton.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { UserBriefSchema, yellowWarnings } from "./types.js";
import { setBriefsRoot, createBrief, newVersion, rollback, readBrief, listVersions, currentVersion, slugify } from "./store.js";
import { summarizeBrief } from "./summarize.js";

const NOW = "2026-06-03T00:00:00.000Z";

before(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "brief-test-"));
  setBriefsRoot(tmp);
});

describe("UserBriefSchema", () => {
  it("requires prompt + ≥1 ref", () => {
    assert.throws(() => UserBriefSchema.parse({ id: "x", version: 1, createdAt: NOW, prompt: "", refs: ["a"] }));
    assert.throws(() => UserBriefSchema.parse({ id: "x", version: 1, createdAt: NOW, prompt: "p", refs: [] }));
    assert.ok(UserBriefSchema.parse({ id: "x", version: 1, createdAt: NOW, prompt: "p", refs: ["a"] }));
  });
  it("yellow warnings for missing optional fields", () => {
    const w = yellowWarnings(UserBriefSchema.parse({ id: "x", version: 1, createdAt: NOW, prompt: "p", refs: ["a"] }));
    assert.equal(w.length, 4); // style/audience/niche/tone all missing
  });
});

describe("store: versioning + rollback", () => {
  it("create → newVersion → rollback (pointer only)", () => {
    const b = createBrief({ prompt: "neon slot game", refs: ["r.png"], style: "cyber-heist" }, NOW);
    assert.equal(b.version, 1);
    assert.equal(currentVersion(b.id), 1);

    const v2 = newVersion(b.id, { tone: "playful" }, NOW);
    assert.equal(v2.version, 2);
    assert.equal(v2.parentVersion, 1);
    assert.equal(currentVersion(b.id), 2);
    assert.deepEqual(listVersions(b.id), [1, 2]);

    // rollback to v1 — pointer moves, v2 file still exists (immutable)
    rollback(b.id, 1);
    assert.equal(currentVersion(b.id), 1);
    assert.equal(readBrief(b.id).version, 1); // current resolves to v1
    assert.deepEqual(listVersions(b.id), [1, 2]); // v2 NOT deleted
  });

  it("slugify + duplicate guard", () => {
    assert.equal(slugify("Make a Sweet Bonanza slot!"), "make-a-sweet-bonanza-slot");
    createBrief({ prompt: "dup test", refs: ["r"] }, NOW);
    assert.throws(() => createBrief({ prompt: "dup test", refs: ["r"] }, NOW), /already exists/);
  });
});

describe("summarizeBrief", () => {
  it("returns top-3 + superbutton; slot prompt favors bonanza", async () => {
    const { top3, superbutton } = await summarizeBrief("a tumble slot with fruit and free spins");
    assert.ok(top3.length >= 1 && top3.length <= 3);
    assert.ok(superbutton);
    assert.equal(superbutton!.id, top3[0].id);
    assert.equal(superbutton!.id, "fruit-bonanza"); // keyword hits + v1 bonus
  });
});
