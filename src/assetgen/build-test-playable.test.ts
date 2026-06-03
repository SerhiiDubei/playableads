// P2-2: defaultAssetPlan is the asset contract the build reads. Lock its shape
// so a future change can't silently drop bg/hero/frames (golden catches output
// drift; this catches contract drift earlier).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultAssetPlan } from "./build-test-playable.js";
import { getLayout } from "./layouts/index.js";
import { NINE } from "./kit/kit.js";

describe("defaultAssetPlan", () => {
  it("includes 9-slice frames + banner + bg-castle + knight", () => {
    const plan = defaultAssetPlan("out/__nope__", getLayout("endcard"));
    for (const k of Object.keys(NINE)) assert.ok(plan.keys.includes(k), `missing frame ${k}`);
    assert.ok(plan.keys.includes("banner"));
    const extraKeys = plan.extra.map((e) => e.key);
    assert.ok(extraKeys.includes("bg-castle"));
    assert.ok(extraKeys.includes("knight"));
    assert.equal(plan.extra.find((e) => e.key === "bg-castle")?.size, 680);
    assert.equal(plan.extra.find((e) => e.key === "knight")?.size, 520);
  });

  it("appends template-declared meta.assets (showcase → hero2/hero3)", () => {
    const plan = defaultAssetPlan("out/__nope__", getLayout("showcase"));
    const keys = plan.extra.map((e) => e.key);
    assert.ok(keys.includes("hero2"));
    assert.ok(keys.includes("hero3"));
  });
});
