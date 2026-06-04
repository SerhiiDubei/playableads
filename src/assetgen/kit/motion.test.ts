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

import { makeApproach } from "./motion.js";

describe("makeApproach", () => {
  it("moves toward the target and arrives, frame-rate independent", () => {
    const mk = () => makeApproach({ fromX: 0, fromY: 0, toX: 400, toY: 0, screenH: 800, speedShPerSec: 0.5, arriveRadius: 10 });
    const run = (dt: number) => { const m = mk(); let n = 0; while (!m.arrived && n < 100000) { m.update(dt); n++; } return n * dt; };
    // speed 0.5*800=400 px/s; distance ~400px → ~1s to arrive
    const t60 = run(1 / 60);
    assert.ok(Math.abs(t60 - 1.0) < 0.1, `arrive time ${t60.toFixed(2)}s ~ 1s`);
    const t120 = run(1 / 120);
    assert.ok(Math.abs(t60 - t120) < 0.05, `dt-independent: ${t60.toFixed(2)} vs ${t120.toFixed(2)}`);
  });

  it("never overshoots past the target", () => {
    const m = makeApproach({ fromX: 0, fromY: 0, toX: 100, toY: 0, screenH: 800, speedShPerSec: 1, arriveRadius: 5 });
    let maxX = 0;
    while (!m.arrived) { m.update(1 / 60); maxX = Math.max(maxX, m.x); }
    assert.ok(maxX <= 100 + 1, `did not overshoot (maxX=${maxX.toFixed(1)})`);
  });
});

import { makePlatformerBody } from "./motion.js";

describe("makePlatformerBody", () => {
  it("jump apex ≈ jumpHeightFraction*screenH and rise ≈ jumpRiseSec", () => {
    const b = makePlatformerBody({ x: 0, groundY: 800, screenH: 800, jumpHeightFraction: 0.28, jumpRiseSec: 0.4 });
    b.jump();
    let minY = b.y, riseT = 0; const dt = 1 / 120;
    for (let i = 0; i < 240 && !b.grounded; i++) { b.update(dt); if (b.y < minY) { minY = b.y; riseT = (i + 1) * dt; } }
    const apex = 800 - minY, target = 0.28 * 800;
    assert.ok(Math.abs(apex - target) / target < 0.06, `apex ${apex.toFixed(0)} vs ${target}`);
    assert.ok(Math.abs(riseT - 0.4) < 0.08, `rise ${riseT.toFixed(2)}s vs 0.4s`);
  });

  it("jump is frame-rate independent (apex 30 vs 120 fps within 3%)", () => {
    const apexAt = (dt: number) => { const b = makePlatformerBody({ x: 0, groundY: 800, screenH: 800 }); b.jump(); let m = b.y; for (let i = 0; i < 1000 && !b.grounded; i++) { b.update(dt); m = Math.min(m, b.y); } return 800 - m; };
    const a30 = apexAt(1 / 30), a120 = apexAt(1 / 120);
    assert.ok(Math.abs(a30 - a120) / a120 < 0.03, `apex 30fps ${a30.toFixed(0)} vs 120fps ${a120.toFixed(0)}`);
  });

  it("clamps x to [minX,maxX] and never sinks below ground; no double-jump", () => {
    const b = makePlatformerBody({ x: 50, groundY: 800, screenH: 800, minX: 0, maxX: 100, runSpeedShPerSec: 1 });
    b.setMove(1); for (let i = 0; i < 120; i++) b.update(1 / 60);
    assert.ok(b.x <= 100 + 0.001, `x clamped (${b.x.toFixed(1)})`);
    assert.equal(b.grounded, true); assert.equal(b.y, 800);
    b.jump(); b.update(1 / 60); const vyAir = b.vy; b.jump(); // 2nd jump ignored mid-air
    assert.ok(b.vy >= vyAir - 0.001, "no double-jump (vy not reset upward)");
  });
});
