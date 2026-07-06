// Financial Foundation — Jenga-style life-insurance playable.
// PixiJS + GSAP. Soft-clay art from generated sprites (bg / block-debt tinted
// per debt / block-gold / platform) with a procedural clay fallback when a key
// is absent. Procedural WebAudio SFX (zero asset weight). Portrait 9:16 only.
//
// Concept (per spec): a debt tower (Mortgage, College Fund, Car Loan, Credit
// Cards, Groceries) wobbles and nearly topples because its foundation slot is
// empty. The player drags a glowing gold "Life Insurance" block into the slot;
// magnetic snap → golden impulse → the tower aligns and freezes solid →
// "Foundation Secured!" → end card with the "Calculate My Coverage" CTA.
//
// FSM: boot → wobble → pause → drag → success → end  (+ failsafe auto-play).
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// Network / analytics globals the ad host may inject (Meta sets FbPlayableAd;
// MRAID networks set mraid). Typed locally so the module compiles standalone.
const HOST = window as unknown as {
  mraid?: { open?: (url: string) => void };
  playableTrack?: (ev: string, data?: unknown) => void;
  __ff?: unknown;
};

// ── Tunables (manifest defaults; brief params override) ───────────────────────
const WOBBLE_START = Number(cfg.params.wobbleStartMs ?? 500);
const PAUSE_AT = Number(cfg.params.pauseAtMs ?? 3000);
const IDLE_BOUNCE = Number(cfg.params.idleBounceMs ?? 4000);
const AUTO_PLAY = Number(cfg.params.autoPlayMs ?? 6000);
const DRAG_LAG = Number(cfg.params.dragLag ?? 0.22);
const SNAP_DIST = Number(cfg.params.snapDist ?? 56);
const SUCCESS_HOLD = Number(cfg.params.successHoldMs ?? 2400);
const CTA_TARGET = String(cfg.params.ctaTarget ?? "");

const HOOK = String(cfg.params.hookText ?? "Don't let it fall down.");
const SUCCESS = String(cfg.params.successText ?? "Foundation Secured!");
const HEADLINE = String(cfg.params.endHeadline ?? "Make your family's financial foundation unbreakable.");
const GOLD_LABEL = String(cfg.params.goldLabel ?? "Life Insurance");

// `?dbg` exposes the window.__ff console hooks (and the maxhw QA probe) but the
// ad still AUTO-PLAYS normally — so a leftover ?dbg URL can never look "stuck".
// Manual step-through (auto-play disabled) requires the explicit `?step` flag.
const DBG = /dbg/.test(location.search);
const MANUAL = /step/.test(location.search);

// ── Color helpers ─────────────────────────────────────────────────────────────
function num(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}
function shade(c: number, f: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const t = f > 0 ? 255 : 0, a = Math.abs(f);
  return (
    (Math.round(r + (t - r) * a) << 16) |
    (Math.round(g + (t - g) * a) << 8) |
    Math.round(b + (t - b) * a)
  );
}

const PRIMARY = num(cfg.style.colors.primary);
const ACCENT = num(cfg.style.colors.accent);
const BG = num(cfg.style.colors.background);
const TXT = cfg.style.colors.text;
const FONT = cfg.style.font.family;

// Calm, trustworthy debt-block palette (muted blue / sage / grey / teal). Used
// as the procedural-clay fallback tint when a context sprite is absent.
const DEBT_COLORS = [0x6f8fb0, 0x7fa183, 0xb6bdc6, 0x88a6b6, 0x9aa2ab];

// ── Audio: procedural WebAudio SFX (zero asset weight, no external loads) ──────
// Synthesised on the fly — nothing base64-inlined, nothing fetched. The context
// unlocks on the first user gesture (browser autoplay policy).
let actx: AudioContext | null = null;
let muted = false;
function audioCtx(): AudioContext | null {
  if (muted) return null;
  if (!actx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC(); } catch { return null; }
  }
  if (actx.state === "suspended") void actx.resume();
  return actx;
}
function unlockAudio(): void { void audioCtx(); }
function blip(freq: number, dur: number, type: OscillatorType, vol: number, t0 = 0, glide?: number): void {
  const a = audioCtx(); if (!a) return;
  const t = a.currentTime + t0;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}
function noiseBurst(dur: number, vol: number, freq: number, q: number, t0 = 0): void {
  const a = audioCtx(); if (!a) return;
  const t = a.currentTime + t0;
  const n = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t); src.stop(t + dur);
}
const sfx = {
  creak(): void { noiseBurst(0.22, 0.05, 300, 1.2); blip(150, 0.22, "sawtooth", 0.025, 0, 120); },
  pop(): void { blip(240, 0.16, "sine", 0.16, 0, 480); },
  grab(): void { blip(520, 0.05, "triangle", 0.08); },
  snap(): void { blip(150, 0.18, "sine", 0.28, 0, 70); blip(880, 0.05, "square", 0.05); noiseBurst(0.05, 0.05, 1200, 0.7); },
  success(): void { blip(523, 0.34, "sine", 0.16); blip(659, 0.34, "sine", 0.16, 0.09); blip(784, 0.5, "sine", 0.18, 0.18); blip(1047, 0.5, "sine", 0.1, 0.26); },
  cta(): void { blip(660, 0.12, "triangle", 0.12); blip(880, 0.14, "triangle", 0.1, 0.07); },
};

// ── Asset swap-in (Stage 2): procedural fallback when key absent ──────────────
const TEX: Record<string, Texture> = {};
async function preloadTextures(): Promise<void> {
  // Use load events (not img.decode()): decode() never settles in a hidden/
  // throttled tab, which would hang the whole boot. onload/onerror always fire.
  await Promise.all(
    Object.entries(cfg.assets).map(
      ([k, uri]) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            TEX[k] = Texture.from(img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = uri;
        }),
    ),
  );
}
function tex(key: string): Texture | null {
  return TEX[key] ?? null;
}

// ── Design canvas (fixed; scaled to fit the viewport — no reflow) ─────────────
const DW = 400, DH = 720, CX = DW / 2;
// Foundation slot + gold "Life Insurance" block geometry (a wide plinth under the
// stack of life-objects). R = corner radius shared by the slot, gold bar & beams.
const BW = 156, BH = 48, GAP = -8, R = 13; // GAP < 0 → objects nestle/overlap into a solid stack

