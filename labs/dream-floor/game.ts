// Dream Floor — 3/4 cozy US living-room flooring renovation playable (Stage 1 greybox).
// PixiJS v8 + GSAP. Procedural visuals by default; swaps to generated sprites when a
// matching key is present in cfg.assets (same pattern as templates/mad-mage-tower).
// Portrait 9:16. FSM: intro → couch → carpet → crowbar → plank → finish → reveal → end.
//
// Boot hardening (do NOT regress):
//  - preloadTextures uses onload/onerror, NEVER img.decode() — decode() never settles
//    in a hidden/throttled tab (document.hidden===true) and would hang the whole boot.
//  - main().catch surfaces boot errors instead of swallowing them.
//  - ?dbg exposes window.__ftf for deterministic QA + frame capture via renderer.extract.
import { Application, Container, Graphics, Matrix, PerspectiveMesh, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// ── Tunables (manifest defaults; brief params override) ───────────────────────
const COUCH_TILT = Number(cfg.params.couchTiltDeg ?? 7);
const HOOK_DELAY = Number(cfg.params.hookDelayMs ?? 1500);
const IDLE_HINT = Number(cfg.params.idleHintMs ?? 3000);
const AUTO_DEMO_AFTER = Number(cfg.params.autoDemoAfterIdles ?? 2);
const STEP_MS = Number(cfg.params.stepAnimMs ?? 500);
const PLANKS = Number(cfg.params.plankCount ?? 5);
const REVEAL_HOLD = Number(cfg.params.revealHoldMs ?? 2500);
const STEP = STEP_MS / 1000;

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
const TXT = cfg.style.colors.text;
const FONT = cfg.style.font.family;

// ── Asset swap-in (Stage 2): procedural fallback when key absent ──────────────
const TEX: Record<string, Texture> = {};
async function preloadTextures(): Promise<void> {
  // Load events (not img.decode()): onload/onerror always fire, even in a hidden tab.
  await Promise.all(
    Object.entries(cfg.assets).map(
      ([k, uri]) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            TEX[k] = Texture.from(img);
            resolve();
          };
          img.onerror = () => resolve(); // leave key unset → procedural fallback
          img.src = uri;
        }),
    ),
  );
}
function tex(key: string): Texture | null {
  return TEX[key] ?? null;
}
// Use a sprite for `key` sized to w (height auto), else run the procedural draw.
function spriteOr(key: string, w: number, draw: () => Container): Container {
  const t = tex(key);
  if (!t) return draw();
  const sp = new Sprite(t);
  sp.anchor.set(0.5);
  sp.width = w;
  sp.scale.y = sp.scale.x;
  const c = new Container();
  c.addChild(sp);
  return c;
}
// Vertical slice i of n from a floor texture (per-plank art), else null.
function stripTexture(key: string, i: number, n: number, inset = 0): Texture | null {
  const base = tex(key);
  if (!base) return null;
  const sw = base.width / n;
  return new Texture({ source: base.source, frame: new Rectangle(i * sw + inset, 0, sw - 2 * inset, base.height) });
}
// Map a texture onto a 4-corner quad (perspective-correct) — q = [TLx,TLy, TRx,TRy, BRx,BRy, BLx,BLy].
function quadMesh(t: Texture, q: number[]): PerspectiveMesh {
  return new PerspectiveMesh({ texture: t, verticesX: 8, verticesY: 10, x0: q[0], y0: q[1], x1: q[2], y1: q[3], x2: q[4], y2: q[5], x3: q[6], y3: q[7] });
}

// ── Design canvas (fixed portrait 9:16; scaled to fit the viewport — no reflow) ─
const DW = 540, DH = 960;
const WALLY = 380;                              // wall|floor split
const FCx = DW / 2;                             // floor / room centre x (270)

// ── Floor-plane geometry (2-point perspective), measured from room-bg.webp ─────
// The painted floorboards run on a DIAGONAL to VP1 (off the upper-right); cross-joints recede
// to VP2 (off the upper-left); both lie on the horizon. We replace the ENTIRE floor — the
// broadloom carpet, the rotten boards, the bare subfloor and the new boards all cover the full
// painted-floor region, and the diagonal boards run PARALLEL to the painted ones.
interface Pt { x: number; y: number }
const HORIZON = 178;                       // floor horizon (design y) — both VPs sit on it
const VP1: Pt = { x: 1478, y: HORIZON };   // plank-direction VP (up-right) — hand-tuned in ?floor
const VP2: Pt = { x: -1212, y: HORIZON };  // cross-joint VP — butt-joints run toward this (hand-tuned in ?floor)
const lineISect = (a: Pt, b: Pt, c: Pt, d: Pt): Pt => {
  const a1 = b.y - a.y, b1 = a.x - b.x, c1 = a1 * a.x + b1 * a.y;
  const a2 = d.y - c.y, b2 = c.x - d.x, c2 = a2 * c.x + b2 * c.y;
  const det = a1 * b2 - a2 * b1 || 1e-9;
  return { x: (b2 * c1 - b1 * c2) / det, y: (a1 * c2 - a2 * c1) / det };
};

// Whole-floor work region = the painted floor's outline, traced by hand in ?floor as a 6-point
// polygon (BL, BR, MR, FR, FL, ML clockwise). Boards (toward VP1) overshoot it and are clipped to
// it by the floor mask; the carpet / subfloor / rotten / new floor all fill it.
const FLOOR_PTS: Pt[] = [
  { x: 245, y: 399 },   // BL — back, at the baseboard (hand-tuned in ?floor)
  { x: 695, y: 470 },   // BR — back-right (past the right wall)
  { x: 562, y: 930 },   // MR — right side
  { x: -74, y: 1060 },  // FR — front (below the screen → full-bleed bottom)
  { x: -160, y: 488 },  // FL — left
  { x: -20, y: 448 },   // ML — left side
];
const floorRegion = FLOOR_PTS.flatMap((p) => [p.x, p.y]);
const _FC = FLOOR_PTS;

// Diagonal boards toward VP1. Parameterise each by where its VP1-line crosses the back
// (baseboard) row; the crossing range [BX0,BX1] covers every floor corner. Boards overshoot
// the region top/bottom; the floor mask trims them to the room-aligned floor.
const _BKY = Math.min(..._FC.map((p) => p.y)), _FRY = Math.max(..._FC.map((p) => p.y));
const _backXof = (p: Pt): number => VP1.x + ((p.x - VP1.x) * (_BKY - VP1.y)) / (p.y - VP1.y);
const _bxs = _FC.map(_backXof);
const BX0 = Math.min(..._bxs) - 8, BX1 = Math.max(..._bxs) + 8;
void PLANKS;                                                     // (legacy param; width now hand-set below)
const PLANK_N = 30;                                              // planks ACROSS the width (hand-set)
const _boardPt = (backX: number, Y: number): Pt => {
  const t = (Y - VP1.y) / (_BKY - VP1.y);
  return { x: VP1.x + (backX - VP1.x) * t, y: Y };
};
const FAR_Y = _BKY - 14, NEAR_Y = _FRY + 14;
// Each column is split along its length into SEGMENTS = individual planks laid end-to-end, with
// perspective-spaced butt-joints (compress toward the back) and a half-plank STAGGER between
// adjacent columns (brick bond) — like a real floor / the painted room-bg.
const PLANK_ROWS = 6;                                  // planks deep
const _invN = 1 / (NEAR_Y - VP1.y), _invF = 1 / (FAR_Y - VP1.y);
const _jointY = (k: number): number => VP1.y + 1 / (_invN + (_invF - _invN) * (k / PLANK_ROWS));
interface PlankGeo { ox: number; oy: number; quad: number[]; wBack: number; wFront: number; grain: number; flip: boolean }
const plankGeo: PlankGeo[] = [];
for (let i = 0; i < PLANK_N; i++) {
  const bxL = BX0 + ((BX1 - BX0) * i) / PLANK_N, bxR = BX0 + ((BX1 - BX0) * (i + 1)) / PLANK_N;
  const cbx = (bxL + bxR) / 2;                          // column centre
  const v1L = _boardPt(bxL, NEAR_Y), v1R = _boardPt(bxR, NEAR_Y);   // a point on each side's VP1-line
  const off = (i % 2) * 0.5;                            // brick stagger: odd columns shift half a plank
  for (let k = 0; k <= PLANK_ROWS; k++) {
    const ka = Math.max(0, k - off), kb = Math.min(PLANK_ROWS, k + 1 - off);
    if (kb - ka < 0.05) continue;
    // butt-joints run toward VP2: each joint is the VP2-line through the column centre at the
    // perspective joint-row, so corners = (side VP1-line) ∩ (joint VP2-line) — not a flat cut.
    const jNear = _boardPt(cbx, _jointY(ka)), jFar = _boardPt(cbx, _jointY(kb));
    const fL = lineISect(v1L, VP1, jFar, VP2), fR = lineISect(v1R, VP1, jFar, VP2);
    const nR = lineISect(v1R, VP1, jNear, VP2), nL = lineISect(v1L, VP1, jNear, VP2);
    const ox = fL.x, oy = fL.y;
    plankGeo.push({
      ox, oy,
      quad: [fL.x - ox, fL.y - oy, fR.x - ox, fR.y - oy, nR.x - ox, nR.y - oy, nL.x - ox, nL.y - oy],
      wBack: fR.x - fL.x, wFront: nR.x - nL.x,
      grain: (i + k) % 3, flip: (i + k) % 2 === 1,
    });
  }
}
// Floor outline (= the whole region) + bbox for subfloor / gloss / work-zone / fx.
const patchPoly = floorRegion;
const _PX = _FC.map((p) => p.x), _PY = _FC.map((p) => p.y);
const PXmin = Math.min(..._PX), PXmax = Math.max(..._PX), PYmin = Math.min(..._PY), PYmax = Math.max(..._PY);
const PCx = (PXmin + PXmax) / 2, PCy = (PYmin + PYmax) / 2;

