// Epic D: the mechanics catalog curates v1 games (manifest.catalog === "v1").
// Integration over the real templates/ dir (manifests are committed + stable).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listMechanics } from "./mechanics.js";

describe("listMechanics", () => {
  it("user mode = only curated v1 (fruit-bonanza + mad-mage-tower)", async () => {
    const ids = (await listMechanics("user")).map((m) => m.id);
    assert.ok(ids.includes("fruit-bonanza"), "bonanza in v1");
    assert.ok(ids.includes("mad-mage-tower"), "mad-mage in v1");
    assert.ok(!ids.includes("tap-the-coin"), "candidates excluded from user mode");
  });

  it("dev mode includes more than user mode", async () => {
    const user = await listMechanics("user");
    const dev = await listMechanics("dev");
    assert.ok(dev.length >= user.length);
    assert.ok(dev.length > user.length, "there are candidates beyond v1");
  });
});