// The tower is a stack of REAL clay objects (bottom i=0 → top i=4): the home you
// mortgage, the education you save for, the car you finance, the cards, the
// weekly groceries — life's obligations literally piled up and teetering. w/h are
// the on-canvas render size, kept to each sprite's TRUE aspect (srcW×srcH below)
// so nothing is squished. `rest` is the baked joint lean that gives the stack its
// hand-stacked zig-zag character before the physics takes over.
//   house 640×610 · college 640×554 · car 640×460 · credit 640×400 · groceries 541×640
const TOWER_OBJECTS = [
  { key: "obj-house.webp",     w: 109, h: 104, rest: -0.018 }, // Mortgage
  { key: "obj-college.webp",   w: 111, h: 97,  rest:  0.026 }, // College Fund
  { key: "obj-car.webp",       w: 115, h: 83,  rest: -0.032 }, // Car Loan
  { key: "obj-credit.webp",    w: 102, h: 64,  rest:  0.040 }, // Credit Cards
  { key: "obj-groceries.webp", w: 78,  h: 92,  rest: -0.050 }, // Groceries
];
const TOWER_N = TOWER_OBJECTS.length;
const STACK_H = TOWER_OBJECTS.reduce((s, b) => s + b.h, 0) + (TOWER_N - 1) * GAP; // ~408
const TOWER_TOP = 112;                                   // visual top of the stack (fills the upper canvas)
const BASE_Y = TOWER_TOP + STACK_H;                      // top of foundation slot (~520)
const SLOT_Y = BASE_Y + BH / 2;                          // slot center
const PLAT_Y = BASE_Y + BH + 16;                         // platform center
const TRAY_Y = 660;                                      // gold "ready" position
const slot = { x: CX, y: SLOT_Y };
const goldHome = { x: CX, y: TRAY_Y };

// Camera framing: fit to the CONTENT box (not the whole 400×720 canvas) so the
// scene fills the screen with minimal dead sky/ground. CONTENT_HALF_W is the
// tower's worst-case lean half-width (measured in ?dbg via __ff.maxhw) + a safety
// margin, so a hard lurch never clips off-screen; the vertical span is tight to
// text → tower → gold tray, trimming the empty bands top & bottom.
const LEAN_XMAX = 156;        // soft-wall: max rendered half-width (design px) the stack may reach
const CONTENT_HALF_W = 174;  // framed half-width = LEAN_XMAX + safety margin
const TEXT_W = CONTENT_HALF_W * 2 - 28; // max text width that stays inside the framed view (~316)
const CONTENT_TOP = 44;
const CONTENT_BOT = 666;

type State = "boot" | "wobble" | "pause" | "drag" | "success" | "end";

