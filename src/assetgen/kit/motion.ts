// Motion control — the single source of truth for in-game movement.
//
// Grounded in the decompiled Fruit Ninja Retro (Unity) motion model:
//   • Objects are THROWN with a physics arc (launch up + gravity), NOT moved by
//     a constant `x += speed`. → natural HANG at the apex = the slice window.
//   • Parameterized by TIME (flight seconds) + screen-relative HEIGHT, never by
//     raw px/frame. → frame-rate & screen-size independent.
//   • Difficulty escalates DENSITY/CADENCE (more & more often), not SPEED, and
//     adapts to the player's recent success (rubber-band), like Unity's
//     DifficultyAdapter (rolling 20-window of hit/miss).
//
// Pure logic (no Pixi dep): operate on plain {x,y,rotation}. The game applies
// these to its display objects each tick. dt is ALWAYS in seconds.

// ── Quality markers (also consumed by motion-lint — single source) ──
export const MOTION = {
  /** Must-hit objects: full flight must last at least this long (slice window). */
  SLICE_WINDOW_MIN_SEC: 1.2,
  /** Recommended flight time for a thrown sliceable object. */
  TIME_ALOFT_DEFAULT_SEC: 2.2,
  /** Apex height as a fraction of play-area height (peak ~ upper third). */
  APEX_FRACTION_DEFAULT: 0.72,
  /** Horizontal launch spread (deg). Real FN ≈ ±10° → near-vertical, not sideways. */
  SPREAD_DEG_DEFAULT: 10,
  /** Max screen-heights/sec for a must-hit object (lint FAIL above this). */
  MUST_HIT_MAX_SH_PER_SEC: 0.8,
} as const;

/** Named speed tokens in screen-heights per second (for non-arc linear motion). */
export const SPEED_SH_PER_SEC = {
  drift: 0.1, // ambient / background
  float: 0.25,
  glide: 0.5, // trackable
  dash: 1.0, // fast but still catchable
} as const;
export type SpeedToken = keyof typeof SPEED_SH_PER_SEC;

/** Convert a speed token to px/sec for a given play-area height. */
export function speedPx(token: SpeedToken, screenH: number): number {
  return SPEED_SH_PER_SEC[token] * screenH;
}

// ── Physics arc (the core fix) ──

export interface ArcConfig {
  fromX: number;
  fromY: number; // launch point (usually near the bottom edge)
  screenH: number; // play-area height in px (apex is relative to this)
  timeAloftSec?: number; // total flight time; default 2.2s
  apexFraction?: number; // peak height as fraction of screenH; default 0.72
  /** Horizontal tilt in degrees (signed). If omitted, 0 (straight up). */
  angleDeg?: number;
  /** Spin in radians/sec (constant). */
  spinRadPerSec?: number;
}

export interface Projectile {
  x: number;
  y: number;
  rotation: number;
  vx: number;
  vy: number;
  /** Seconds elapsed since launch. */
  t: number;
  /** True once it has returned to (or below) the launch height — i.e. flight over. */
  done: boolean;
  /** Advance by dt SECONDS. Frame-rate independent. */
  update(dtSec: number): void;
}

/**
 * Create a thrown projectile that arcs up and falls back under gravity.
 *
 * Math (screen coords, y down): with flight time T and apex height H (px):
 *   g    =  8H / T²      (downward accel)
 *   v0y  = -4H / T       (initial upward velocity, negative = up)
 *   t_apex = T/2, where vy ≈ 0  → the HANG (slice window).
 * Horizontal: constant vx from the launch tilt (no horizontal gravity).
 */
export function makeArc(cfg: ArcConfig): Projectile {
  const T = cfg.timeAloftSec ?? MOTION.TIME_ALOFT_DEFAULT_SEC;
  const H = (cfg.apexFraction ?? MOTION.APEX_FRACTION_DEFAULT) * cfg.screenH;
  const g = (8 * H) / (T * T);
  const v0y = (-4 * H) / T;
  const angle = ((cfg.angleDeg ?? 0) * Math.PI) / 180;
  // vx so the launch vector is tilted by `angle` from straight up
  const vx = Math.abs(v0y) * Math.tan(angle);
  const spin = cfg.spinRadPerSec ?? 0;

  return {
    x: cfg.fromX,
    y: cfg.fromY,
    rotation: 0,
    vx,
    vy: v0y,
    t: 0,
    done: false,
    update(dtSec: number): void {
      if (this.done) return;
      this.vy += g * dtSec;
      this.x += this.vx * dtSec;
      this.y += this.vy * dtSec;
      this.rotation += spin * dtSec;
      this.t += dtSec;
      // flight over once it falls back to/below launch height (after rising)
      if (this.t >= T || (this.vy > 0 && this.y >= cfg.fromY)) this.done = true;
    },
  };
}