// Broadloom carpet covers the WHOLE floor (texture-filled across the floor polygon). It is
// "pulled up" by peeling toward the back wall — scale.y → 0 about the back-centre pivot.
const CARPET_PIVOT: Pt = { x: PCx, y: PYmin };
const CARPET_REPEATS = PLANK_N;   // carpet tiles as many times across as the new floor has planks (density match)
// Couch resting (hook) position (on the carpet) + pushed-back position (further back).
const COUCHX = 270, COUCHY = 556;
const COUCH_BACKX = 270, COUCH_BACKY = 430, COUCH_BACK_SCALE = 0.52;

const HINTS: Record<string, string> = {
  couch: "Something's not right… Move the couch",
  carpet: "Pull up the rug",
  crowbar: "Pry out the rotten boards",
  plank: "Lay the new planks",
  finish: "Seal it with a glossy finish",
  reveal: "Beautiful. Real floors, real easy.",
};

type State = "intro" | "couch" | "carpet" | "crowbar" | "plank" | "finish" | "reveal" | "end";

async function main(): Promise<void> {
  // The warm "beyond" space seen THROUGH the open side portals and filling the gutters.
  const BEYOND_WALL = num("#c9bd9f"), BEYOND_FLOOR = num("#b3a384");
  const app = new Application();
  // antialias off under ?dbg only: headless SwiftShader can't init the MSAA-resolve
  // shader and drops batched draws (QA renders come out partial). Real ad keeps AA.
  // Background = the warm beyond tone, so letterbox gutters read as adjacent space, not a cold void.
  await app.init({ resizeTo: window, background: BEYOND_WALL, antialias: !/dbg/.test(location.search) });
  document.body.appendChild(app.canvas);
  app.stage.eventMode = "static";

  await preloadTextures();

  // Layers (design space).
  const root = new Container();
  app.stage.addChild(root);
  const room = new Container();
  const floorLayer = new Container();
  const couch = new Container();
  const fx = new Container();
  const warmth = new Container(); // reveal: warm light + sunbeam
  const toolbar = new Container();
  const hud = new Container();
  const overlay = new Container();
  const groundShadow = new Container();   // couch contact shadow — ABOVE the floor overlay so it
  // falls on the carpet/boards (in `room` it was painted UNDER them → the couch looked floating)
  const propShadow = new Container();   // soft contact shadows under the cut-out plant + lamp
  const props = new Container();   // plant + lamp cut out of room-bg, drawn ABOVE the floor overlay
  root.addChild(room, floorLayer, groundShadow, propShadow, props, couch, fx, warmth, toolbar, hud, overlay);

  // State.
  let state: State = "intro";
  let busy = false;
  let progress = 0;
  let idleAccum = 0;
  let idleCount = 0;
  let pulseTarget: Container | null = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function fit(t: Text, maxW: number): void {
    t.scale.set(1);
    if (t.width > maxW) t.scale.set(maxW / t.width);
  }
  function puff(x: number, y: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      const d = new Graphics().circle(0, 0, 3 + Math.random() * 4).fill({ color: 0xcdbfa6, alpha: 0.8 });
      d.position.set(x + (Math.random() - 0.5) * 44, y + (Math.random() - 0.5) * 18);
      fx.addChild(d);
      gsap.to(d, { y: d.y - 28 - Math.random() * 26, alpha: 0, duration: 0.6 + Math.random() * 0.3, ease: "power1.out", onComplete: () => d.destroy() });
    }
  }
  function sparkle(x: number, y: number): void {
    const s = new Text({ text: "✦", style: { fill: cfg.style.colors.accent, fontFamily: FONT, fontWeight: "bold", fontSize: 34 } });
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.alpha = 0;
    fx.addChild(s);
    gsap.timeline({ onComplete: () => s.destroy() })
      .to(s, { alpha: 1, duration: 0.12 })
      .to(s.scale, { x: 1.4, y: 1.4, duration: 0.3, ease: "back.out(2)" }, 0)
      .to(s, { alpha: 0, y: y - 20, duration: 0.4 }, 0.25);
  }
  function stopPulse(): void {
    if (pulseTarget) {
      gsap.killTweensOf(pulseTarget.scale);
      pulseTarget.scale.set(pulseBase.x, pulseBase.y);
      pulseTarget = null;
    }
    gsap.killTweensOf(patchGlow);
    patchGlow.alpha = 0;
  }
  // Remember the base scale of whatever we pulse (couch shrinks across states).
  const pulseBase = { x: 1, y: 1 };
  function pulse(target: Container): void {
    // Already pulsing this target? The tween repeats forever (repeat:-1). Re-entering
    // from an idle nudge would re-capture the LIVE (mid-pulse, already ~1.06×) scale as
    // the new base and multiply by 1.06 again — ratcheting the size up every 3s until the
    // object grows without bound. Bail so the base stays the true resting scale.
    if (pulseTarget === target) return;
    pulseTarget = target;
    pulseBase.x = target.scale.x;
    pulseBase.y = target.scale.y;
    gsap.killTweensOf(target.scale);
    gsap.to(target.scale, { x: pulseBase.x * 1.06, y: pulseBase.y * 1.06, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }
  function pulsePatch(): void {
    gsap.killTweensOf(patchGlow);
    patchGlow.alpha = 0;
    gsap.to(patchGlow, { alpha: 0.9, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // ── Room (PASS-THROUGH living room: back wall + OPEN side portals + receding floor) ──
  // The solid side walls are gone: each side is a doorless opening into the warm BEYOND
  // space, which ALSO fills the letterbox gutters — so the frame never reads as a cutout
  // in a void. One-point perspective; the floor's far edge = the back wall's bottom.
  const BWX = 60;                          // back-wall inset / opening edge / floor far-edge inset
  const FLOOR_NEAR_OUT = 60;               // floor near edge overshoots the screen sides
  const BEYOND_FLOORY = 388;               // floor line of the adjacent space seen through the portals
  function buildRoom(): void {
    const wall = num("#efe6d6"), wallShade = num("#e2d4bd");
    const floorBase = num("#cbb78f"), floorFar = num("#b6a074");

    // (1) BEYOND floor band (the adjacent space's floor) — drawn wide to cover gutters.
    //     The beyond WALL is the app background, already visible in the openings + gutters.
    const beyond = new Graphics();
    beyond.rect(-600, -500, DW + 1200, BEYOND_FLOORY + 500).fill({ color: BEYOND_WALL });        // adjacent wall (fills upper gutters)
    beyond.rect(-600, BEYOND_FLOORY, DW + 1200, DH - BEYOND_FLOORY + 400).fill({ color: BEYOND_FLOOR }); // adjacent floor (lower gutters)
    beyond.rect(-600, BEYOND_FLOORY - 5, DW + 1200, 5).fill({ color: num("#a89a7c") });          // its baseboard
    // a faint far-light strip deep in each opening → "the passage continues toward light"
    beyond.rect(10, 86, 16, BEYOND_FLOORY - 110).fill({ color: num("#dccfb1"), alpha: 0.55 });
    beyond.rect(DW - 26, 86, 16, BEYOND_FLOORY - 110).fill({ color: num("#dccfb1"), alpha: 0.55 });
    // soft recess shadow hugging each opening edge (depth)
    beyond.rect(BWX - 30, 0, 30, BEYOND_FLOORY).fill({ color: num("#a89c7e"), alpha: 0.35 });
    beyond.rect(DW - BWX, 0, 30, BEYOND_FLOORY).fill({ color: num("#a89c7e"), alpha: 0.35 });
    room.addChild(beyond);

    // AI background room (Stage 2): one cohesive 3/4 room image replaces the procedural
    // walls/window/decor. Fit to the design WIDTH; the warm beyond bands fill above/below.
    const bgTex = tex("room-bg.webp");
    if (bgTex) {
      const bg = new Sprite(bgTex);
      bg.width = DW;
      bg.height = bgTex.height * (DW / bgTex.width);
      bg.position.set(0, (DH - bg.height) / 2);
      room.addChild(bg);

      // The plant + floor lamp stand ON the floor (baked into room-bg) — the wall-to-wall carpet
      // and the new boards would otherwise cover their bases. Cut each out of room-bg and redraw
      // it in `props` (ABOVE the floor overlay). The fill matrix maps texture-px → design space so
      // each cut-out lands pixel-exact over the original; above the floor edge it overlays identical
      // wall pixels (invisible), so only the BASE outline (over the floor) must hug the object.
      const _s = DW / bgTex.width, _oy = (DH - bg.height) / 2;
      const bgMat = new Matrix(_s, 0, 0, _s, 0, _oy);
      // design-space silhouettes (loose above the floor's back edge ≈ y405, tight at each base).
      // Hand-tuned live in ?props (drag handles to hug each base against the carpet).
      const PLANT_CUT = [231, 372, 271, 372, 274, 386, 267, 415, 238, 415, 229, 386];
      const LAMP_CUT = [443, 421, 435, 432, 431, 435, 437, 440, 448, 442, 460, 439, 464, 434, 454, 428];
      for (const poly of [PLANT_CUT, LAMP_CUT]) {
        props.addChild(new Graphics().poly(poly).fill({ texture: bgTex, matrix: bgMat }));
      }
      (window as unknown as { __props: number[][] }).__props = [PLANT_CUT, LAMP_CUT];
      // Soft contact shadows so each cut-out sits ON the floor overlay (carpet/boards/new) instead
      // of floating. Stacked ellipses (wide penumbra + tighter core), faded at reveal so they don't
      // double the room-bg's own baked shadows. Centred at each base, slightly toward the viewer.
      const contactShadow = (cx: number, cy: number, rx: number, ry: number) => new Graphics()
        .ellipse(cx, cy, rx * 1.35, ry * 1.4).fill({ color: 0x000000, alpha: 0.10 })
        .ellipse(cx, cy, rx, ry).fill({ color: 0x000000, alpha: 0.17 });
      propShadow.addChild(contactShadow(252, 417, 25, 7));     // plant pot base
      propShadow.addChild(contactShadow(447, 442, 18, 5.5));   // lamp foot
    } else {
    // (2) Main room floor — receding perspective trapezoid (over the beyond).
    const g = new Graphics();
    g.poly([BWX, WALLY, DW - BWX, WALLY, DW + FLOOR_NEAR_OUT, DH, -FLOOR_NEAR_OUT, DH]).fill({ color: floorBase });
    g.poly([BWX, WALLY, DW - BWX, WALLY, DW - 36, WALLY + 70, 36, WALLY + 70]).fill({ color: floorFar, alpha: 0.7 });
    room.addChild(g);

    // (3) Back wall — inset to the room width, leaving an OPEN portal on each side.
    const bw = new Graphics();
    bw.rect(BWX, 0, DW - 2 * BWX, WALLY).fill({ color: wall });
    bw.rect(BWX, WALLY - 64, DW - 2 * BWX, 64).fill({ color: wallShade });
    bw.rect(BWX, WALLY - 6, DW - 2 * BWX, 8).fill({ color: num("#d8c6a4") });             // baseboard
    room.addChild(bw);

    // (4) Portal jambs — the wall's cut edge at each opening (depth + crisp threshold).
    const jamb = new Graphics();
    jamb.rect(BWX - 7, 0, 7, WALLY).fill({ color: num("#d6c8aa") });          // wall-thickness return (L)
    jamb.rect(DW - BWX, 0, 7, WALLY).fill({ color: num("#d6c8aa") });         // (R)
    jamb.rect(BWX - 1, 0, 2, WALLY).fill({ color: num("#f4eddc") });          // crisp light edge (L)
    jamb.rect(DW - BWX - 1, 0, 2, WALLY).fill({ color: num("#f4eddc") });     // (R)
    room.addChild(jamb);

    // (5) Window (back wall, upper-right).
    const win = new Graphics();
    win.roundRect(334, 104, 122, 150, 12).fill({ color: num("#cfe7f2") });
    win.roundRect(334, 104, 122, 150, 12).stroke({ width: 9, color: num("#f7eed8") });
    win.rect(392, 104, 5, 150).fill({ color: num("#f7eed8") });
    win.rect(334, 173, 122, 5).fill({ color: num("#f7eed8") });
    room.addChild(win);
    const glow = new Graphics().poly([342, 254, 452, 254, 430, 472, 278, 472]).fill({ color: num("#fff3cf"), alpha: 0.42 });
    room.addChild(glow);

    // (6) Big framed picture (back wall, left) — replaces the old doorway.
    const pic = new Graphics();
    pic.roundRect(86, 116, 130, 192, 6).fill({ color: num("#9c7c4f") });                   // frame
    pic.roundRect(95, 125, 112, 174, 4).fill({ color: num("#efe6d6") });                   // mat
    pic.rect(103, 150, 96, 124).fill({ color: num("#bcd6e0") });                           // sky
    pic.poly([103, 248, 199, 222, 199, 274, 103, 274]).fill({ color: num("#9bb083") });    // rolling hills
    pic.circle(170, 178, 13).fill({ color: num("#f3e2b0") });                              // sun
    room.addChild(pic);

    // (7) Tall palm tucked into the back-LEFT corner, standing on the floor.
    const px = 74, potTop = 452, potBot = 510, crownY = 304;
    const pot = new Graphics();
    pot.ellipse(px, potBot + 6, 42, 11).fill({ color: 0x000000, alpha: 0.12 });
    pot.poly([px - 28, potTop, px + 28, potTop, px + 21, potBot, px - 21, potBot]).fill({ color: num("#b6794a") });
    pot.poly([px + 7, potTop, px + 28, potTop, px + 21, potBot, px + 3, potBot]).fill({ color: num("#9c6238"), alpha: 0.5 });
    pot.ellipse(px, potTop, 29, 8).fill({ color: num("#c98a5a") });
    pot.ellipse(px, potTop - 1, 23, 5).fill({ color: num("#43301f") });
    room.addChild(pot);
    const trunk = new Graphics();
    trunk.poly([px - 6, potTop - 2, px + 6, potTop - 2, px, crownY + 6, px - 10, crownY + 6]).fill({ color: num("#8a6b45") });
    for (let k = 1; k <= 3; k++) trunk.moveTo(px - 6, potTop - 6 - k * 46).lineTo(px + 4 - k, potTop - 10 - k * 46).stroke({ width: 1.5, color: num("#6f5436"), alpha: 0.5 });
    room.addChild(trunk);
    const crown = new Container();
    crown.position.set(px - 4, crownY);
    const greens = [num("#5f8b4d"), num("#6f9c5b"), num("#7faa66")];
    // fronds biased upward/left so the palm hugs the corner and doesn't reach the centre.
    const fronds: Array<[number, number, number]> = [
      [-90, 84, 12], [-118, 88, 12], [-66, 82, 11], [-148, 80, 11], [-40, 70, 10],
      [-170, 70, 10], [-16, 58, 9], [152, 52, 9], [38, 46, 8],
    ];
    fronds.forEach(([deg, len, w], i) => {
      const leaf = new Graphics().poly([0, 0, len * 0.5, -w, len, 0, len * 0.5, w]).fill({ color: greens[i % 3] });
      leaf.moveTo(3, 0).lineTo(len - 3, 0).stroke({ width: 1.5, color: shade(greens[i % 3], -0.25), alpha: 0.5 });
      leaf.rotation = (deg * Math.PI) / 180;
      crown.addChild(leaf);
    });
    room.addChild(crown);

    // (8) Floor lamp standing on the floor in the back-RIGHT corner.
    const lamp = new Graphics();
    lamp.ellipse(470, 454, 26, 8).fill({ color: 0x000000, alpha: 0.12 });
    lamp.rect(467, 300, 6, 154).fill({ color: num("#8a6b45") });
    lamp.poly([451, 300, 489, 300, 480, 260, 460, 260]).fill({ color: num("#f3d99a") });
    room.addChild(lamp);
    }

    // Soft contact shadow under the couch (moves + scales with the couch) — grounds it
    // on the floor. Two stacked ellipses: a soft wide penumbra + a tighter darker core.
    couchShadow = new Graphics()
      .ellipse(0, 0, 150, 30).fill({ color: 0x000000, alpha: 0.09 })
      .ellipse(0, 6, 116, 20).fill({ color: 0x000000, alpha: 0.12 });
    couchShadow.position.set(COUCHX, COUCHY + 50);
    groundShadow.addChild(couchShadow);
  }

  // ── Floor patch (subfloor · old planks · new planks · gloss · carpet) ─────────
  let couchShadow!: Graphics;
  const subfloor = new Graphics();
  const rotBacking = new Graphics(); // dark rot showing through gaps/holes
  const oldStrips: Container[] = [];
  const newStrips: Container[] = [];
  const gloss = new Graphics();
  const carpet = new Container();
  const patchGlow = new Graphics();
  const boardsC = new Container();   // subfloor + diagonal boards; masked to the floor region
  // (patchPoly — the whole-floor region — is defined at module scope above.)

  function buildPatch(): void {
    // The diagonal boards overshoot the room-aligned floor; clip everything in boardsC to the
    // floor region with a mask so the renovation stays inside the painted floor's outline.
    const floorMask = new Graphics().poly(floorRegion).fill({ color: 0xffffff });
    floorLayer.addChild(boardsC, floorMask);
    boardsC.mask = floorMask;
    // Bare subfloor over the whole floor (revealed after the rotten boards are pried) +
    // a few cross-joist seams running toward VP2 (trimmed to the region by the mask).
    subfloor.poly(patchPoly).fill({ color: num("#b7a47e") });
    for (let k = 1; k < 6; k++) {
      const cy = NEAR_Y + (FAR_Y - NEAR_Y) * (k / 6);
      const dx = VP2.x - FCx, dy = VP2.y - cy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      subfloor.moveTo(FCx - ux * 600, cy - uy * 600).lineTo(FCx + ux * 600, cy + uy * 600)
        .stroke({ width: 2, color: num("#a08a60"), alpha: 0.4 });
    }
    boardsC.addChild(subfloor);
    // Dark rot layer — shows through gaps where boards are missing.
    rotBacking.poly(patchPoly).fill({ color: num("#160f08") });
    boardsC.addChild(rotBacking);

    // Old rotten planks — converging boards (front→back), cold + damaged (the "problem").
    plankGeo.forEach((p) => {
      const c = new Container();
      const st = stripTexture("floor-rotten.webp", p.grain, 3, 12);   // 1 plank/segment (inset avoids light edges)
      if (st) {
        const q = p.flip ? [p.quad[2], p.quad[3], p.quad[0], p.quad[1], p.quad[6], p.quad[7], p.quad[4], p.quad[5]] : p.quad;
        c.addChild(quadMesh(st, q));
        c.addChild(new Graphics().poly(p.quad).stroke({ width: 2.5, color: num("#241910"), alpha: 0.5 }));   // dark plank outline (seams + butt-joints)
      } else {
        c.addChild(new Graphics().poly(p.quad).fill({ color: shade(num("#6a5236"), -(p.grain * 0.06)) }));
      }
      c.position.set(p.ox, p.oy);
      boardsC.addChild(c);
      oldStrips.push(c);
    });
    // New warm-wood planks (hidden until laid) — same staggered segment grid.
    plankGeo.forEach((p) => {
      const c = new Container();
      const st = stripTexture("floor-new.webp", p.grain, 3, 12);
      if (st) {
        const q = p.flip ? [p.quad[2], p.quad[3], p.quad[0], p.quad[1], p.quad[6], p.quad[7], p.quad[4], p.quad[5]] : p.quad;
        c.addChild(quadMesh(st, q));
        c.addChild(new Graphics().poly(p.quad).stroke({ width: 1.5, color: num("#9c6f3e"), alpha: 0.4 }));   // subtle plank outline
      } else {
        c.addChild(new Graphics().poly(p.quad).fill({ color: shade(num("#c98a4b"), (p.grain % 2) * 0.08) }));
      }
      c.position.set(p.ox, p.oy);
      c.alpha = 0;
      c.scale.set(1, 0.1);
      boardsC.addChild(c);
      newStrips.push(c);
    });
    // Gloss sweep overlay (finish) — the whole floor.
    gloss.poly(patchPoly).fill({ color: num("#ffffff"), alpha: 0.16 });
    gloss.alpha = 0;
    boardsC.addChild(gloss);

    // Wall-to-wall broadloom carpet over the ENTIRE floor — fill the floor polygon with the
    // (uniform) carpet texture, tiled (the floor outline is now a 6-point shape, not a quad).
    const ct = tex("carpet.webp");
    if (ct) {
      ct.source.style.addressMode = "repeat";   // let the swatch tile across the floor (UVs run past [0,1])
      const cTile = (PXmax - PXmin) / (ct.width * CARPET_REPEATS);   // ≈ one carpet repeat per plank-width across
      carpet.addChild(new Graphics().poly(floorRegion).fill({ texture: ct, matrix: new Matrix().scale(cTile, cTile) }));
      // ── Carpet lighting — the flat-lit tiled swatch alone reads as a featureless plane, so
      // re-light it to match the room-bg: pile clouds, wall AO, window/lamp pools, front vignette.
      // All children of `carpet` (peel together at the rip); a floor-shaped child mask clips the
      // loose shapes so nothing spills onto the walls.
      // (1) large-scale pile clouds — the same swatch re-tiled ~7× bigger, multiplied at low alpha:
      //     soft tonal patches like real broadloom catching light unevenly.
      const clouds = new Graphics().poly(floorRegion)
        .fill({ texture: ct, matrix: new Matrix().scale(cTile * 7, cTile * 7).translate(37, 19) });
      clouds.blendMode = "multiply"; clouds.alpha = 0.3;
      carpet.addChild(clouds);
      // (2) ambient-occlusion band where the carpet meets the back walls (ML→BL→BR) — stacked
      //     strips of increasing alpha = soft falloff (Graphics has no blur).
      const aoTop = [_FC[5], _FC[0], _FC[1]];
      for (const [w, a] of [[40, 0.05], [24, 0.06], [12, 0.08]] as const) {
        carpet.addChild(new Graphics().poly([
          ...aoTop.flatMap((p) => [p.x, p.y]),
          ...[...aoTop].reverse().flatMap((p) => [p.x, p.y + w]),
        ]).fill({ color: 0x241a10, alpha: a }));
      }
      // (3) warm light pools — window (right-of-centre) + floor lamp, positions read off room-bg.
      const pool = (cx: number, cy: number, rx: number, ry: number, steps: readonly (readonly [number, number])[]) => {
        const g = new Graphics();
        for (const [k, a] of steps) g.ellipse(cx, cy, rx * k, ry * k).fill({ color: 0xffd9a0, alpha: a });
        g.blendMode = "add";
        return g;
      };
      carpet.addChild(pool(365, 495, 175, 70, [[1, 0.045], [0.7, 0.05], [0.45, 0.05]]));
      carpet.addChild(pool(449, 465, 80, 30, [[1, 0.05], [0.6, 0.06]]));
      // (4) front vignette — the light sources sit at the back, so the carpet dims toward the
      // viewer. No clip needed: below y≈640 the floor polygon spans the whole visible canvas.
      const vig = new Graphics();
      for (const [y0, a] of [[640, 0.03], [780, 0.04], [900, 0.05]] as const)
        vig.rect(-220, y0, DW + 460, DH + 200 - y0).fill({ color: 0x14100b, alpha: a });
      carpet.addChild(vig);
    } else {
      carpet.addChild(new Graphics().poly(floorRegion).fill({ color: num("#bdb09a") }));
    }
    carpet.position.set(0, 0);
    carpet.pivot.set(0, 0);
    floorLayer.addChild(carpet);

    // Pulse highlight outline — traces the diagonal patch quad.
    patchGlow.poly(patchPoly).stroke({ width: 5, color: ACCENT });
    patchGlow.alpha = 0;
    floorLayer.addChild(patchGlow);

    carpet.eventMode = "none";
    carpet.cursor = "pointer";
    carpet.on("pointertap", () => { if (state === "carpet") performStep(); });
  }

  // ── Couch (pseudo-3/4 volume) ───────────────────────────────────────────────
  function buildCouch(): void {
    const fabric = num("#a9774b"), fabricDk = shade(fabric, -0.18), cushion = shade(fabric, 0.12);
    const drawn = (): Container => {
      const c = new Container();
      const g = new Graphics();
      g.roundRect(-160, -68, 320, 104, 20).fill({ color: fabric });          // back + base
      g.roundRect(-160, -68, 320, 44, 18).fill({ color: fabricDk });         // backrest top
      g.roundRect(-160, -12, 48, 54, 14).fill({ color: fabricDk });          // left arm
      g.roundRect(112, -12, 48, 54, 14).fill({ color: fabricDk });           // right arm
      g.roundRect(-106, -18, 100, 34, 12).fill({ color: cushion });          // seat cushion L
      g.roundRect(8, -18, 100, 34, 12).fill({ color: cushion });             // seat cushion R
      g.rect(-136, 42, 14, 20).fill({ color: num("#5a3f29") });              // legs
      g.rect(122, 42, 14, 20).fill({ color: num("#5a3f29") });
      c.addChild(g);
      return c;
    };
    couch.addChild(spriteOr("couch.webp", 300, drawn));
    couch.position.set(COUCHX, COUCHY);
    couch.pivot.set(0, 44); // tilt about the front-floor contact
    couch.eventMode = "none";
    couch.cursor = "pointer";
    couch.on("pointertap", () => { if (state === "couch") performStep(); });
  }

  // ── Toolbar (3 tools, lit in sequence) ────────────────────────────────────────
  interface Tool { cont: Container; bg: Graphics; check: Text; }
  const tools: Record<string, Tool> = {};
  function makeToolIcon(kind: string): Container {
    const t = tex(`tool-${kind}.webp`);
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0.5);
      sp.height = 52;
      sp.scale.x = sp.scale.y;
      const c = new Container();
      c.addChild(sp);
      return c;
    }
    const g = new Graphics();
    if (kind === "crowbar") {
      g.roundRect(-3, -20, 7, 34, 3).fill({ color: num("#c0392b") });
      g.poly([-3, 14, 4, 14, 12, 23, 3, 23]).fill({ color: num("#9c2c20") });
    } else if (kind === "plank") {
      g.roundRect(-20, -9, 40, 18, 3).fill({ color: num("#c98a4b") });
      g.moveTo(-16, 0).lineTo(16, -3).stroke({ width: 1.5, color: shade(num("#c98a4b"), -0.3) });
    } else {
      g.rect(-18, -14, 34, 14).fill({ color: num("#6f9c5b") });   // roller
      g.rect(2, 0, 5, 18).fill({ color: num("#8a6b45") });        // handle
    }
    const c = new Container();
    c.addChild(g);
    return c;
  }
  function buildToolbar(): void {
    const kinds = ["crowbar", "plank", "finish"];
    const gap = 124;
    kinds.forEach((kind, i) => {
      const cont = new Container();
      const bg = new Graphics();
      bg.roundRect(-40, -40, 80, 80, 18).fill({ color: num("#fff4df") }).stroke({ width: 3, color: PRIMARY });
      const check = new Text({ text: "✓", style: { fill: "#2e7d32", fontFamily: FONT, fontWeight: "bold", fontSize: 30 } });
      check.anchor.set(0.5);
      check.position.set(28, -28);
      check.alpha = 0;
      cont.addChild(bg, makeToolIcon(kind), check);
      cont.position.set(COUCHX + (i - 1) * gap, 872);
      toolbar.addChild(cont);
      tools[kind] = { cont, bg, check };
    });
    toolbar.alpha = 0;
    toolbar.visible = false;
  }
  function highlightTool(kind: string): void {
    for (const [k, t] of Object.entries(tools)) {
      const on = k === kind;
      t.bg.tint = on ? 0xffffff : 0xb8ad97;
      gsap.killTweensOf(t.cont.scale);
      t.cont.scale.set(1);
      if (on) gsap.to(t.cont.scale, { x: 1.12, y: 1.12, duration: 0.55, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }
  }
  function markToolDone(kind: string): void {
    const t = tools[kind];
    gsap.killTweensOf(t.cont.scale);
    t.cont.scale.set(1);
    t.bg.tint = 0xd8f0d8;
    gsap.fromTo(t.check, { alpha: 0 }, { alpha: 1, duration: 0.3 });
  }

  // ── HUD (hint · progress · clickable brand corner) ────────────────────────────
  const hint = new Text({ text: "", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 26, align: "center", wordWrap: true, wordWrapWidth: 440 } });
  const progBg = new Graphics();
  const progFill = new Graphics();
  function buildHud(): void {
    hint.anchor.set(0.5);
    hint.position.set(DW / 2, 54);
    hud.addChild(hint);
    progBg.roundRect(206, 86, 128, 12, 6).fill({ color: 0x000000, alpha: 0.13 });
    hud.addChild(progBg, progFill);
    drawProgress();
    // Brand corner — clickable any time → end card (skip).
    const brand = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 108, 38, 9).fill({ color: num("#fff4df") }).stroke({ width: 2, color: PRIMARY });
    const t = new Text({ text: "FLOORco", style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: 18 } });
    t.anchor.set(0.5);
    t.position.set(54, 19);
    brand.addChild(bg, t);
    brand.position.set(16, 906);
    brand.eventMode = "static";
    brand.cursor = "pointer";
    brand.on("pointertap", (e) => { e.stopPropagation(); if (state !== "end") goReveal(true); });
    hud.addChild(brand);
  }
  function setHint(s: string): void {
    hint.text = s;
    fit(hint, 460);
    gsap.fromTo(hint, { alpha: 0.4 }, { alpha: 1, duration: 0.3 });
  }
  function drawProgress(): void {
    progFill.clear();
    if (progress > 0) progFill.roundRect(206, 86, Math.max(8, 128 * (progress / 100)), 12, 6).fill({ color: ACCENT });
  }

  // ── Work-zone tap-catcher (crowbar/plank/finish) — covers the patch's widest extent ──
  const wzX = PXmin - 14, wzY = PYmin - 14, wzW = (PXmax + 14) - wzX, wzH = (PYmax + 14) - wzY;
  const workZone = new Graphics().rect(wzX, wzY, wzW, wzH).fill({ color: 0xffffff, alpha: 0.001 });
  workZone.hitArea = new Rectangle(wzX, wzY, wzW, wzH);
  workZone.eventMode = "none";
  workZone.cursor = "pointer";
  workZone.on("pointertap", () => { if (state === "crowbar" || state === "plank" || state === "finish") performStep(); });

  // ── State machine ─────────────────────────────────────────────────────────────
  function setState(s: State): void {
    state = s;
    idleAccum = 0;
    idleCount = 0;
    stopPulse();
    setHint(HINTS[s] ?? "");
    couch.eventMode = s === "couch" ? "static" : "none";
    carpet.eventMode = s === "carpet" ? "static" : "none";
    workZone.eventMode = s === "crowbar" || s === "plank" || s === "finish" ? "static" : "none";
    if (s === "couch") pulse(couch);
    else if (s === "carpet") pulse(carpet);
    else if (s === "crowbar" || s === "plank" || s === "finish") { pulsePatch(); highlightTool(s); }
  }

  function performStep(): void {
    if (busy) return;
    switch (state) {
      case "couch": return moveCouch();
      case "carpet": return ripCarpet();
      case "crowbar": return doCrowbar();
      case "plank": return doPlank();
      case "finish": return doFinish();
      default: return;
    }
  }

  function moveCouch(): void {
    busy = true;
    stopPulse();
    puff(COUCHX, COUCHY + 40);
    // Couch slides back along the floor (further away → smaller), staying ON the floor.
    gsap.timeline({ onComplete: () => { busy = false; setState("carpet"); } })
      .to(couch, { rotation: 0, x: COUCH_BACKX, y: COUCH_BACKY, duration: STEP, ease: "power2.out" })
      .to(couch.scale, { x: COUCH_BACK_SCALE, y: COUCH_BACK_SCALE, duration: STEP, ease: "power2.out" }, 0)
      .to(couchShadow, { x: COUCH_BACKX, y: COUCH_BACKY + 52 * COUCH_BACK_SCALE, duration: STEP, ease: "power2.out" }, 0)
      .to(couchShadow.scale, { x: COUCH_BACK_SCALE, y: COUCH_BACK_SCALE, duration: STEP, ease: "power2.out" }, 0);
  }

  function ripCarpet(): void {
    busy = true;
    stopPulse();
    puff(PCx, PYmin + 30, 10);
    toolbar.visible = true;
    gsap.to(toolbar, { alpha: 1, duration: STEP });
    // Peel the broadloom up toward the back wall: compress scale.y → 0 about the back pivot.
    gsap.timeline({ onComplete: () => { busy = false; setState("crowbar"); } })
      .set(carpet, { pivot: { x: CARPET_PIVOT.x, y: CARPET_PIVOT.y }, x: CARPET_PIVOT.x, y: CARPET_PIVOT.y })
      .to(carpet.scale, { y: 0.03, duration: STEP * 1.15, ease: "power2.in" }, 0)
      .to(carpet, { alpha: 0, duration: STEP * 1.15, ease: "power2.in" }, 0)
      .add(() => { carpet.visible = false; });
  }

  function doCrowbar(): void {
    busy = true;
    stopPulse();
    const tl = gsap.timeline({ onComplete: () => { busy = false; progress = 33; drawProgress(); markToolDone("crowbar"); sparkle(PCx, PCy); setState("plank"); } });
    tl.to(rotBacking, { alpha: 0, duration: STEP, ease: "power1.out" }, 0.2);
    oldStrips.forEach((s, i) => {
      tl.to(s, { y: s.y - 64, rotation: (Math.random() - 0.5) * 0.5, alpha: 0, duration: STEP * 0.9, ease: "back.in(1.4)", onStart: () => puff(s.x + 20, PYmin + 20, 4) }, i * (0.9 / oldStrips.length));
    });
  }

  function doPlank(): void {
    busy = true;
    stopPulse();
    const tl = gsap.timeline({ onComplete: () => { busy = false; progress = 66; drawProgress(); markToolDone("plank"); sparkle(PCx, PCy); setState("finish"); } });
    newStrips.forEach((s, i) => {
      const oy = plankGeo[i].oy;   // each plank segment rises into its own far-corner row
      tl.fromTo(s, { alpha: 0, y: oy - 26 }, { alpha: 1, y: oy, duration: STEP * 0.5, ease: "power2.out" }, i * (0.9 / newStrips.length))
        .fromTo(s.scale, { y: 0.1 }, { y: 1, duration: STEP * 0.5, ease: "back.out(2)", onStart: () => puff(s.x + 20, PYmax - 16, 3) }, i * (0.9 / newStrips.length));
    });
  }

  function doFinish(): void {
    busy = true;
    stopPulse();
    const shine = new Graphics().rect(0, 0, 80, PYmax - PYmin).fill({ color: 0xffffff, alpha: 0.5 });
    shine.position.set(PXmin - 96, PYmin);
    floorLayer.addChild(shine);
    gsap.timeline({ onComplete: () => { busy = false; progress = 100; drawProgress(); markToolDone("finish"); shine.destroy(); sparkle(PCx, PCy); goReveal(false); } })
      .to(gloss, { alpha: 1, duration: STEP, ease: "power1.out" }, 0)
      .to(shine, { x: PXmax + 28, duration: STEP * 1.3, ease: "power1.inOut" }, 0);
  }

  // ── Reveal + end card ─────────────────────────────────────────────────────────
  function goReveal(skip: boolean): void {
    if (state === "reveal" || state === "end") return;
    state = "reveal";
    busy = true;
    stopPulse();
    couch.eventMode = "none"; carpet.eventMode = "none"; workZone.eventMode = "none";
    gsap.to(toolbar, { alpha: 0, duration: 0.3, onComplete: () => (toolbar.visible = false) });
    if (skip) { setHint(""); showEndcard(); return; }
    setHint(HINTS.reveal);
    // Warm light wash + sunbeam.
    const wash = new Graphics().rect(0, 0, DW, DH).fill({ color: num("#ffcf8a"), alpha: 0 });
    const beam = new Graphics().poly([344, 110, 462, 110, 466, 580, 286, 580]).fill({ color: num("#fff3cf"), alpha: 0 });
    warmth.addChild(wash, beam);
    couch.visible = true;
    gsap.timeline({ onComplete: () => { busy = false; gsap.delayedCall(REVEAL_HOLD / 1000, showEndcard); } })
      // The new boards we just laid settle into the room's real honey-oak dream floor — fade
      // the whole-floor overlay so the painted room-bg floor (perfect width + angle) shows.
      .to(boardsC, { alpha: 0, duration: STEP * 1.4, ease: "power1.inOut" }, 0)
      .to(propShadow, { alpha: 0, duration: STEP * 1.4, ease: "power1.inOut" }, 0)   // room-bg's own baked shadows take over
      .to(couch, { x: COUCHX, y: COUCHY, rotation: 0, duration: STEP * 1.4, ease: "power2.inOut" })
      .to(couch.scale, { x: 1, y: 1, duration: STEP * 1.4, ease: "power2.inOut" }, 0)
      .to(couchShadow, { x: COUCHX, y: COUCHY + 52, duration: STEP * 1.4, ease: "power2.inOut" }, 0)
      .to(couchShadow.scale, { x: 1, y: 1, duration: STEP * 1.4, ease: "power2.inOut" }, 0)
      .to(wash, { alpha: 0.22, duration: STEP * 1.4 }, 0)
      .to(beam, { alpha: 0.55, duration: STEP * 1.4 }, 0.2)
      .to(beam, { alpha: 0.3, duration: 0.8, yoyo: true, repeat: 1 }, ">");
  }

  function showEndcard(): void {
    if (state === "end") return;
    state = "end";
    overlay.removeChildren();
    overlay.addChild(new Graphics().rect(0, 0, DW, DH).fill({ color: 0x000000, alpha: 0.42 }));
    const panel = new Container();
    const pw = 400, ph = 520;
    panel.addChild(new Graphics().roundRect(-pw / 2, -ph / 2, pw, ph, 28).fill({ color: 0xfff4df }).stroke({ width: 5, color: PRIMARY }));
    // Brand logo.
    const logo = spriteOr("logo.webp", 150, () => {
      const c = new Container();
      c.addChild(new Graphics().roundRect(-104, -32, 208, 64, 14).fill({ color: PRIMARY }));
      const lt = new Text({ text: "FLOORco", style: { fill: "#fff4df", fontFamily: FONT, fontWeight: "bold", fontSize: 36 } });
      lt.anchor.set(0.5);
      c.addChild(lt);
      return c;
    });
    logo.position.set(0, -ph / 2 + 92);
    panel.addChild(logo);
    const tag = new Text({ text: "Design your dream floor.", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 26, align: "center" } });
    tag.anchor.set(0.5);
    fit(tag, pw * 0.86);
    tag.position.set(0, -ph / 2 + 184);
    panel.addChild(tag);
    // Mini before/after chips (real textures when present).
    const chipY = -ph / 2 + 214;
    const chip = (key: string, x: number, fallback: number, accent: boolean): Container => {
      const t = tex(key);
      const c = new Container();
      if (t) {
        const sp = new Sprite(t);
        sp.width = 130; sp.height = 86; sp.position.set(x, chipY);
        c.addChild(sp);
      } else {
        const g = new Graphics().roundRect(x, chipY, 130, 86, 10).fill({ color: fallback });
        if (accent) g.stroke({ width: 2, color: ACCENT });
        c.addChild(g);
      }
      return c;
    };
    panel.addChild(chip("floor-rotten.webp", -146, num("#6b5b44"), false), chip("floor-new.webp", 16, num("#c98a4b"), true));
    // Primary CTA → onCTAClick.
    const cta = new Container();
    const cw = pw - 64;
    cta.addChild(new Graphics().roundRect(-cw / 2, -38, cw, 76, 38).fill({ color: ACCENT }).stroke({ width: 4, color: shade(ACCENT, -0.3) }));
    const ctaT = new Text({ text: cfg.copy.cta, style: { fill: "#3a2418", fontFamily: FONT, fontWeight: "bold", fontSize: 32 } });
    ctaT.anchor.set(0.5);
    fit(ctaT, cw * 0.84);
    cta.addChild(ctaT);
    cta.position.set(0, ph / 2 - 96);
    cta.eventMode = "static";
    cta.cursor = "pointer";
    cta.on("pointertap", (e) => { e.stopPropagation(); window.FbPlayableAd.onCTAClick(); });
    panel.addChild(cta);
    gsap.to(cta.scale, { x: 1.05, y: 1.05, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });
    // Replay.
    const replay = new Text({ text: "↻ Replay", style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: 22 } });
    replay.anchor.set(0.5);
    replay.position.set(0, ph / 2 - 36);
    replay.eventMode = "static";
    replay.cursor = "pointer";
    replay.on("pointertap", (e) => { e.stopPropagation(); resetAll(); });
    panel.addChild(replay);
    panel.position.set(DW / 2, DH / 2);
    panel.scale.set(0.7);
    overlay.addChild(panel);
    gsap.to(panel.scale, { x: 1, y: 1, duration: 0.45, ease: "back.out(1.5)" });
  }

  // ── Reset (replay) ──────────────────────────────────────────────────────────
  function resetAll(): void {
    overlay.removeChildren();
    warmth.removeChildren();
    fx.removeChildren();
    progress = 0;
    drawProgress();
    // Couch back to hook position (on the rug) + its shadow.
    couch.visible = true;
    couch.position.set(COUCHX, COUCHY);
    couch.scale.set(1);
    couch.rotation = 0;
    couchShadow.position.set(COUCHX, COUCHY + 52);
    couchShadow.scale.set(1);
    // Carpet restored (covers the whole floor again).
    carpet.visible = true;
    carpet.alpha = 1;
    carpet.rotation = 0;
    carpet.scale.set(1);
    carpet.pivot.set(0, 0);
    carpet.position.set(0, 0);
    // Planks reset (back to their converging-quad home positions).
    oldStrips.forEach((s, i) => { s.alpha = 1; s.rotation = 0; s.position.set(plankGeo[i].ox, plankGeo[i].oy); });
    newStrips.forEach((s, i) => { s.alpha = 0; s.scale.set(1, 0.1); s.position.set(plankGeo[i].ox, plankGeo[i].oy); });
    rotBacking.alpha = 1;
    gloss.alpha = 0;
    boardsC.alpha = 1;   // floor overlay restored (was faded out at the reveal)
    propShadow.alpha = 1;   // plant/lamp contact shadows restored
    // Tools reset.
    for (const t of Object.values(tools)) { t.check.alpha = 0; t.bg.tint = 0xffffff; t.cont.scale.set(1); }
    toolbar.alpha = 0; toolbar.visible = false;
    setHint("");
    startHook();
  }

  // ── Idle nudge + auto-demo ────────────────────────────────────────────────────
  app.ticker.add((ticker) => {
    if (busy || state === "intro" || state === "reveal" || state === "end") return;
    idleAccum += ticker.deltaMS;
    if (idleAccum >= IDLE_HINT) {
      idleAccum = 0;
      idleCount++;
      setHint(HINTS[state] ?? "");
      if (state === "couch") pulse(couch);
      else if (state === "carpet") pulse(carpet);
      else pulsePatch();
      if (idleCount >= AUTO_DEMO_AFTER && !/dbg/.test(location.search)) performStep(); // auto-demo (off in QA)
    }
  });

  // ── Hook intro ─────────────────────────────────────────────────────────────────
  function startHook(): void {
    state = "intro";
    gsap.delayedCall(HOOK_DELAY / 1000, () => {
      puff(COUCHX, COUCHY + 40, 8);
      gsap.to(couch, { rotation: (COUCH_TILT * Math.PI) / 180, duration: 0.6, ease: "power2.out", onComplete: () => setState("couch") });
    });
  }

  // ── Layout (scale design canvas into viewport — contain) ──────────────────────
  let viewZoom = 1;   // ?floor editor zooms out so corners can be dragged PAST the canvas edges
  function layout(): void {
    const s = Math.min(app.screen.width / DW, app.screen.height / DH) * viewZoom;
    root.scale.set(s);
    root.position.set((app.screen.width - DW * s) / 2, (app.screen.height - DH * s) / 2);
  }

  // ── Build + start ──────────────────────────────────────────────────────────────
  buildRoom();
  buildPatch();
  floorLayer.addChild(workZone);
  // Clip the whole floor work-area (carpet + boards) to the screen so it never spills past the
  // canvas edges (into the side gutters or below the bottom). The floor polygon overshoots on
  // purpose for full-bleed; this trims it to exactly the screen.
  if (!/floor/.test(location.search)) {
    const screenMask = new Graphics().rect(0, 0, DW, DH).fill({ color: 0xffffff });
    floorLayer.addChild(screenMask);
    floorLayer.mask = screenMask;
  }
  buildCouch();
  buildToolbar();
  buildHud();
  layout();
  window.addEventListener("resize", layout);
  app.stage.on("pointertap", () => { if (state === "couch") performStep(); });
  startHook();

  // QA hook (only with ?dbg): drive the FSM + capture composited frames.
  if (/dbg/.test(location.search)) {
    (window as unknown as { __ftf: unknown }).__ftf = {
      get state() { return state; },
      step: () => performStep(),
      reset: () => resetAll(),
      end: () => goReveal(true),
      cta: () => window.FbPlayableAd.onCTAClick(),
      render: () => app.render(),   // force a paint (hidden tabs pause rAF)
      // Draw a candidate floor-region outline over the (revealed) room-bg floor to align it.
      outline: (region?: number[]) => {
        const g = new Graphics().poly(region ?? floorRegion).stroke({ width: 3, color: 0xff1744 });
        overlay.addChild(g);
        app.render();
      },
      // Compose a state's END visual synchronously (no gsap/rAF) for inspection in a hidden tab.
      view: (s: State) => {
        gsap.globalTimeline.clear();
        resetAll();
        gsap.globalTimeline.clear();
        const couchBack = () => { couch.position.set(COUCH_BACKX, COUCH_BACKY); couch.scale.set(COUCH_BACK_SCALE); couch.rotation = 0; };
        const rotten = () => { carpet.visible = false; carpet.alpha = 0; toolbar.visible = true; toolbar.alpha = 1; couchBack(); };
        if (s === "crowbar") rotten();
        else if (s === "plank") { rotten(); oldStrips.forEach((o) => (o.alpha = 0)); rotBacking.alpha = 0; }
        else if (s === "finish") {
          rotten(); oldStrips.forEach((o) => (o.alpha = 0)); rotBacking.alpha = 0;
          newStrips.forEach((n) => { n.alpha = 1; n.scale.set(1, 1); }); gloss.alpha = 1;
        } else if (s === "reveal") {
          oldStrips.forEach((o) => (o.alpha = 0)); rotBacking.alpha = 0;
          newStrips.forEach((n) => { n.alpha = 1; n.scale.set(1, 1); });
          carpet.visible = false; boardsC.alpha = 0;   // dream floor (room-bg) revealed
        }
        state = s;
        app.render();
      },
      // Extract a FIXED design-space region (not the unbounded stage — the wide "beyond"
      // rects would force a huge render texture that headless SwiftShader can't allocate a
      // shader for → blank capture). Pass a frame for a phone-aspect view (incl. top/bottom
      // beyond bands), else default to design + 100px side gutters.
      shot: (r?: { x?: number; y?: number; w?: number; h?: number; res?: number }) =>
        app.renderer.extract.base64({
          target: root,
          frame: new Rectangle(r?.x ?? -100, r?.y ?? 0, r?.w ?? DW + 200, r?.h ?? DH),
          resolution: r?.res ?? 1,
        }),
    };
  }

  // ?floor — alignment aid (open localhost:5063/?floor): reveal the painted room-bg floor and
  // draw MY current floor outline (red) + board direction toward VP1 (green) + a numbered grid,
  // so we can agree on exact boundaries/perspective by reading coordinates off the grid.
  if (/floor/.test(location.search)) {
    carpet.visible = false; boardsC.visible = false;
    couch.visible = false; couchShadow.visible = false; hud.visible = false; toolbar.visible = false;
    gsap.globalTimeline.clear();
    viewZoom = 0.74; layout();   // zoom out → margin around the canvas to drag corners past its edges
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    // grid (into the margin) + axis labels
    const grid = new Graphics();
    for (let x = -150; x <= DW + 150; x += 30) grid.moveTo(x, -90).lineTo(x, DH + 90).stroke({ width: 1, color: 0x2196f3, alpha: x % 120 === 0 ? 0.5 : 0.13 });
    for (let y = -90; y <= DH + 90; y += 30) grid.moveTo(-150, y).lineTo(DW + 150, y).stroke({ width: 1, color: 0x2196f3, alpha: y % 120 === 0 ? 0.5 : 0.13 });
    overlay.addChild(grid);
    for (let x = 0; x <= DW; x += 120) { const t = new Text({ text: "x" + x, style: { fill: "#0d47a1", fontFamily: FONT, fontSize: 15, fontWeight: "bold" } }); t.position.set(x + 2, 30); overlay.addChild(t); }
    for (let y = 120; y < DH; y += 120) { const t = new Text({ text: "y" + y, style: { fill: "#0d47a1", fontFamily: FONT, fontSize: 15, fontWeight: "bold" } }); t.position.set(2, y + 1); overlay.addChild(t); }
    // editable parquet direction: VP1 = the reference plank (green Pn→Pf) extended to the horizon
    const vpe = { x: VP1.x, y: VP1.y };
    const vpe2 = { x: VP2.x, y: VP2.y };   // VP2 = butt-joint cross-direction (amber Qn→Qf)
    const boards = new Graphics(); overlay.addChild(boards);
    const drawBoards = () => {
      boards.clear();
      // VP1 fan — plank direction (green), lines converge toward VP1
      const at = (bx: number, Y: number) => ({ x: vpe.x + (bx - vpe.x) * (Y - vpe.y) / (_BKY - vpe.y), y: Y });
      for (const bx of [60, 180, 300, 420, 540]) { const a = at(bx, _BKY - 70), b = at(bx, _FRY + 50); boards.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2, color: 0x00c853, alpha: 0.55 }); }
      // VP2 fan — butt-joint cross direction (amber), lines converge toward VP2
      const at2y = (x: number, A: Pt) => vpe2.y + (A.y - vpe2.y) * (x - vpe2.x) / (A.x - vpe2.x || 1);
      for (const A of [{ x: 250, y: 440 }, { x: 250, y: 600 }, { x: 250, y: 760 }, { x: 250, y: 920 }] as Pt[]) {
        boards.moveTo(-120, at2y(-120, A)).lineTo(DW + 120, at2y(DW + 120, A)).stroke({ width: 2, color: 0xff9100, alpha: 0.5 });
      }
    };
    // DRAGGABLE boundary polygon (6): BL, BR, MR, FR, FL, ML (cyan = side midpoints).
    const lbl = ["BL", "BR", "MR", "FR", "FL", "ML"];
    const ed: Pt[] = FLOOR_PTS.map((p) => ({ x: p.x, y: p.y }));
    // reference plank Pn(near)→Pf(far), seeded along the current VP1 direction (green handles)
    const refAt = (Y: number) => ({ x: VP1.x + (230 - VP1.x) * (Y - VP1.y) / (700 - VP1.y), y: Y });
    const prq: Pt[] = [refAt(700), refAt(500)];
    // reference butt-joint Qn→Qf, seeded along the current VP2 direction (amber handles)
    const seedA: Pt = { x: 360, y: 640 };
    const refAt2 = (X: number) => ({ x: X, y: VP2.y + (seedA.y - VP2.y) * (X - VP2.x) / (seedA.x - VP2.x) });
    const prq2: Pt[] = [refAt2(430), refAt2(150)];
    const shape = new Graphics(); overlay.addChild(shape);
    overlay.addChild(new Graphics().roundRect(-148, 2, DW + 296, 23, 6).fill({ color: 0xffffff, alpha: 0.86 }));
    const readout = new Text({ text: "", style: { fill: "#b71c1c", fontFamily: FONT, fontSize: 13, fontWeight: "bold" } });
    readout.position.set(-142, 6); overlay.addChild(readout);
    const handles: Graphics[] = [];
    let drag: number | null = null;
    const redraw = () => {
      shape.clear().poly(ed.flatMap((p) => [p.x, p.y])).stroke({ width: 4, color: 0xff1744 });
      shape.moveTo(prq[0].x, prq[0].y).lineTo(prq[1].x, prq[1].y).stroke({ width: 3, color: 0x00e676 });
      shape.moveTo(prq2[0].x, prq2[0].y).lineTo(prq2[1].x, prq2[1].y).stroke({ width: 3, color: 0xffab40 });
      handles.forEach((h, i) => { const p = i < 6 ? ed[i] : i < 8 ? prq[i - 6] : prq2[i - 8]; h.position.set(p.x, p.y); });
      vpe.x = prq[0].x + (prq[1].x - prq[0].x) * (vpe.y - prq[0].y) / (prq[1].y - prq[0].y || 1);   // line → horizon
      vpe2.x = prq2[0].x + (prq2[1].x - prq2[0].x) * (vpe2.y - prq2[0].y) / (prq2[1].y - prq2[0].y || 1);
      drawBoards();
      readout.text = ed.map((p, i) => `${lbl[i]} ${Math.round(p.x)},${Math.round(p.y)}`).join(" ") + `  VP1 ${Math.round(vpe.x)}  VP2 ${Math.round(vpe2.x)}`;
      (window as unknown as { __floor: number[][]; __vp: number[] }).__floor = ed.map((p) => [Math.round(p.x), Math.round(p.y)]);
      (window as unknown as { __vp: number[] }).__vp = [Math.round(vpe.x), Math.round(vpe.y)];
      (window as unknown as { __vp2: number[] }).__vp2 = [Math.round(vpe2.x), Math.round(vpe2.y)];
    };
    const mk = (label: string, color: number, idx: number) => {
      const h = new Graphics().circle(0, 0, 19).fill({ color, alpha: 0.85 }).stroke({ width: 3, color: 0xb71c1c });
      const t = new Text({ text: label, style: { fill: "#b71c1c", fontFamily: FONT, fontSize: 13, fontWeight: "bold" } });
      t.anchor.set(0.5); h.addChild(t);
      h.eventMode = "static"; h.cursor = "grab";
      h.on("pointerdown", (e) => { drag = idx; e.stopPropagation(); });
      overlay.addChild(h); handles.push(h);
    };
    ed.forEach((_, i) => mk(lbl[i], i === 2 || i === 5 ? 0x4fc3f7 : 0xffeb3b, i));
    ["Pn", "Pf"].forEach((label, i) => mk(label, 0x00e676, 6 + i));
    ["Qn", "Qf"].forEach((label, i) => mk(label, 0xff9100, 8 + i));
    app.stage.on("pointermove", (e) => {
      if (drag == null) return;
      const lp = overlay.toLocal(e.global);
      const x = clamp(lp.x, -160, DW + 160), y = clamp(lp.y, -100, DH + 100);
      if (drag < 6) { ed[drag].x = x; ed[drag].y = y; } else if (drag < 8) { prq[drag - 6].x = x; prq[drag - 6].y = y; } else { prq2[drag - 8].x = x; prq2[drag - 8].y = y; }
      redraw();
    });
    app.stage.on("pointerup", () => { drag = null; });
    app.stage.on("pointerupoutside", () => { drag = null; });
    redraw();
  }

  // ?props — cut-out tuner (open localhost:5063/?props): carpet down + plant/lamp cut-outs LIVE on
  // top, draggable per-vertex so each silhouette hugs its base (no wood frame, no carpet over base).
  if (/props/.test(location.search)) {
    boardsC.visible = false; couch.visible = false; couchShadow.visible = false;
    hud.visible = false; toolbar.visible = false; carpet.visible = true; carpet.alpha = 1;
    gsap.globalTimeline.clear();
    viewZoom = 1.2; layout();
    const clampP = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const bgTexP = tex("room-bg.webp")!;
    const sP = DW / bgTexP.width, oyP = (DH - bgTexP.height * (DW / bgTexP.width)) / 2;
    const bgMatP = new Matrix(sP, 0, 0, sP, 0, oyP);
    const seedP = (window as unknown as { __props: number[][] }).__props;
    const polys: Pt[][] = seedP.map((flat) => { const a: Pt[] = []; for (let i = 0; i < flat.length; i += 2) a.push({ x: flat[i], y: flat[i + 1] }); return a; });
    const colorsP = [0x00e676, 0xff9100];
    const outlineP = new Graphics(); overlay.addChild(outlineP);
    overlay.addChild(new Graphics().roundRect(-148, 2, DW + 296, 23, 6).fill({ color: 0xffffff, alpha: 0.86 }));
    const readoutP = new Text({ text: "", style: { fill: "#1b5e20", fontFamily: FONT, fontSize: 12, fontWeight: "bold" } });
    readoutP.position.set(-142, 6); overlay.addChild(readoutP);
    const handlesP: Graphics[] = [];
    let dragP: { pi: number; vi: number } | null = null;
    const redrawP = () => {
      for (const c of props.removeChildren()) c.destroy();
      for (const poly of polys) props.addChild(new Graphics().poly(poly.flatMap((p) => [p.x, p.y])).fill({ texture: bgTexP, matrix: bgMatP }));
      outlineP.clear();
      polys.forEach((poly, pi) => outlineP.poly(poly.flatMap((p) => [p.x, p.y])).stroke({ width: 1.5, color: colorsP[pi] }));
      let hi = 0;
      polys.forEach((poly) => poly.forEach((p) => handlesP[hi++].position.set(p.x, p.y)));
      readoutP.text = "PLANT [" + polys[0].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ") + "]  LAMP [" + polys[1].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ") + "]";
      (window as unknown as { __props: number[][] }).__props = polys.map((poly) => poly.flatMap((p) => [Math.round(p.x), Math.round(p.y)]));
    };
    polys.forEach((poly, pi) => poly.forEach((_, vi) => {
      const h = new Graphics().circle(0, 0, 8).fill({ color: colorsP[pi], alpha: 0.9 }).stroke({ width: 2, color: 0x10240f });
      h.eventMode = "static"; h.cursor = "grab";
      h.on("pointerdown", (e) => { dragP = { pi, vi }; e.stopPropagation(); });
      overlay.addChild(h); handlesP.push(h);
    }));
    app.stage.on("pointermove", (e) => {
      if (!dragP) return;
      const lp = overlay.toLocal(e.global);
      polys[dragP.pi][dragP.vi].x = clampP(lp.x, -200, DW + 200);
      polys[dragP.pi][dragP.vi].y = clampP(lp.y, -200, DH + 200);
      redrawP();
    });
    app.stage.on("pointerup", () => { dragP = null; });
    app.stage.on("pointerupoutside", () => { dragP = null; });
    redrawP();
    (window as unknown as { __pr: unknown }).__pr = { polys, redraw: redrawP };
  }

  // Ensure the static validator sees the CTA hook is wired.
  void (() => window.FbPlayableAd.onCTAClick);
}

main().catch((e) => {
  // Surface boot failures instead of swallowing them.
  // eslint-disable-next-line no-console
  console.error("Dream Floor failed to start:", e);
});