async function main(): Promise<void> {
  const app = new Application();
  // Render at the device's native pixel density (capped) so edges stay crisp on
  // high-DPI / retina phones instead of being upscaled into jaggies. autoDensity
  // keeps the CSS size logical, so all app.screen-based layout math is unchanged.
  await app.init({
    resizeTo: window,
    background: BG,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 3),
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  await preloadTextures();
  // Wait for the embedded premium font so Pixi measures & renders text with it
  // (not the fallback). Times out gracefully if the face is missing (dev preview).
  await Promise.race([
    (async () => { try { await (document as Document).fonts.load('800 30px "Baloo 2"'); await (document as Document).fonts.ready; } catch (e) { void e; } })(),
    new Promise((r) => setTimeout(r, 1500)),
  ]);

  // Layers (design space).
  const root = new Container();
  app.stage.addChild(root);
  const bgLayer = new Container();
  const scene = new Container();      // platform + ambient
  const slotLayer = new Container();  // foundation slot outline + glow
  const tower = new Container();      // rotating debt stack
  const gold = new Container();       // draggable Life Insurance block
  const fx = new Container();         // bursts
  const hand = new Container();       // drag hint
  const hud = new Container();        // hook + success text
  const ui = new Container();         // persistent UI (sound toggle)
  const overlay = new Container();    // end card
  root.addChild(bgLayer, scene, slotLayer, tower, gold, fx, hand, hud, ui, overlay);

  // State.
  let state: State = "boot";
  let dragging = false;
  let dragStarted = false;
  let succeeded = false;
  let autoPlaying = false;
  let bouncing = false;
  let interacted = false;
  let idleMs = 0;
  let grabDX = 0, grabDY = 0;
  const dragTarget = { x: goldHome.x, y: goldHome.y };
  const blocks: Container[] = [];
  // ── Articulated-stack physics ───────────────────────────────────────────────
  // The tower is a chain of rigid segments (one per block) hinged at each joint.
  // Every joint runs a torsional spring toward its baked rest lean, viscous
  // damping, a top-heavy gravity torque that *destabilises* (positive feedback —
  // the further it leans, the harder it keeps going), and a ramping random drive.
  // The emergent motion teeters and lurches like a real loose stack instead of a
  // scripted sine. One sim covers every beat: the build-up, the held near-fall
  // (gravity off, faint tremble), and the success straighten (stiff, rest→0).
  const ang: number[] = [];       // absolute tilt of each block (rad)
  const vel: number[] = [];       // angular velocity
  const restRel: number[] = [];   // baked rest angle at joint i (block i vs i-1)
  const leanBias: number[] = [];  // one-sided lean per joint, scaled by phys.lean
  const halfH: number[] = [];     // half segment length (block half-height + thickness)
  const halfW: number[] = [];     // half object width (for the horizontal soft-wall)
  const loadAbove: number[] = []; // gravity / drive weighting per joint
  const stiffMul: number[] = [];  // per-joint stiffness (base rigid, upper joints loose)
  // Live gains, tweened by the FSM (gsap) at each beat. rest 1→0 straightens the
  // stack on success; lean 0→1 tips it to the near-fall brink at the pause.
  const phys = { grav: 0, noise: 0, lean: 0, rest: 1, stiff: 58, damp: 5.6, sway: 0 };
  const LEAN_REF = 0.44;          // tilt (rad) read as "fully leaning" for the mood drive
  const SWAY_FREQ = 1.35;         // rad/s of the slow, weighted balancing wave
  let physReady = false;
  let swayPhase = 0;              // ever-advancing phase of the continuous sway
  let dustT = 0;                  // throttles clay-dust emission while straining
  let lurchT = 0, lurchEvery = 1100; // cadence of the recurring near-topple jolts
  let dbgMaxHW = 0; // DBG-only: running worst-case tower half-width (lean clip check)
  // Background: three stacked full-viewport states (calm base, tension, rescue)
  // crossfaded by setMood() on FSM transitions. `moodOverlay` is the procedural
  // fallback (a tintable full-screen wash) when the bg textures are absent.
  const bgSprites: (Sprite | null)[] = [];
  let moodOverlay: Graphics | null = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function fit(t: Text, maxW: number): void {
    t.scale.set(1);
    if (t.width > maxW) t.scale.set(maxW / t.width);
  }
  function d2(ax: number, ay: number, bx: number, by: number): number {
    return Math.hypot(ax - bx, ay - by);
  }
  function track(ev: string, data?: unknown): void {
    try { window.dispatchEvent(new CustomEvent("playable:" + ev, { detail: data })); } catch (e) { void e; }
    if (typeof HOST.playableTrack === "function") HOST.playableTrack(ev, data);
    try { console.log("[track]", ev, data ?? ""); } catch (e) { void e; }
  }
  function fireCTA(): void {
    track("cta_clicked");
    sfx.cta();
    // Meta routes the install via this hook (validator requires the literal).
    try { window.FbPlayableAd.onCTAClick(); } catch (e) { void e; }
    // MRAID networks open the store URL directly when one is configured.
    if (HOST.mraid && HOST.mraid.open && CTA_TARGET) {
      try { HOST.mraid.open(CTA_TARGET); } catch (e) { void e; }
    }
  }
  function firstInteraction(): void {
    unlockAudio(); // resume the audio context on a real gesture
    if (interacted) return;
    interacted = true;
    track("first_interaction");
  }

  // ── Soft-clay primitives (procedural greybox; generated sprites swap in) ──────
  // Soft contact shadow (stacked translucent ellipses — no filter dependency).
  function contactShadow(w: number, h: number): Container {
    const c = new Container();
    for (let i = 0; i < 3; i++) {
      c.addChild(
        new Graphics()
          .ellipse(0, h / 2 + 6 + i * 2, w * (0.42 - i * 0.05), 9 - i * 2)
          .fill({ color: 0x223247, alpha: 0.07 }),
      );
    }
    return c;
  }
  // Procedural matte clay body with a top sheen and a base shade.
  function clayBody(w: number, h: number, base: number): Graphics {
    const g = new Graphics();
    g.roundRect(-w / 2, -h / 2, w, h, R).fill({ color: base });
    g.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.4, R - 4).fill({ color: 0xffffff, alpha: 0.14 }); // sheen
    g.roundRect(-w / 2 + 5, h / 2 - 7, w - 10, 4, 2).fill({ color: 0x000000, alpha: 0.1 });             // base shade
    g.roundRect(-w / 2, -h / 2, w, h, R).stroke({ width: 1.5, color: shade(base, -0.22), alpha: 0.5 });
    return g;
  }
  // A block sized to exactly w×h: a generated clay sprite (optionally tinted) when
  // `key` is present in cfg.assets, else the procedural clay body. Always carries a
  // soft contact shadow so sprite and procedural blocks share the same depth.
  function blockBody(key: string, w: number, h: number, fallback: number, tint?: number): Container {
    const c = new Container();
    c.addChild(contactShadow(w, h));
    const t = tex(key);
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0.5);
      sp.width = w;
      sp.height = h; // force exact block dims (don't keep source aspect)
      if (tint !== undefined) sp.tint = tint;
      c.addChild(sp);
    } else {
      c.addChild(clayBody(w, h, tint ?? fallback));
    }
    return c;
  }
  function blockLabel(label: string, color: string, w: number): Text {
    const t = new Text({ text: label, style: { fill: color, fontFamily: FONT, fontWeight: "800", fontSize: 23 } });
    t.anchor.set(0.5);
    fit(t, w * 0.84);
    return t;
  }

  // ── Background (3 generated emotional states, crossfaded; else procedural) ──────
  function buildBg(): void {
    const keys = ["bg.webp", "bg-tension.webp", "bg-rescue.webp"];
    if (tex("bg.webp")) {
      // Stack calm (bottom) → tension → rescue (top). Only calm starts visible;
      // upper layers fade in over it on demand (they're opaque, so alpha = a clean
      // crossfade). Sized to cover the viewport in layout().
      keys.forEach((k, i) => {
        const t = tex(k);
        const sp = t ? new Sprite(t) : null;
        if (sp) {
          sp.alpha = i === 0 ? 1 : 0;
          app.stage.addChildAt(sp, i);
        }
        bgSprites[i] = sp;
      });
      return;
    }
    // Procedural fallback: gradient + a tintable mood wash driven by setMood().
    const top = shade(BG, 0.42), bot = shade(BG, -0.05);
    const bands = 28;
    const g = new Graphics();
    for (let i = 0; i < bands; i++) {
      const c = lerpColor(top, bot, i / (bands - 1));
      g.rect(0, (DH / bands) * i, DW, DH / bands + 1).fill({ color: c });
    }
    bgLayer.addChild(g);
    moodOverlay = new Graphics().rect(0, 0, DW, DH).fill({ color: 0xffffff });
    moodOverlay.alpha = 0;
    bgLayer.addChild(moodOverlay);
  }
  // Crossfade the backdrop through three emotional beats: calm (wobble start) →
  // tension (near-fall) → rescue (foundation secured).
  function setMood(mood: "calm" | "tension" | "rescue", dur = 0.9): void {
    if (bgSprites.length) {
      if (bgSprites[1]) gsap.to(bgSprites[1], { alpha: mood === "calm" ? 0 : 1, duration: dur, ease: "sine.inOut" });
      if (bgSprites[2]) gsap.to(bgSprites[2], { alpha: mood === "rescue" ? 1 : 0, duration: dur, ease: "sine.inOut" });
      return;
    }
    if (moodOverlay) {
      const c = mood === "tension" ? 0x16223c : mood === "rescue" ? ACCENT : 0xffffff;
      const a = mood === "tension" ? 0.5 : mood === "rescue" ? 0.3 : 0;
      moodOverlay.clear().rect(0, 0, DW, DH).fill({ color: c });
      gsap.to(moodOverlay, { alpha: a, duration: dur });
    }
  }
  // Per-frame mood drive: during the wobble buildup the tense backdrop creeps in
  // proportionally to how hard the tower is leaning, so the dread ramps smoothly
  // instead of snapping on at the pause. enterPause() then tweens it the rest of
  // the way to full tension.
  function moodDrive(): void {
    if (state !== "wobble") return;
    const a = Math.min(1, Math.abs(ang[blocks.length - 1]) / LEAN_REF) * 0.6;
    if (bgSprites[1]) { gsap.killTweensOf(bgSprites[1]); bgSprites[1].alpha = a; }
    else if (moodOverlay) {
      gsap.killTweensOf(moodOverlay);
      moodOverlay.clear().rect(0, 0, DW, DH).fill({ color: 0x16223c });
      moodOverlay.alpha = a * 0.9;
    }
  }
  function lerpColor(a: number, b: number, f: number): number {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (
      (Math.round(ar + (br - ar) * f) << 16) |
      (Math.round(ag + (bg - ag) * f) << 8) |
      Math.round(ab + (bb - ab) * f)
    );
  }

  // ── VFX / PFX (procedural, zero asset weight) ─────────────────────────────────
  // Soft clay-dust / spark puff: small fading circles drifting up & out from (x,y).
  function puff(x: number, y: number, color: number, n: number, spread: number, rise: number): void {
    for (let i = 0; i < n; i++) {
      const s = new Graphics().circle(0, 0, 1.6 + Math.random() * 3).fill({ color, alpha: 0.45 + Math.random() * 0.35 });
      s.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 0.5);
      fx.addChild(s);
      gsap.to(s, { x: s.x + (Math.random() - 0.5) * spread * 1.4, y: s.y - rise - Math.random() * rise, alpha: 0, duration: 0.5 + Math.random() * 0.45, ease: "power1.out", onComplete: () => s.destroy() });
      gsap.to(s.scale, { x: 0.3, y: 0.3, duration: 0.65, ease: "power1.out" });
    }
  }
  // Bright twinkle burst (4-point stars) — used on grab and on success.
  function sparkleBurst(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const d = 14 + Math.random() * 30;
      const s = new Graphics().star(0, 0, 4, 4.5, 1.8).fill({ color, alpha: 0.95 });
      s.position.set(x, y);
      s.rotation = Math.random() * Math.PI;
      fx.addChild(s);
      gsap.to(s, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 0.45 + Math.random() * 0.3, ease: "power2.out", onComplete: () => s.destroy() });
      gsap.fromTo(s.scale, { x: 0.2, y: 0.2 }, { x: 1, y: 1, duration: 0.2, yoyo: true, repeat: 1 });
    }
  }
  // Quick full-screen wash (white relief flash on success).
  function screenFlash(color: number, alpha: number): void {
    const f = new Graphics().rect(0, 0, DW, DH).fill({ color });
    f.alpha = 0;
    fx.addChild(f);
    gsap.to(f, { alpha, duration: 0.1, ease: "power2.out", onComplete: () => gsap.to(f, { alpha: 0, duration: 0.45, ease: "power2.in", onComplete: () => f.destroy() }) });
  }
  // Ambient drifting dust motes — subtle life in the empty studio air.
  function buildMotes(): void {
    for (let i = 0; i < 7; i++) {
      const m = new Graphics().circle(0, 0, 1.5 + Math.random() * 2).fill({ color: 0xffffff, alpha: 0.1 + Math.random() * 0.08 });
      m.position.set(Math.random() * DW, Math.random() * DH);
      bgLayer.addChild(m);
      const drift = (): void => {
        gsap.to(m, {
          y: m.y - 50 - Math.random() * 70, x: m.x + (Math.random() - 0.5) * 50,
          duration: 6 + Math.random() * 5, ease: "sine.inOut",
          onComplete: () => { m.y = DH + 8; m.x = Math.random() * DW; drift(); },
        });
      };
      gsap.delayedCall(Math.random() * 4, drift);
    }
  }
  // ── Platform ───────────────────────────────────────────────────────────────────
  function buildScene(): void {
    const plat = blockBody("platform.webp", 250, 50, shade(PRIMARY, 0.18));
    plat.position.set(CX, PLAT_Y);
    scene.addChild(plat);
  }

  // ── Foundation slot (empty, pulsing) ──────────────────────────────────────────
  const slotGlow = new Graphics();
  function buildSlot(): void {
    const recess = new Graphics();
    recess.roundRect(slot.x - BW / 2, slot.y - BH / 2, BW, BH, R).fill({ color: shade(BG, -0.16), alpha: 0.85 });
    recess.roundRect(slot.x - BW / 2, slot.y - BH / 2, BW, BH, R).stroke({ width: 3, color: ACCENT, alpha: 0.9 });
    slotLayer.addChild(recess);
    slotGlow.roundRect(slot.x - BW / 2 - 4, slot.y - BH / 2 - 4, BW + 8, BH + 8, R + 3).stroke({ width: 5, color: ACCENT });
    slotGlow.alpha = 0;
    slotLayer.addChild(slotGlow);
  }
  function pulseSlot(): void {
    gsap.killTweensOf(slotGlow);
    slotGlow.alpha = 0;
    gsap.to(slotGlow, { alpha: 0.9, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }
  function stopSlotPulse(): void {
    gsap.killTweensOf(slotGlow);
    gsap.to(slotGlow, { alpha: 0, duration: 0.3 });
  }

  // ── Debt tower ─────────────────────────────────────────────────────────────────
  function buildTower(): void {
    tower.position.set(CX, BASE_Y);
    tower.pivot.set(0, 0);
    for (let i = 0; i < TOWER_N; i++) {
      const spec = TOWER_OBJECTS[i];
      const c = new Container();
      const color = DEBT_COLORS[i % DEBT_COLORS.length];
      // Real clay object at its true aspect (w/h match the sprite) → no squish;
      // the procedural clay block is the fallback when the sprite key is absent.
      c.addChild(blockBody(spec.key, spec.w, spec.h, color));
      // Physics segment: hinged at its bottom edge, half-length = half its height.
      halfH[i] = spec.h / 2;
      halfW[i] = spec.w / 2;
      restRel[i] = spec.rest;
      leanBias[i] = 0.022 + i * 0.004; // a slight steady tip; the balancing wave sways it around this
      loadAbove[i] = 0.7 + i * 0.16;   // top objects wander & lurch the most
      stiffMul[i] = 1.5 - i * 0.13;    // base joints hold firm, upper joints wobble loose
      tower.addChild(c);
      blocks.push(c);
    }
    resetPhysics(); // seat each object at its baked rest lean
  }
  // Walk the hinged chain from the base joint upward, seating each object on top
  // of the one below at its current tilt — the stack reads as one physically
  // connected tower, not independent sprites.
  function applyPose(): void {
    let jx = 0, jy = 0; // base joint at tower-local origin (top of the slot)
    for (let i = 0; i < blocks.length; i++) {
      const a = ang[i], hH = halfH[i];
      const cx = jx + Math.sin(a) * hH;
      const cy = jy - Math.cos(a) * hH;
      blocks[i].position.set(cx, cy);
      blocks[i].rotation = a;
      jx = cx + Math.sin(a) * (hH + GAP);
      jy = cy - Math.cos(a) * (hH + GAP);
    }
  }
  // Seat every object at its baked rest lean (cumulative), motionless.
  function resetPhysics(): void {
    let acc = 0;
    for (let i = 0; i < blocks.length; i++) { acc += restRel[i] * phys.rest; ang[i] = acc; vel[i] = 0; }
    applyPose();
  }
  // One integration of the articulated stack. Per joint: a torsional spring back
  // toward its rest+lean target, a top-heavy DEstabilising gravity torque (the
  // more it leans the harder it keeps going — that positive feedback is the
  // teeter), viscous damping, and a random drive. Sub-stepped for stability;
  // angles clamped so a hard lurch never blows the sim up.
  function physicsStep(dtMs: number): void {
    if (!physReady) return;
    const dt = Math.min(dtMs, 34) / 1000;
    const sub = 3, h = dt / sub, n = blocks.length;
    swayPhase += dt * SWAY_FREQ; // continuous rocking phase (never stops while active)
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < n; i++) {
        const below = i > 0 ? ang[i - 1] : 0;
        const target = restRel[i] * phys.rest + leanBias[i] * phys.lean;
        const spring = -phys.stiff * stiffMul[i] * ((ang[i] - below) - target);
        const grav = phys.grav * Math.sin(ang[i]) * loadAbove[i];
        const damp = -phys.damp * vel[i];
        const drive = phys.noise * (Math.random() * 2 - 1) * loadAbove[i];
        // The balancing wave: two slow incommensurate travelling waves summed (so
        // it never repeats like a metronome) propagating up the chain with a phase
        // lag — the base shifts, the top trails with weight, the whole body sways
        // as one smooth wave. This is the *only* lateral drive (no jolts), and it
        // stays well under the soft wall so the motion never bounces off it.
        const rock = phys.sway * (Math.sin(swayPhase + i * 0.55) * 0.72 + Math.sin(swayPhase * 0.63 + i * 0.85 + 2.1) * 0.4) * loadAbove[i];
        vel[i] += (spring + grav + damp + drive + rock) * h;
        ang[i] += vel[i] * h;
        if (ang[i] > 0.72) { ang[i] = 0.72; vel[i] *= -0.25; }
        else if (ang[i] < -0.72) { ang[i] = -0.72; vel[i] *= -0.25; }
      }
    }
    // Soft wall: walk the chain, find the widest reaching point, and if it would
    // exceed LEAN_XMAX pull every joint proportionally back inside — so the stack
    // can lurch and teeter hard but never slides off the framed width.
    {
      let jx = 0, ext = 0;
      for (let i = 0; i < n; i++) {
        const si = Math.sin(ang[i]), co = Math.cos(ang[i]);
        const cx = jx + si * halfH[i];
        // rotated-AABB half-width of this object → matches the actual rendered bounds
        const e = Math.abs(cx) + halfW[i] * Math.abs(co) + halfH[i] * Math.abs(si);
        if (e > ext) ext = e;
        jx = cx + si * (halfH[i] + GAP);
      }
      if (ext > LEAN_XMAX) {
        const f = LEAN_XMAX / ext;
        for (let i = 0; i < n; i++) { ang[i] *= f; vel[i] *= f * 0.6; }
      }
    }
    // Soft strain ambiance while it balances on the edge: an occasional gentle
    // creak and a wisp of clay dust under the weight — NO jolts. The motion itself
    // is the smooth balancing wave above; this only adds the sense of strain.
    if ((state === "pause" || state === "drag") && !succeeded) {
      lurchT += dtMs;
      if (lurchT > lurchEvery) {
        lurchT = 0;
        lurchEvery = 1700 + Math.random() * 1500;
        sfx.creak();
        puff(CX + Math.sin(ang[n - 1]) * 34, BASE_Y - 4, 0xcdbfa6, 2, 22, 11);
      }
    }
    // Extra clay dust shaken from the strained base at the peak of the build-up.
    if (phys.grav > 30 && Math.abs(ang[n - 1]) > 0.14) {
      dustT += dtMs;
      if (dustT > 460) { dustT = 0; puff(CX + Math.sin(ang[n - 1]) * 38, BASE_Y - 4, 0xcdbfa6, 2, 22, 12); }
    }
  }

  // ── Gold "Life Insurance" block ────────────────────────────────────────────────
  const goldGlow = new Graphics();
  function buildGold(): void {
    goldGlow.ellipse(0, 0, BW * 0.62, BH * 0.95).fill({ color: ACCENT, alpha: 0.32 });
    gold.addChild(goldGlow);
    const body = blockBody("block-gold.webp", BW, BH, ACCENT);
    const label = blockLabel(GOLD_LABEL, "#3a2a08", BW);
    gold.addChild(body, label);
    gold.position.set(CX, DH + 80); // offscreen until the pause beat
    gold.visible = false;
    gold.eventMode = "none";
    gold.cursor = "pointer";
    gold.on("pointerdown", onGrab);
  }
  function pulseGoldGlow(): void {
    gsap.killTweensOf(goldGlow.scale);
    gsap.to(goldGlow.scale, { x: 1.12, y: 1.12, duration: 0.8, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // ── Drag-hint hand ──────────────────────────────────────────────────────────────
  function buildHand(): void {
    const g = new Graphics();
    g.circle(0, 0, 15).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 3, color: num("#33455a") });
    g.roundRect(-5, 8, 10, 22, 5).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 3, color: num("#33455a") });
    hand.addChild(g);
    hand.alpha = 0;
    hand.position.set(goldHome.x, goldHome.y);
  }
  function showHand(): void {
    hand.alpha = 0;
    gsap.killTweensOf(hand);
    gsap.killTweensOf(hand.scale);
    gsap.to(hand, { alpha: 1, duration: 0.3 });
    gsap.timeline({ repeat: -1 })
      .set(hand, { x: goldHome.x, y: goldHome.y })
      .to(hand.scale, { x: 0.85, y: 0.85, duration: 0.2, yoyo: true, repeat: 1 })
      .to(hand, { x: slot.x, y: slot.y, duration: 0.9, ease: "power1.inOut" })
      .to(hand, { alpha: 0.2, duration: 0.25 })
      .set(hand, { alpha: 1 }, "+=0.15");
  }
  function hideHand(): void {
    gsap.killTweensOf(hand);
    gsap.to(hand, { alpha: 0, duration: 0.2 });
  }

  // ── HUD (hook + success text) ────────────────────────────────────────────────────
  // Hook must read on BOTH the calm (light) and tension (dark slate) backdrops, so
  // the dark navy fill carries a white outline + soft shadow to lift it off either.
  const hook = new Text({ text: "", style: { fill: TXT, fontFamily: FONT, fontWeight: "800", fontSize: 30, align: "center", wordWrap: true, wordWrapWidth: TEXT_W, stroke: { color: 0xffffff, width: 4, join: "round" }, dropShadow: { color: 0x1a2940, alpha: 0.3, blur: 4, distance: 2, angle: 1.6 } } });
  function buildHud(): void {
    hook.anchor.set(0.5);
    hook.position.set(CX, 58);
    hud.addChild(hook);
  }
  // ── Sound toggle (persistent, top-right) ──────────────────────────────────────
  function buildMute(): void {
    const c = new Container();
    const icon = new Graphics();
    const redraw = (): void => {
      icon.clear();
      icon.poly([-9, -5, -3, -5, 4, -12, 4, 12, -3, 5, -9, 5]).fill({ color: TXT });
      if (!muted) {
        icon.arc(5, 0, 7, -0.7, 0.7).stroke({ width: 2.2, color: TXT });
        icon.arc(5, 0, 11, -0.7, 0.7).stroke({ width: 2.2, color: TXT });
      } else {
        icon.moveTo(7, -8).lineTo(17, 9).stroke({ width: 2.6, color: num("#b23b3b") });
        icon.moveTo(17, -8).lineTo(7, 9).stroke({ width: 2.6, color: num("#b23b3b") });
      }
    };
    redraw();
    c.addChild(new Graphics().rect(-22, -22, 44, 44).fill({ color: 0xffffff, alpha: 0.001 }), icon);
    c.position.set(366, 40);
    c.eventMode = "static";
    c.cursor = "pointer";
    c.on("pointertap", (e) => { e.stopPropagation(); muted = !muted; redraw(); if (!muted) unlockAudio(); });
    ui.addChild(c);
  }
  function setHook(s: string): void {
    hook.text = s;
    fit(hook, TEXT_W);
    if (s) gsap.fromTo(hook, { alpha: 0.3 }, { alpha: 1, duration: 0.3 });
  }
  function showSuccessText(): void {
    // Gold-on-gold (rescue backdrop) reads poorly — give the gold fill a dark brown
    // outline + shadow so "Foundation Secured!" stays crisp over the golden bloom.
    const t = new Text({ text: SUCCESS, style: { fill: shade(ACCENT, 0.12), fontFamily: FONT, fontWeight: "800", fontSize: 36, align: "center", stroke: { color: shade(ACCENT, -0.62), width: 6, join: "round" }, dropShadow: { color: 0x4a3208, alpha: 0.4, blur: 4, distance: 2, angle: 1.6 } } });
    t.anchor.set(0.5);
    t.position.set(CX, 120);
    const base = Math.min(1, TEXT_W / t.width); // fit baked into the pop so it never overflows
    t.scale.set(base * 0.6);
    t.alpha = 0;
    hud.addChild(t);
    gsap.to(t, { alpha: 1, duration: 0.3 });
    gsap.to(t.scale, { x: base, y: base, duration: 0.5, ease: "back.out(1.8)" });
  }

  // ── Pointer / drag ────────────────────────────────────────────────────────────
  function onGrab(e: { global: { x: number; y: number } }): void {
    if (state !== "drag" || succeeded) return;
    firstInteraction();
    sfx.grab();
    dragging = true;
    idleMs = 0;
    stopBounce();
    hideHand();
    const p = root.toLocal(e.global);
    grabDX = gold.x - p.x;
    grabDY = gold.y - p.y;
    gsap.to(gold.scale, { x: 1.06, y: 1.06, duration: 0.15 });
    sparkleBurst(gold.x, gold.y, ACCENT, 6); // golden twinkle on pick-up
  }
  function onMove(e: { global: { x: number; y: number } }): void {
    if (!dragging) return;
    const p = root.toLocal(e.global);
    dragTarget.x = p.x + grabDX;
    dragTarget.y = p.y + grabDY;
    idleMs = 0;
    if (!dragStarted && d2(gold.x, gold.y, goldHome.x, goldHome.y) > 16) {
      dragStarted = true;
      track("block_dragged");
    }
  }
  function onRelease(): void {
    if (!dragging || succeeded) return;
    dragging = false;
    gsap.to(gold.scale, { x: 1, y: 1, duration: 0.15 });
    // Not snapped → ease back to the tray and keep hinting.
    dragTarget.x = goldHome.x;
    dragTarget.y = goldHome.y;
    gsap.to(gold, { x: goldHome.x, y: goldHome.y, duration: 0.4, ease: "power2.out" });
  }

  // ── Idle / failsafe ──────────────────────────────────────────────────────────
  function startBounce(): void {
    if (bouncing) return;
    bouncing = true;
    gsap.to(gold, { y: goldHome.y - 22, duration: 0.32, yoyo: true, repeat: -1, ease: "power1.inOut" });
  }
  function stopBounce(): void {
    if (!bouncing) return;
    bouncing = false;
    gsap.killTweensOf(gold);
    gold.y = goldHome.y;
  }
  function idleTick(dtMs: number): void {
    if (MANUAL || state !== "drag" || dragging || succeeded || autoPlaying) return;
    idleMs += dtMs;
    if (idleMs >= IDLE_BOUNCE) startBounce();
    if (idleMs >= AUTO_PLAY) autoPlay();
  }
  function autoPlay(): void {
    if (succeeded || autoPlaying) return;
    autoPlaying = true;
    track("failsafe_triggered");
    stopBounce();
    hideHand();
    dragging = false;
    gsap.to(gold, { x: slot.x, y: slot.y, duration: 0.7, ease: "power2.inOut", onComplete: () => snapSuccess(true) });
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  function snapSuccess(auto: boolean): void {
    if (succeeded) return;
    succeeded = true;
    state = "success";
    sfx.snap();
    dragging = false;
    stopBounce();
    gold.eventMode = "none";
    gsap.killTweensOf(gold); // drop any in-flight fly-in / return / bounce tween
    gsap.killTweensOf(goldGlow.scale);
    goldGlow.scale.set(1);
    gsap.to(gold, { x: slot.x, y: slot.y, rotation: 0, duration: auto ? 0.06 : 0.16, ease: "back.out(2.2)", onComplete: runSuccess });
    gsap.to(gold.scale, { x: 1, y: 1, duration: 0.16 });
  }
  function runSuccess(): void {
    track("foundation_secured");
    sfx.success();
    setMood("rescue", 1.15); // backdrop blooms warm & golden, gradually — the tower is saved
    screenFlash(0xffffff, 0.5);
    impulse();
    stopSlotPulse();
    hideHand();
    // The whole stack snaps from its precarious lean into a solid, aligned column:
    // gravity & jitter off, lean off, rest→0 (vertical), springs stiffen to settle.
    for (let i = 0; i < blocks.length; i++) vel[i] = 0;
    gsap.to(phys, { grav: 0, noise: 0, lean: 0, rest: 0, stiff: 150, damp: 13, sway: 0, duration: 0.5, ease: "power2.out" });
    setHook("");
    showSuccessText();
    if (!MANUAL) gsap.delayedCall(SUCCESS_HOLD / 1000, showEndcard); // ?step: __ff.step() advances manually
  }
  function impulse(): void {
    // Golden ring expanding from the slot.
    const ring = new Graphics().circle(0, 0, 36).stroke({ width: 10, color: ACCENT, alpha: 0.95 });
    ring.position.set(slot.x, slot.y);
    ring.scale.set(0.4);
    fx.addChild(ring);
    gsap.to(ring.scale, { x: 5.5, y: 5.5, duration: 0.7, ease: "power2.out" });
    gsap.to(ring, { alpha: 0, duration: 0.7, ease: "power1.out", onComplete: () => ring.destroy() });
    // Energy washing up the tower.
    const beam = new Graphics().roundRect(slot.x - BW / 2, TOWER_TOP, BW, STACK_H + BH, R).fill({ color: ACCENT, alpha: 0 });
    fx.addChild(beam);
    gsap.timeline({ onComplete: () => beam.destroy() })
      .to(beam, { alpha: 0.35, duration: 0.18 })
      .to(beam, { alpha: 0, duration: 0.6, ease: "power1.out" });
    for (let i = 0; i < 10; i++) {
      const s = new Graphics().circle(0, 0, 3 + Math.random() * 3).fill({ color: ACCENT, alpha: 0.9 });
      s.position.set(slot.x + (Math.random() - 0.5) * BW, slot.y);
      fx.addChild(s);
      gsap.to(s, { y: s.y - 120 - Math.random() * 160, alpha: 0, duration: 0.7 + Math.random() * 0.3, ease: "power1.out", onComplete: () => s.destroy() });
    }
    // Twinkle burst at the slot + sparkles racing up the secured column.
    sparkleBurst(slot.x, slot.y, ACCENT, 14);
    for (let i = 0; i < TOWER_N; i++) {
      gsap.delayedCall(0.12 + i * 0.07, () => sparkleBurst(CX + blocks[i].x + (Math.random() - 0.5) * 40, BASE_Y + blocks[i].y, shade(ACCENT, 0.2), 4));
    }
    // Golden confetti raining down over the saved tower.
    for (let i = 0; i < 18; i++) {
      const c = new Graphics().roundRect(-2.5, -4, 5, 8, 1.5).fill({ color: i % 3 ? ACCENT : shade(ACCENT, 0.25), alpha: 0.95 });
      c.position.set(CX + (Math.random() - 0.5) * 280, 280 + Math.random() * 40);
      c.rotation = Math.random() * Math.PI;
      fx.addChild(c);
      gsap.to(c, { y: c.y + 200 + Math.random() * 220, rotation: c.rotation + (Math.random() - 0.5) * 8, alpha: 0, duration: 1.1 + Math.random() * 0.7, ease: "power1.in", onComplete: () => c.destroy() });
      gsap.to(c, { x: c.x + (Math.random() - 0.5) * 120, duration: 1.4, ease: "sine.inOut" });
    }
  }

  // ── End card ──────────────────────────────────────────────────────────────────
  function showEndcard(): void {
    if (state === "end") return;
    state = "end";
    ui.visible = false; // hide the sound toggle on the end card
    // The scene recedes (alpha) so the bright gold block stays the focus.
    gsap.to([tower, slotLayer, scene], { alpha: 0.2, duration: 0.5 });
    gsap.to(hud, { alpha: 0, duration: 0.4 }); // clear the hook / success text
    // Transparent full-screen catcher: any tap on the end card fires the CTA.
    const catcher = new Graphics().rect(0, 0, DW, DH).fill({ color: 0xffffff, alpha: 0.001 });
    catcher.eventMode = "static";
    catcher.on("pointertap", fireCTA);
    overlay.addChild(catcher);
    overlay.eventMode = "static";

    gsap.to(gold, { x: CX, y: 250, duration: 0.6, ease: "power2.inOut" });
    gsap.to(gold.scale, { x: 1.3, y: 1.3, duration: 0.6, ease: "power2.inOut" });
    gsap.killTweensOf(goldGlow.scale);
    gsap.to(goldGlow.scale, { x: 1.18, y: 1.18, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut" });

    const headline = new Text({ text: HEADLINE, style: { fill: TXT, fontFamily: FONT, fontWeight: "800", fontSize: 26, align: "center", wordWrap: true, wordWrapWidth: TEXT_W } });
    headline.anchor.set(0.5);
    headline.position.set(CX, 110);
    headline.alpha = 0;
    overlay.addChild(headline);
    gsap.to(headline, { alpha: 1, duration: 0.4, delay: 0.2 });

    // Primary CTA.
    const cta = new Container();
    const cw = 300, ch = 70;
    cta.addChild(new Graphics().roundRect(-cw / 2, -ch / 2, cw, ch, ch / 2).fill({ color: ACCENT }).stroke({ width: 4, color: shade(ACCENT, -0.3) }));
    const ctaT = new Text({ text: cfg.copy.cta, style: { fill: "#3a2a08", fontFamily: FONT, fontWeight: "800", fontSize: 27 } });
    ctaT.anchor.set(0.5);
    fit(ctaT, cw * 0.84);
    cta.addChild(ctaT);
    cta.position.set(CX, 470);
    cta.eventMode = "static";
    cta.cursor = "pointer";
    cta.on("pointertap", (e) => { e.stopPropagation(); fireCTA(); });
    overlay.addChild(cta);
    gsap.to(cta.scale, { x: 1.05, y: 1.05, duration: 1.2, yoyo: true, repeat: -1, ease: "sine.inOut" });

    // Replay (QA / optional).
    const replay = new Text({ text: "↻ Replay", style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "800", fontSize: 20 } });
    replay.anchor.set(0.5);
    replay.position.set(CX, 540);
    replay.eventMode = "static";
    replay.cursor = "pointer";
    replay.on("pointertap", (e) => { e.stopPropagation(); resetAll(); });
    overlay.addChild(replay);
  }

  // ── Reset (replay) ──────────────────────────────────────────────────────────
  function resetAll(): void {
    overlay.removeChildren();
    overlay.eventMode = "none";
    fx.removeChildren();
    // Clear the success text (everything in hud after the hook).
    while (hud.children.length > 1) hud.removeChildAt(1);
    hud.alpha = 1;
    gsap.killTweensOf(gold);
    gsap.killTweensOf(gold.scale);
    gsap.killTweensOf(goldGlow.scale);
    goldGlow.scale.set(1);
    succeeded = false; autoPlaying = false; dragging = false; dragStarted = false; bouncing = false;
    interacted = false; idleMs = 0;
    phys.grav = 0; phys.noise = 0; phys.lean = 0; phys.rest = 1; phys.stiff = 58; phys.damp = 5.6; phys.sway = 0;
    physReady = false; lurchT = 0; lurchEvery = 1100;
    tower.rotation = 0; tower.alpha = 1; slotLayer.alpha = 1; scene.alpha = 1;
    resetPhysics();
    gold.visible = false; gold.eventMode = "none"; gold.scale.set(1); gold.rotation = 0;
    gold.position.set(CX, DH + 80);
    ui.visible = true;
    setHook("");
    start();
  }

  // ── Flow ──────────────────────────────────────────────────────────────────────
  function start(): void {
    state = "wobble";
    setHook(HOOK);
    setMood("calm"); // calm at the start of the wobble (crossfades back on replay)
    track("game_start");
    physReady = true;
    gsap.delayedCall(WOBBLE_START / 1000, () => {
      // The stack loosens and the teeter escalates — gravity, jitter & lurch
      // strength all ramp up while damping eases off so the sway lingers.
      gsap.to(phys, { grav: 16, noise: 4, damp: 4.8, sway: 1.1, duration: 2.8, ease: "power1.inOut" });
    });
    if (!MANUAL) gsap.delayedCall(PAUSE_AT / 1000, enterPause);
  }
  function enterPause(): void {
    if (state !== "wobble") return;
    state = "pause";
    // Freeze the teeter at a critical lean — the near-fall beat. Gravity eases off
    // and the springs hold the stack tipped at the brink with only a faint nervous
    // tremble; the backdrop darkens and anxious sparks flick off the top object.
    // Hold the stack tipped at the brink but keep it visibly fighting gravity —
    // strong strain, light damping and ongoing lurches, NOT a parked freeze.
    gsap.to(phys, { grav: 9, noise: 3, lean: 1, stiff: 45, damp: 4.4, sway: 2.4, duration: 0.7, ease: "power2.out" });
    setMood("tension", 0.5); // snap the rest of the way to full dread at the brink
    sfx.creak();
    puff(CX + 34, BASE_Y - 2, 0xcdbfa6, 7, 60, 20);
    const top = blocks.length - 1;
    sparkleBurst(CX + blocks[top].x + 14, BASE_Y + blocks[top].y - 8, 0xe8a23a, 5);
    // Gold block flies in from the bottom.
    gold.visible = true;
    gold.position.set(CX, DH + 80);
    gsap.to(gold, { y: goldHome.y, duration: 0.6, ease: "back.out(1.4)", onComplete: enterDrag });
    sfx.pop();
    pulseGoldGlow();
    pulseSlot();
  }
  function enterDrag(): void {
    if (succeeded) return;
    state = "drag";
    idleMs = 0;
    gold.eventMode = "static";
    showHand();
  }

  // ── Ticker (wobble + drag-follow + snap + idle) ──────────────────────────────
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS;
    layout(); // re-fit every frame: some hosts resize the canvas without a JS resize event
    physicsStep(dt);
    applyPose();
    if (DBG) { const b = tower.getLocalBounds(); const hw = Math.max(Math.abs(b.minX), Math.abs(b.maxX)); if (hw > dbgMaxHW) dbgMaxHW = hw; }
    moodDrive(); // tension creeps in proportionally as the tower leans harder
    if (state === "drag" && dragging && !succeeded) {
      gold.x += (dragTarget.x - gold.x) * DRAG_LAG;
      gold.y += (dragTarget.y - gold.y) * DRAG_LAG;
      if (d2(gold.x, gold.y, slot.x, slot.y) < SNAP_DIST) snapSuccess(false);
    }
    idleTick(dt);
  });

  // ── Layout — fit the content box into the viewport (contain), centred on the
  // tower. Zooms closer than full-canvas contain so there's little dead sky/ground,
  // while CONTENT_HALF_W guarantees the leaning tower never clips off the sides. ──
  function layout(): void {
    const sw = app.screen.width, sh = app.screen.height;
    const s = Math.min(sw / (CONTENT_HALF_W * 2), sh / (CONTENT_BOT - CONTENT_TOP));
    root.scale.set(s);
    root.position.set(sw / 2 - CX * s, sh / 2 - ((CONTENT_TOP + CONTENT_BOT) / 2) * s);
    for (const sp of bgSprites) { if (sp) { sp.width = sw; sp.height = sh; } } // cover gutters
  }

  // ── Build + start ──────────────────────────────────────────────────────────────
  buildBg();
  buildMotes();
  buildScene();
  buildSlot();
  buildTower();
  buildGold();
  buildHand();
  buildHud();
  buildMute();
  layout();
  window.addEventListener("resize", layout);
  app.stage.on("globalpointermove", onMove);
  app.stage.on("pointerup", onRelease);
  app.stage.on("pointerupoutside", onRelease);
  app.stage.on("pointerdown", firstInteraction);

  track("ad_loaded");
  start();

  // QA hook (only with ?dbg): drive the FSM deterministically from the console.
  if (DBG) {
    HOST.__ff = {
      get state() { return state; },
      step: () => {
        if (state === "wobble") enterPause();
        else if (state === "pause") enterDrag();
        else if (state === "drag") snapSuccess(false);
        else if (state === "success") showEndcard();
      },
      drag: () => { if (state === "drag") { firstInteraction(); track("block_dragged"); } },
      snap: () => snapSuccess(false),
      auto: () => autoPlay(),
      end: () => showEndcard(),
      cta: () => fireCTA(),
      reset: () => resetAll(),
      shot: () => app.renderer.extract.base64({ target: app.stage }),
      maxhw: () => dbgMaxHW,
      reseths: () => { dbgMaxHW = 0; },
    };
  }

  // Ensure the static validator sees the CTA hook is wired.
  void (() => window.FbPlayableAd.onCTAClick);
}

main().catch((e) => {
  // Surface boot failures instead of swallowing them silently.
  // eslint-disable-next-line no-console
  console.error("Financial Foundation failed to start:", e);
});