/** A random near-vertical launch angle within ±spread (deg). idx varies it deterministically-ish. */
export function randomLaunchAngle(rnd: number, spreadDeg = MOTION.SPREAD_DEG_DEFAULT): number {
  return (rnd * 2 - 1) * spreadDeg;
}

// ── Adaptive difficulty (rubber-band, from Unity DifficultyAdapter) ──

export interface DifficultyTuning {
  window?: number; // rolling window size (Unity: 20)
  waitMin?: number; // fastest spawn gap (s) at max difficulty
  waitMax?: number; // slowest spawn gap (s) at min difficulty
  parallelMin?: number;
  parallelMax?: number;
  bombMin?: number;
  bombMax?: number;
  bombPenalty?: number; // difficulty reduction when a bomb is hit (0..1)
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));

/**
 * Tracks recent hit/miss and maps the rolling success-rate to spawn cadence,
 * parallelism and bomb chance. Escalates DENSITY, never object speed.
 */
export class DifficultyController {
  private readonly window: number;
  private readonly tun: Required<DifficultyTuning>;
  private hits: boolean[];

  constructor(t: DifficultyTuning = {}) {
    this.tun = {
      window: t.window ?? 20,
      waitMin: t.waitMin ?? 0.3,
      waitMax: t.waitMax ?? 2.0,
      parallelMin: t.parallelMin ?? 1,
      parallelMax: t.parallelMax ?? 5,
      bombMin: t.bombMin ?? 0.1,
      bombMax: t.bombMax ?? 0.4,
      bombPenalty: t.bombPenalty ?? 0.2,
    };
    this.window = this.tun.window;
    this.hits = new Array(this.window).fill(false);
  }

  private push(v: boolean): void {
    this.hits.push(v);
    this.hits.shift();
  }

  recordHit(): void { this.push(true); }
  recordMiss(): void { this.push(false); }
  recordBombHit(): void {
    // wipe a chunk of recent successes → difficulty drops
    let toClear = Math.round(this.successes() * this.tun.bombPenalty);
    for (let i = this.hits.length - 1; i >= 0 && toClear > 0; i--) {
      if (this.hits[i]) { this.hits[i] = false; toClear--; }
    }
  }

  private successes(): number { return this.hits.reduce((n, h) => n + (h ? 1 : 0), 0); }

  /** 0..1 — rolling success rate. */
  get difficulty(): number { return this.successes() / this.window; }

  /** Seconds to wait before the next spawn (shrinks as difficulty rises). */
  spawnWaitSec(): number { return lerp(this.tun.waitMax, this.tun.waitMin, this.difficulty); }
  /** How many objects to launch at once (grows with difficulty). */
  parallelCount(): number { return Math.round(lerp(this.tun.parallelMin, this.tun.parallelMax, this.difficulty)); }
  /** Probability the next object is a bomb. */
  bombProbability(): number { return lerp(this.tun.bombMin, this.tun.bombMax, this.difficulty); }
}

// ── Approach motion (enemies that move TOWARD a target) ──
// For games where threats close in on the player (action/survival), not arced.
// Same principles: screen-relative speed, dt-correct, time-not-px.

export interface ApproachConfig {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  screenH: number;
  /** Speed in screen-heights/sec (default = glide 0.5). Keep CONSTANT; escalate density, not speed. */
  speedShPerSec?: number;
  /** Distance (px) at which it counts as "arrived" (reached the target). */
  arriveRadius?: number;
}

export interface Mover {
  x: number;
  y: number;
  rotation: number;
  /** True once it reached the target (arrived). */
  arrived: boolean;
  update(dtSec: number): void;
}

/** A threat that walks straight toward (toX,toY) at a constant screen-relative speed. */
export function makeApproach(cfg: ApproachConfig): Mover {
  const speed = (cfg.speedShPerSec ?? SPEED_SH_PER_SEC.glide) * cfg.screenH;
  const arrive = cfg.arriveRadius ?? 40;
  return {
    x: cfg.fromX,
    y: cfg.fromY,
    rotation: 0,
    arrived: false,
    update(dtSec: number): void {
      if (this.arrived) return;
      const dx = cfg.toX - this.x;
      const dy = cfg.toY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= arrive) { this.arrived = true; return; }
      const step = Math.min(dist, speed * dtSec);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    },
  };
}
