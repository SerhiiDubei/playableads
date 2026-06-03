// Epic C: pure plan edits (add/rm screen + asset), idempotent, immutable.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addScreen, rmScreen, addAsset, rmAsset } from "./plan-edit.js";
import type { Plan } from "./types.js";

const base: Plan = { screens: [{ id: "menu" }, { id: "endcard" }], assetKeys: ["bg", "hero"] };

describe("plan-edit", () => {
  it("addScreen appends, is idempotent, does not mutate input", () => {
    const p = addScreen(base, "shop");
    assert.deepEqual(p.screens.map((s) => s.id), ["menu", "endcard", "shop"]);
    assert.equal(addScreen(p, "shop").screens.length, 3); // idempotent
    assert.equal(base.screens.length, 2); // original untouched
  });
  it("rmScreen removes by id", () => {
    assert.deepEqual(rmScreen(base, "menu").screens.map((s) => s.id), ["endcard"]);
  });
  it("addAsset / rmAsset", () => {
    assert.deepEqual(addAsset(base, "btn").assetKeys, ["bg", "hero", "btn"]);
    assert.equal(addAsset(base, "bg").assetKeys.length, 2); // idempotent
    assert.deepEqual(rmAsset(base, "bg").assetKeys, ["hero"]);
  });
});
