// Motion model tests: prove the arc physics (apex height, flight time,
// dt-independence) and the adaptive difficulty mapping.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeArc, MOTION, DifficultyController, speedPx } from "./motion.js";

function flyAndMeasure(dt: number): { apexH: number; flight: number } {
  const screenH = 860;
  const p = makeArc({ fromX: 200, fromY: screenH, screenH, timeAloftSec: 2.2, apexFraction: 0.72, angleDeg: 0 });
  let minY = p.y;
  let steps = 0;
  while (!p.done && steps < 100000) { p.update(dt); minY = Math.min(minY, p.y); steps++; }
  return { apexH: screenH - minY, flight: p.t };
}

describe("makeArc physics", () => {
  it("peaks near apexFraction*screenH and flies ~timeAloft", () => {
    const { apexH, flight } = flyAndMeasure(1 / 60);
    const targetApex = 0.72 * 860;
    assert.ok(Math.abs(apexH - targetApex) / targetApex < 0.05, `apex ${apexH.toFixed(0)} vs ${targetApex.toFixed(0)}`);
    assert.ok(Math.abs(flight - 2.2) < 0.15, `flight ${flight.toFixed(2)}s vs 2.2s`);
  });

  it("is frame-rate independent (30 vs 120 fps within 3%)", () => {
    const a = flyAndMeasure(1 / 30);
    const b = flyAndMeasure(1 / 120);
    assert.ok(Math.abs(a.apexH - b.apexH) / b.apexH < 0.03, `apex 30fps ${a.apexH.toFixed(0)} vs 120fps ${b.apexH.toFixed(0)}`);
  });

  it("default flight respects the minimum slice window", () => {
    const { flight } = flyAndMeasure(1 / 60);
    assert.ok(flight >= MOTION.SLICE_WINDOW_MIN_SEC, `flight ${flight.toFixed(2)}s < ${MOTION.SLICE_WINDOW_MIN_SEC}s`);
  });

  it("hangs at the apex (vy near zero mid-flight)", () => {
    const screenH = 860;
    const p = makeArc({ fromX: 0, fromY: screenH, screenH, timeAloftSec: 2.0 });
    let minAbsVy = Infinity;
    while (!p.done) { p.update(1 / 120); minAbsVy = Math.min(minAbsVy, Math.abs(p.vy)); }
    assert.ok(minAbsVy < 20, `min |vy| ${minAbsVy.toFixed(1)} px/s should be ~0 at apex`);
  });
});

describe("DifficultyController", () => {
  it("starts easy, ramps with hits, eases with bombs", () => {
    const d = new DifficultyController();
    assert.equal(d.difficulty, 0);
    assert.ok(d.spawnWaitSec() > 1.5); // slow at start
    assert.equal(d.parallelCount(), 1);

    for (let i = 0; i < 20; i++) d.recordHit();
    assert.equal(d.difficulty, 1);
    assert.ok(d.spawnWaitSec() < 0.4); // fast when skilled
    assert.equal(d.parallelCount(), 5);
    assert.ok(d.bombProbability() > 0.3);

    d.recordBombHit();
    assert.ok(d.difficulty < 1, "bomb hit reduces difficulty");
  });

  it("escalates density, never reports a speed", () => {
    // speedPx is screen-relative and constant regardless of difficulty
    assert.equal(speedPx("glide", 1000), 500);
  });
});
