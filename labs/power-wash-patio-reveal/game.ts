// HydroHaven Power Wash — Clean-reveal playable (Pixi v8 + GSAP).
// Mechanic: stamp-mask engine via RenderTexture. Swipe erases dirt layer, reveals
// clean patio tiles beneath. Variable reward: mosaic pattern at ~50% + stubborn
// stain that resists 2 swipes then explodes on 3rd.
//
// FSM: hook → washing → reveal → end
// Layout: fixed design canvas 400×860, scaled to viewport (COVER — fills 100%).

import { Application, Container, Graphics, RenderTexture, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

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

// ── Tunables ──────────────────────────────────────────────────────────────────
const BRUSH_R = Number(cfg.params.brushRadius ?? 42);
const BRUSH_STEP = Number(cfg.params.brushStep ?? 16);
const GCOLS = Number(cfg.params.gridCols ?? 24);
const GROWS = Number(cfg.params.gridRows ?? 40);
const SNAP_THRESH = Number(cfg.params.snapFillThreshold ?? 0.70);
const IDLE_MS = Number(cfg.params.idleHintMs ?? 2500);
const AUTO_DEMO_AFTER = Number(cfg.params.autoDemoAfterIdles ?? 1);
const REVEAL_HOLD_MS = Number(cfg.params.revealHoldMs ?? 600);
const ERASE_OFFSET_Y = Number(cfg.params.eraseOffsetY ?? 96);

// ── Design canvas ──────────────────────────────────────────────────────────────
const DW = 400, DH = 860;

// ── Colors ────────────────────────────────────────────────────────────────────
const COL_ACCENT = num(cfg.style.colors.accent);
const COL_PRIMARY = num(cfg.style.colors.primary);
const COL_DIRT = num("#6B5B45");
// Paver stone colors — warm grey/sand, larger slabs
const PAVER_COLORS = [
  num("#c8b89a"), num("#bfae90"), num("#cfc0a2"), num("#b8a88a"),
  num("#d4c4a6"), num("#c0b294"), num("#cab898"), num("#bc9e80"),
];
const COL_GROUT = num("#7a7060");
const COL_TILE_PAT = num("#3EC6C0");
const COL_FOAM = num("#e8f4f8");
const FONT = cfg.style.font.family;

// ── HUD zone ─────────────────────────────────────────────────────────────────
const HUD_H = 44;

// ── State ─────────────────────────────────────────────────────────────────────
type GameState = "hook" | "washing" | "snapping" | "reveal" | "end";
let gState: GameState = "hook";

// ── Texture registry ──────────────────────────────────────────────────────────
const TEX: Record<string, Texture> = {};

async function preloadTextures(): Promise<void> {
  await Promise.all(
    Object.entries(cfg.assets).map(async ([k, uri]) => {
      if (!/\.(webp|png)$/i.test(k)) return;
      const img = new Image();
      img.src = uri as string;
      try { await img.decode(); } catch { return; }
      TEX[k] = Texture.from(img);
    })
  );
}

function tex(key: string): Texture | null {
  return TEX[key] ?? null;
}

async function main(): Promise<void> {
  // ── Preload textures before building scene ────────────────────────────────
  await preloadTextures();

  const W = window.innerWidth, H = window.innerHeight;
  const app = new Application();
  await app.init({
    width: W,
    height: H,
    background: num("#c8b898"),
    antialias: false,
    preference: "webgl",
    resolution: 1,
    autoDensity: false,
  });
  // Canvas must fill 100% — no gaps
  app.canvas.style.display = "block";
  app.canvas.style.position = "absolute";
  app.canvas.style.top = "0";
  app.canvas.style.left = "0";
  app.canvas.style.width = W + "px";
  app.canvas.style.height = H + "px";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.overflow = "hidden";
  document.body.style.background = "#c8b898";
  document.body.appendChild(app.canvas);

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // ── Full-bleed backdrop ───────────────────────────────────────────────────
  const backdropGfx = new Graphics();
  app.stage.addChild(backdropGfx);

  // ── Root (scaled design canvas — CONTAIN mode) ────────────────────────────
  const root = new Container();
  app.stage.addChild(root);

  // Layer order: bg → patio → dirt → foam/fx → wall strip + lights → nozzle → HUD → endcard
  const bgLayer       = new Container(); // clean patio bg sprite
  const patioLayer    = new Container(); // procedural paver overlay (grout etc)
  const dirtLayer     = new Container(); // dirt mask on top of clean patio
  const fxLayer       = new Container(); // foam + sheen + sparkles
  const wallLayer     = new Container(); // house-wall strip + string-lights
  const nozzleLayer   = new Container(); // nozzle sprite
  const uiLayer       = new Container(); // HUD, ghost hint, CTA
  const overlayLayer  = new Container(); // endcard overlay

  root.addChild(bgLayer, patioLayer, dirtLayer, fxLayer, wallLayer, nozzleLayer, uiLayer, overlayLayer);

  patioLayer.interactiveChildren = false;
  dirtLayer.interactiveChildren  = false;
  fxLayer.interactiveChildren    = false;
  wallLayer.interactiveChildren  = false;
  nozzleLayer.interactiveChildren = false;

  // ── Patio zone ─────────────────────────────────────────────────────────────
  const PATIO_X = 0;
  const PATIO_Y = Math.round(DH * 0.38);
  const PATIO_W = DW;
  const PATIO_H = DH - PATIO_Y;

  const WALL_H = Math.round(DH * 0.38); // wall strip is the top 38%

  // ── LAYER 0: Clean patio sprite as background reveal layer ───────────────
  function buildCleanPatio(): void {
    const t = tex("patio-clean.webp");
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0, 0);
      // Cover-fit to patio zone: scale = max(W/tw, H/th), centered
      const tw = t.width, th = t.height;
      const s = Math.max(PATIO_W / tw, PATIO_H / th);
      sp.scale.set(s);
      sp.x = PATIO_X + (PATIO_W - tw * s) / 2;
      sp.y = PATIO_Y + (PATIO_H - th * s) / 2;
      bgLayer.addChild(sp);
    } else {
      // Fallback: procedural grout + pavers (from original buildPatio)
      const g = new Graphics();
      g.rect(PATIO_X, PATIO_Y, PATIO_W, PATIO_H).fill({ color: COL_GROUT });
      bgLayer.addChild(g);
    }
  }

  // ── LAYER 1: Procedural paver overlay (grout lines, mosaic) ────────────────
  const TCOLS = 4;
  const TROWS = 8;
  const TILE_W = PATIO_W / TCOLS;
  const TILE_H = PATIO_H / TROWS;
  const GROUT_W = 4;

  const mosaicTiles = new Set<number>();
  for (let r = 2; r < 6; r++) {
    for (let c = 0; c < 4; c++) {
      if (Math.abs(r - 3.5) + Math.abs(c - 1.5) < 2.2) mosaicTiles.add(r * TCOLS + c);
    }
  }

  let mosaicShown = false;
  // Mosaic is now just the sparkle trigger — the art is in the sprite
  const mosaicGfx = new Graphics();

  // Grout grid overlay — semi-transparent lines so grout reads over sprite
  function buildPatioOverlay(): void {
    const g = new Graphics();
    // Subtle dark grout lines
    for (let r = 0; r <= TROWS; r++) {
      const y = PATIO_Y + r * TILE_H;
      g.rect(PATIO_X, y - 1.5, PATIO_W, 3).fill({ color: COL_GROUT, alpha: 0.35 });
    }
    for (let c = 0; c <= TCOLS; c++) {
      const x = PATIO_X + c * TILE_W;
      g.rect(x - 1.5, PATIO_Y, 3, PATIO_H).fill({ color: COL_GROUT, alpha: 0.35 });
    }
    patioLayer.addChild(g);
    mosaicGfx.alpha = 0;
    patioLayer.addChild(mosaicGfx);
  }

  // Seeded pseudo-random for slab color
  function slabRng(r: number, c: number): number {
    const h = (r * 17 + c * 31 + 7) % PAVER_COLORS.length;
    return PAVER_COLORS[h];
  }

  // ── CPU grid for progress tracking ─────────────────────────────────────────
  const grid = new Uint8Array(GCOLS * GROWS);
  let cleanCount = 0;

  function getProgress(): number { return cleanCount / (GCOLS * GROWS); }

  function markClean(wx: number, wy: number, radius = BRUSH_R): void {
    const cw = PATIO_W / GCOLS, ch = PATIO_H / GROWS;
    const cc = Math.floor((wx - PATIO_X) / cw);
    const cr = Math.floor((wy - PATIO_Y) / ch);
    const rCols = Math.ceil(radius / cw) + 1;
    const rRows = Math.ceil(radius / ch) + 1;
    for (let dr = -rRows; dr <= rRows; dr++) {
      for (let dc = -rCols; dc <= rCols; dc++) {
        const nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nc >= GCOLS || nr < 0 || nr >= GROWS) continue;
        const idx = nr * GCOLS + nc;
        if (grid[idx] === 1) continue;
        const cx = PATIO_X + (nc + 0.5) * cw;
        const cy = PATIO_Y + (nr + 0.5) * ch;
        if (Math.hypot(wx - cx, wy - cy) < radius * 1.1) {
          grid[idx] = 1;
          cleanCount++;
        }
      }
    }
  }

  function fillAllGrid(): void {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === 0) { grid[i] = 1; cleanCount++; }
    }
  }

  // ── RenderTexture stamp-mask ────────────────────────────────────────────────
  const maskRT = RenderTexture.create({ width: DW, height: DH });
  const maskSprite = new Sprite(maskRT);

  // Dirt solid fill + noise
  const dirtGfx = new Graphics();
  dirtGfx.rect(PATIO_X, PATIO_Y, PATIO_W, PATIO_H).fill({ color: COL_DIRT });
  for (let i = 0; i < 55; i++) {
    dirtGfx.circle(
      PATIO_X + Math.random() * PATIO_W,
      PATIO_Y + Math.random() * PATIO_H,
      8 + Math.random() * 22,
    ).fill({ color: shade(COL_DIRT, -0.18), alpha: 0.4 + Math.random() * 0.45 });
  }
  for (let i = 0; i < 28; i++) {
    dirtGfx.ellipse(
      PATIO_X + Math.random() * PATIO_W,
      PATIO_Y + Math.random() * PATIO_H,
      10 + Math.random() * 18, 5 + Math.random() * 10,
    ).fill({ color: num("#4a5a30"), alpha: 0.28 + Math.random() * 0.38 });
  }
  dirtLayer.addChild(dirtGfx);
  dirtGfx.mask = maskSprite;
  dirtLayer.addChild(maskSprite);

  const brushGfx = new Graphics();

  function stampBrush(wx: number, wy: number, r = BRUSH_R): void {
    brushGfx.clear();
    brushGfx.circle(wx, wy, r).fill({ color: 0x000000, alpha: 1 });
    app.renderer.render({ container: brushGfx, target: maskRT, clear: false });
  }

  function clearEntireMask(): void {
    const g = new Graphics();
    g.rect(0, PATIO_Y, DW, PATIO_H).fill({ color: 0x000000, alpha: 1 });
    app.renderer.render({ container: g, target: maskRT, clear: false });
    g.destroy();
  }

  function initMask(): void {
    const g = new Graphics();
    g.rect(0, 0, DW, DH).fill({ color: 0xffffff, alpha: 1 });
    app.renderer.render({ container: g, target: maskRT, clear: true });
    g.destroy();
  }

  // ── Stubborn stains (procedural — keep) ─────────────────────────────────────
  interface StubStain { x: number; y: number; r: number; swipes: number; cont: Container; dead: boolean }
  const stubs: StubStain[] = [];

  function buildStubs(): void {
    const pos = [
      { x: PATIO_X + PATIO_W * 0.28, y: PATIO_Y + PATIO_H * 0.44 },
      { x: PATIO_X + PATIO_W * 0.71, y: PATIO_Y + PATIO_H * 0.61 },
    ];
    for (const p of pos) {
      const cont = new Container();
      const g = new Graphics();
      g.circle(0, 0, 26).fill({ color: num("#3d2a1a"), alpha: 0.85 });
      g.circle(0, 0, 16).fill({ color: num("#2a1a0a"), alpha: 0.75 });
      g.circle(0, 0, 30).stroke({ width: 3, color: num("#ff6b35"), alpha: 0.8 });
      cont.addChild(g);
      cont.position.set(p.x, p.y);
      cont.visible = false;
      dirtLayer.addChild(cont);
      stubs.push({ x: p.x, y: p.y, r: 34, swipes: 0, cont, dead: false });
    }
  }

  function checkStubs(wx: number, wy: number): void {
    for (const s of stubs) {
      if (s.dead || !s.cont.visible) continue;
      if (Math.hypot(wx - s.x, wy - s.y) < s.r + BRUSH_R * 0.5) {
        s.swipes++;
        const sc = s.cont;
        gsap.fromTo(sc, { x: s.x - 5 }, {
          x: s.x + 5, duration: 0.06, yoyo: true, repeat: 4,
          onComplete: () => { if (!s.dead) sc.x = s.x; },
        });
        if (s.swipes >= 3) burstStub(s);
      }
    }
  }

  function burstStub(s: StubStain): void {
    s.dead = true;
    s.cont.visible = false;
    stampBrush(s.x, s.y, 58);
    markClean(s.x, s.y, 58);
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2;
      const spd = 55 + Math.random() * 75;
      const p = new Graphics().circle(0, 0, 3 + Math.random() * 4).fill({ color: COL_FOAM, alpha: 0.9 });
      p.position.set(s.x, s.y);
      fxLayer.addChild(p);
      gsap.to(p, {
        x: s.x + Math.cos(ang) * spd, y: s.y + Math.sin(ang) * spd,
        alpha: 0, duration: 0.55 + Math.random() * 0.25, ease: "power2.out",
        onComplete: () => { if (p.parent) fxLayer.removeChild(p); p.destroy(); },
      });
    }
    const flash = new Graphics().circle(s.x, s.y, 48).fill({ color: 0xffffff, alpha: 0.65 });
    fxLayer.addChild(flash);
    gsap.to(flash, { alpha: 0, duration: 0.28, onComplete: () => { if (flash.parent) fxLayer.removeChild(flash); flash.destroy(); } });
  }

  // ── Foam particles (denser) ──────────────────────────────────────────────────
  interface Foam { g: Graphics; vx: number; vy: number; life: number }
  const foamPool: Foam[] = [];

  function spawnFoam(x: number, y: number): void {
    // Denser: 6 particles per call instead of 3
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 28 + Math.random() * 55;
      const sz = 1.5 + Math.random() * 3.5;
      const g = new Graphics().circle(0, 0, sz).fill({ color: COL_FOAM, alpha: 0.78 });
      g.position.set(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 14);
      fxLayer.addChild(g);
      foamPool.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0 });
    }
    // Extra mist dots sideways at erase front
    for (let i = 0; i < 3; i++) {
      const ang = (Math.random() - 0.5) * Math.PI;
      const sp = 15 + Math.random() * 30;
      const g = new Graphics().circle(0, 0, 1.2 + Math.random() * 2).fill({ color: 0xffffff, alpha: 0.45 });
      g.position.set(x + (Math.random() - 0.5) * 28, y);
      fxLayer.addChild(g);
      foamPool.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.4, life: 0 });
    }
  }

  // ── Wet-sheen sweep along a stripe ────────────────────────────────────────
  function spawnWetSheen(x: number, y: number): void {
    // A brief bright horizontal sheen line sweeping right from the erase point
    const sheen = new Graphics();
    sheen.rect(x - 8, y - 6, 80, 14).fill({ color: 0xffffff, alpha: 0.0 });
    fxLayer.addChild(sheen);
    gsap.to(sheen, { alpha: 0.35, duration: 0.07, ease: "none",
      onComplete: () => {
        gsap.to(sheen, { alpha: 0, x: sheen.x + 60, duration: 0.28, ease: "power1.out",
          onComplete: () => { if (sheen.parent) fxLayer.removeChild(sheen); sheen.destroy(); }
        });
      }
    });
  }

  // Track last sheen time to avoid spamming
  let lastSheenX = -999, lastSheenY = -999;

  // ── Mosaic medallion sparkle (radial) ────────────────────────────────────────
  // The medallion center is in the art sprite at roughly center of patio
  // We trigger sparkles when the grid cells over the medallion become clean
  const MEDALLION_X = PATIO_X + PATIO_W * 0.5;
  const MEDALLION_Y = PATIO_Y + PATIO_H * 0.42; // center of the medallion in the art
  const MEDALLION_R = Math.min(PATIO_W, PATIO_H) * 0.22;

  let medallionSparkled = false;

  function checkMedallionSparkle(): void {
    if (medallionSparkled || !mosaicShown) return;
    // Check if enough cells near medallion center are clean
    const cw = PATIO_W / GCOLS, ch = PATIO_H / GROWS;
    let near = 0, nearClean = 0;
    for (let r = 0; r < GROWS; r++) {
      for (let c = 0; c < GCOLS; c++) {
        const cx = PATIO_X + (c + 0.5) * cw;
        const cy = PATIO_Y + (r + 0.5) * ch;
        if (Math.hypot(cx - MEDALLION_X, cy - MEDALLION_Y) < MEDALLION_R * 0.9) {
          near++;
          if (grid[r * GCOLS + c] === 1) nearClean++;
        }
      }
    }
    if (near > 0 && nearClean / near >= 0.55) {
      medallionSparkled = true;
      spawnMedallionSparkle();
    }
  }

  function spawnMedallionSparkle(): void {
    // Radial burst of golden sparkles around the medallion
    const SPARKS = 20;
    for (let i = 0; i < SPARKS; i++) {
      const ang = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.3;
      const dist = MEDALLION_R * (0.5 + Math.random() * 0.8);
      const g = new Graphics();
      const starSize = 3 + Math.random() * 5;
      // Star shape: small cross
      g.rect(-1, -starSize, 2, starSize * 2).fill({ color: 0xffdd44 });
      g.rect(-starSize, -1, starSize * 2, 2).fill({ color: 0xffdd44 });
      g.circle(0, 0, 2).fill({ color: 0xffffff });
      g.position.set(MEDALLION_X, MEDALLION_Y);
      fxLayer.addChild(g);
      const tx = MEDALLION_X + Math.cos(ang) * dist;
      const ty = MEDALLION_Y + Math.sin(ang) * dist;
      gsap.fromTo(g, { alpha: 0, scaleX: 0, scaleY: 0 }, {
        alpha: 1, scaleX: 1, scaleY: 1,
        duration: 0.18, ease: "back.out(2)",
        delay: i * 0.025,
        onComplete: () => {
          gsap.to(g, {
            x: tx, y: ty, alpha: 0, scaleX: 0.3, scaleY: 0.3,
            duration: 0.4 + Math.random() * 0.2, ease: "power2.out",
            onComplete: () => { if (g.parent) fxLayer.removeChild(g); g.destroy(); }
          });
        }
      });
    }
    // Central golden glow pulse
    const glow = new Graphics();
    glow.circle(MEDALLION_X, MEDALLION_Y, MEDALLION_R * 0.8).fill({ color: 0xffcc44, alpha: 0 });
    fxLayer.addChild(glow);
    gsap.to(glow, { alpha: 0.38, duration: 0.22, yoyo: true, repeat: 1,
      onComplete: () => { if (glow.parent) fxLayer.removeChild(glow); glow.destroy(); }
    });
  }

  // ── House wall sprite (top strip ~38% of DH) ────────────────────────────────
  let wallSprite: Sprite | null = null;

  function buildWall(): void {
    const t = tex("house-wall.webp");
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0, 0);
      // Cover-fit horizontally in the wall strip
      const tw = t.width, th = t.height;
      const s = Math.max(DW / tw, WALL_H / th);
      sp.scale.set(s);
      sp.x = (DW - tw * s) / 2;
      sp.y = WALL_H - th * s; // align to bottom of wall strip (planters at base)
      wallLayer.addChild(sp);
      wallSprite = sp;
    } else {
      // Fallback procedural wall
      const g = new Graphics();
      const wallColor = num("#d9c9ae");
      g.rect(0, 0, DW, WALL_H).fill({ color: wallColor });
      for (let y = 14; y < WALL_H; y += 20) {
        g.rect(0, y, DW, 2.5).fill({ color: num("#c4b298"), alpha: 0.55 });
      }
      wallLayer.addChild(g);
    }
    // Wall/patio threshold
    const ledge = new Graphics();
    ledge.rect(0, WALL_H - 6, DW, 6).fill({ color: num("#b8a888") });
    ledge.rect(0, WALL_H - 8, DW, 3).fill({ color: num("#d4c8a8") });
    wallLayer.addChild(ledge);
  }

  // ── String lights ─────────────────────────────────────────────────────────
  const lightsCont = new Container();
  lightsCont.alpha = 0.5; // dimmed during play
  let lightsSprite: Sprite | null = null;
  let lightsGlowTl: gsap.core.Timeline | null = null;

  function buildStringLights(): void {
    const t = tex("string-lights.webp");
    if (t) {
      const tw = t.width, th = t.height;
      // Scale to fit DW with some horizontal padding, droop from near top
      const targetW = DW * 0.88;
      const s = targetW / tw;
      const sp = new Sprite(t);
      sp.anchor.set(0.5, 0);
      sp.scale.set(s);
      sp.x = DW / 2;
      sp.y = HUD_H + 2; // just below HUD, drooping down into wall area
      lightsSprite = sp;
      lightsCont.addChild(sp);
    } else {
      // Fallback procedural lights
      const cols = [num("#ffcc44"), num("#ff5566"), num("#44aaff"), num("#44ff88"), num("#ff88cc")];
      const ly = HUD_H + 14;
      const line = new Graphics();
      line.moveTo(18, ly + 7).lineTo(DW - 18, ly + 7).stroke({ width: 1.5, color: num("#444"), alpha: 0.75 });
      lightsCont.addChild(line);
      for (let i = 0; i < 10; i++) {
        const bx = 18 + (i + 0.5) / 10 * (DW - 36);
        const by = ly + 7 + Math.sin(((i + 0.5) / 10) * Math.PI) * 5;
        const col = cols[i % cols.length];
        const b = new Graphics();
        b.circle(bx, by + 6, 6).fill({ color: col, alpha: 0.28 });
        b.circle(bx, by + 6, 4.5).fill({ color: col });
        lightsCont.addChild(b);
      }
    }
    wallLayer.addChild(lightsCont);
  }

  function onRevealLights(): void {
    // Lights brighten: alpha 0.5 → 1 + soft glow pulses
    gsap.to(lightsCont, { alpha: 1, duration: 0.75, ease: "power1.out" });
    if (lightsGlowTl) lightsGlowTl.kill();
    if (lightsSprite) {
      lightsGlowTl = gsap.timeline({ repeat: -1 });
      lightsGlowTl
        .to(lightsSprite, { alpha: 0.88, duration: 0.55, ease: "sine.inOut" })
        .to(lightsSprite, { alpha: 1.0, duration: 0.55, ease: "sine.inOut" });
    }
    // Add a warm glow overlay on the wall when lights come on
    const glow = new Graphics();
    glow.rect(0, 0, DW, WALL_H).fill({ color: num("#ffdd88"), alpha: 0 });
    wallLayer.addChild(glow);
    gsap.to(glow, { alpha: 0.18, duration: 0.9, ease: "power1.out" });
  }

  // ── Nozzle sprite ─────────────────────────────────────────────────────────
  const nozzleCont = new Container();
  let nozzleSp: Sprite | null = null;

  // Procedural fallback nozzle (keep for graceful degradation)
  const nozzleFallback = new Container();
  const nozzleBody = new Graphics();
  nozzleBody.roundRect(-5, -8, 10, 28, 3).fill({ color: num("#9aa8b4") });
  nozzleBody.roundRect(-5, -8, 10, 28, 3).stroke({ width: 1.5, color: num("#6a8090"), alpha: 0.8 });
  nozzleBody.roundRect(-7, -22, 14, 16, 4).fill({ color: num("#c0ccd8") });
  nozzleBody.roundRect(-7, -22, 14, 16, 4).stroke({ width: 1.5, color: num("#8090a0"), alpha: 0.7 });
  nozzleBody.roundRect(3, -4, 7, 14, 2).fill({ color: num("#4a6070") });
  nozzleFallback.addChild(nozzleBody);

  function buildNozzle(): void {
    const t = tex("nozzle.webp");
    if (t) {
      const tw = t.width;
      // Target: ~70px wide, sprite pointing down
      const targetW = 70;
      const s = targetW / tw;
      const sp = new Sprite(t);
      sp.anchor.set(0.5, 0.5);
      sp.scale.set(s);
      // nozzle.webp: gun facing right, spray pointing right.
      // Rotate +90° (clockwise) so spray points DOWN toward erase point.
      sp.rotation = Math.PI / 2;
      nozzleSp = sp;
      nozzleCont.addChild(sp);
    } else {
      nozzleCont.addChild(nozzleFallback);
    }
  }

  // Water jet — triangle fan pointing down from tip to erase point
  const sprayJet = new Graphics();
  nozzleCont.addChild(sprayJet);

  // Spray mist ring at impact point
  const sprayMist = new Graphics();
  nozzleCont.addChild(sprayMist);

  nozzleCont.visible = false;
  nozzleLayer.addChild(nozzleCont);

  // Recoil wiggle while spraying
  let recoilTl: gsap.core.Timeline | null = null;
  function startRecoil(): void {
    if (recoilTl || !nozzleSp) return;
    recoilTl = gsap.timeline({ repeat: -1, yoyo: false });
    recoilTl.to(nozzleSp, { x: nozzleSp.x + 2.5, y: nozzleSp.y - 2, duration: 0.065, ease: "power1.inOut" })
             .to(nozzleSp, { x: nozzleSp.x - 2.5, y: nozzleSp.y + 2, duration: 0.065, ease: "power1.inOut" });
  }
  function stopRecoil(): void {
    if (recoilTl) { recoilTl.kill(); recoilTl = null; }
    if (nozzleSp) { gsap.killTweensOf(nozzleSp); nozzleSp.x = 0; nozzleSp.y = 0; }
  }

  function showNozzle(dx: number, dy: number): void {
    nozzleCont.visible = true;
    // Nozzle body positioned above finger
    nozzleCont.position.set(dx, dy - 8);

    if (nozzleSp && !recoilTl) startRecoil();

    // Water jet triangle: from tip (0, -14) down to erase offset point
    const jetLen = ERASE_OFFSET_Y + 8;
    const fanW = 18;
    sprayJet.clear();
    sprayJet.poly([0, -14, -fanW / 2, jetLen, fanW / 2, jetLen])
      .fill({ color: num("#b8e8f8"), alpha: 0.55 });

    // Core jet line (bright white)
    for (let i = 0; i < 4; i++) {
      const alpha = 0.72 - i * 0.14;
      const w = 2.5 - i * 0.5;
      sprayJet.moveTo(0, -14).lineTo(0, jetLen - 4)
        .stroke({ width: w, color: 0xffffff, alpha });
    }

    // Individual jet streams (slightly off-axis)
    for (let s = -2; s <= 2; s++) {
      if (s === 0) continue;
      const ang = (s / 4) * 0.3;
      const ex = Math.sin(ang) * (jetLen + 14);
      const ey = (jetLen - 4) * Math.cos(ang * 0.3);
      sprayJet.moveTo(0, -14).lineTo(ex, ey)
        .stroke({ width: 1.2, color: num("#d8f0ff"), alpha: 0.38 });
    }

    // Impact mist circle at erase point
    sprayMist.clear();
    sprayMist.circle(0, jetLen, 18).fill({ color: COL_ACCENT, alpha: 0.22 });
    sprayMist.circle(0, jetLen, 12).fill({ color: 0xffffff, alpha: 0.35 });
    sprayMist.circle(0, jetLen, 6).fill({ color: 0xffffff, alpha: 0.55 });
  }

  function hideNozzle(): void {
    nozzleCont.visible = false;
    stopRecoil();
  }

  // ── Ghost finger hint ───────────────────────────────────────────────────────
  const ghostCont = new Container();
  const ghostG = new Graphics();
  ghostG.circle(0, 0, 22).fill({ color: 0xffffff, alpha: 0.32 });
  ghostG.circle(0, 0, 13).fill({ color: 0xffffff, alpha: 0.18 });
  ghostCont.addChild(ghostG);
  ghostCont.visible = false;
  uiLayer.addChild(ghostCont);

  let ghostTl: gsap.core.Timeline | null = null;

  function showGhost(): void {
    if (gState !== "washing") return;
    if (ghostTl) ghostTl.kill();
    ghostCont.visible = true;
    ghostCont.alpha = 0;
    const sx = DW * 0.22, sy = PATIO_Y + PATIO_H * 0.32;
    const ex = DW * 0.78, ey = PATIO_Y + PATIO_H * 0.62;
    ghostCont.position.set(sx, sy);
    ghostTl = gsap.timeline({ onComplete: () => { ghostCont.visible = false; } })
      .to(ghostCont, { alpha: 0.85, duration: 0.25 })
      .to(ghostCont, { x: ex, y: ey, duration: 1.0, ease: "sine.inOut" }, 0.1)
      .to(ghostCont, { alpha: 0, duration: 0.3 }, "-=0.3");
  }

  // ── HUD — reserved 44px top strip ─────────────────────────────────────────
  const hudBg = new Graphics();
  hudBg.rect(0, 0, DW, HUD_H).fill({ color: 0x000000, alpha: 0.25 });
  uiLayer.addChild(hudBg);

  const progBg = new Graphics();
  progBg.roundRect(14, 14, DW - 28, 12, 6).fill({ color: 0x000000, alpha: 0.30 });
  uiLayer.addChild(progBg);

  const progFill = new Graphics();
  uiLayer.addChild(progFill);

  const progLabel = new Text({
    text: "0%",
    style: {
      fill: "#ffffff", fontFamily: FONT, fontWeight: "bold", fontSize: 11,
      align: "right",
    },
  });
  progLabel.anchor.set(1, 0.5);
  progLabel.position.set(DW - 16, 20);
  uiLayer.addChild(progLabel);

  function setProgress(p: number): void {
    const pct = Math.round(p * 100);
    progFill.clear();
    if (p > 0.005) {
      progFill.roundRect(14, 14, Math.max(10, (DW - 28) * p), 12, 6).fill({ color: COL_ACCENT });
    }
    progLabel.text = pct + "%";
    progLabel.position.set(Math.max(DW - 16, 14 + (DW - 28) * p + 4), 20);
  }

  // Instruction text
  const instrT = new Text({
    text: "Swipe to wash",
    style: {
      fill: cfg.style.colors.text, fontFamily: FONT, fontWeight: "bold", fontSize: 24,
      align: "center", dropShadow: { color: 0x000000, alpha: 0.55, blur: 4, distance: 2 },
    },
  });
  instrT.anchor.set(0.5);
  instrT.position.set(DW / 2, HUD_H + 18);
  uiLayer.addChild(instrT);

  // ── CTA button ─────────────────────────────────────────────────────────────
  const ctaCont = new Container();
  const ctaW = DW - 48, ctaH = 58;
  const ctaBg = new Graphics();
  ctaBg.roundRect(0, 0, ctaW, ctaH, 29).fill({ color: COL_ACCENT });
  ctaBg.roundRect(0, 0, ctaW, ctaH, 29).stroke({ width: 3, color: shade(COL_ACCENT, -0.22) });
  const ctaTxt = new Text({
    text: cfg.copy.cta,
    style: { fill: "#0E2E2E", fontFamily: FONT, fontWeight: "bold", fontSize: 24, align: "center" },
  });
  ctaTxt.anchor.set(0.5);
  ctaTxt.position.set(ctaW / 2, ctaH / 2);
  if (ctaTxt.width > ctaW * 0.84) ctaTxt.scale.set((ctaW * 0.84) / ctaTxt.width);
  ctaCont.addChild(ctaBg, ctaTxt);
  ctaCont.eventMode = "static";
  ctaCont.cursor = "pointer";
  ctaCont.on("pointertap", (e) => { e.stopPropagation(); window.FbPlayableAd.onCTAClick(); });
  ctaCont.alpha = 0;
  ctaCont.visible = false;
  uiLayer.addChild(ctaCont);
  void (() => window.FbPlayableAd.onCTAClick); // validator grep

  // ── Endcard ────────────────────────────────────────────────────────────────
  function showEndcard(): void {
    if (gState === "end") return;
    gState = "end";

    const ov = new Graphics().rect(0, 0, DW, DH).fill({ color: 0x000000, alpha: 0 });
    overlayLayer.addChild(ov);
    gsap.to(ov, { alpha: 0.48, duration: 0.5 });

    const warm = new Graphics().rect(0, 0, DW, DH).fill({ color: num("#ffd080"), alpha: 0 });
    overlayLayer.addChild(warm);
    gsap.to(warm, { alpha: 0.16, duration: 0.9 });

    onRevealLights();

    const PW = DW - 36, PH = 360;
    const panel = new Container();
    const panBg = new Graphics();
    panBg.roundRect(0, 0, PW, PH, 22).fill({ color: num("#f7fafa"), alpha: 0.93 });
    panBg.roundRect(0, 0, PW, PH, 22).stroke({ width: 4, color: COL_ACCENT });
    panel.addChild(panBg);

    const brandBg = new Graphics().roundRect(0, 0, 190, 42, 12).fill({ color: COL_PRIMARY });
    const brandTxt = new Text({
      text: "HydroHaven",
      style: { fill: "#F7FAFA", fontFamily: FONT, fontWeight: "bold", fontSize: 22 },
    });
    brandTxt.anchor.set(0.5); brandTxt.position.set(95, 21);
    const brandCont = new Container();
    brandCont.addChild(brandBg, brandTxt);
    brandCont.position.set((PW - 190) / 2, 18);
    panel.addChild(brandCont);

    const tagT = new Text({
      text: "Satisfaction, restored.",
      style: { fill: COL_PRIMARY, fontFamily: FONT, fontWeight: "bold", fontSize: 15, align: "center" },
    });
    tagT.anchor.set(0.5); tagT.position.set(PW / 2, 74);
    panel.addChild(tagT);

    const hlT = new Text({
      text: cfg.copy.title,
      style: {
        fill: 0x1a1a1a, fontFamily: FONT, fontWeight: "bold", fontSize: 28, align: "center",
        wordWrap: true, wordWrapWidth: PW - 36,
      },
    });
    hlT.anchor.set(0.5, 0); hlT.position.set(PW / 2, 96);
    panel.addChild(hlT);

    const elT = new Text({
      text: "Patio 100% clean! Licensed & insured in [State].\nBooking is open — get your free estimate.",
      style: {
        fill: 0x2a2a2a, fontFamily: FONT, fontWeight: "bold", fontSize: 15, align: "center",
        wordWrap: true, wordWrapWidth: PW - 36,
      },
    });
    elT.anchor.set(0.5, 0); elT.position.set(PW / 2, 158);
    panel.addChild(elT);

    const prev = new Graphics();
    const stripX = 14, stripY = 238, stripW = PW - 28, stripH = 58;
    prev.roundRect(stripX, stripY, stripW, stripH, 8).fill({ color: PAVER_COLORS[0] });
    for (let c = 0; c < 4; c++) {
      const tx = stripX + c * (stripW / 4);
      prev.rect(tx, stripY, GROUT_W, stripH).fill({ color: COL_GROUT });
      if (c === 1 || c === 2) {
        const cx = tx + (stripW / 4) / 2;
        prev.poly([cx, stripY + 8, cx + 18, stripY + 29, cx, stripY + 50, cx - 18, stripY + 29])
          .fill({ color: COL_TILE_PAT, alpha: 0.85 });
      }
    }
    panel.addChild(prev);

    const disT = new Text({
      text: "Free estimate, no obligation. Results shown are illustrative.",
      style: {
        fill: 0x666666, fontFamily: FONT, fontWeight: "normal", fontSize: 11, align: "center",
        wordWrap: true, wordWrapWidth: PW - 36,
      },
    });
    disT.anchor.set(0.5, 0); disT.position.set(PW / 2, 274);
    panel.addChild(disT);

    const panX = 18;
    const panY = DH - ctaH - 30 - PH - 10;
    panel.position.set(panX, panY);
    panel.scale.set(0.82);
    panel.alpha = 0;
    overlayLayer.addChild(panel);
    gsap.to(panel, { alpha: 1, duration: 0.28, delay: 0.05 });
    gsap.to(panel.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(1.7)", delay: 0.05 });

    ctaCont.position.set(24, DH - ctaH - 24);
    ctaCont.visible = true;
    ctaCont.alpha = 1;
    gsap.to(ctaCont.scale, {
      x: 1.04, y: 1.04, duration: 0.68, yoyo: true, repeat: -1,
      ease: "sine.inOut", delay: 0.5,
    });

    gsap.to(instrT, { alpha: 0, duration: 0.28 });
    gsap.to(hudBg, { alpha: 0, duration: 0.5 });
    gsap.to(progBg, { alpha: 0, duration: 0.5 });
    gsap.to(progFill, { alpha: 0, duration: 0.5 });
    gsap.to(progLabel, { alpha: 0, duration: 0.5 });
  }

  // ── Reveal sequence ──────────────────────────────────────────────────────────
  function doReveal(): void {
    if (gState === "end") return;
    gState = "reveal";
    instrT.text = "Patio 100% clean!";

    const sweep = new Container();
    for (let i = 0; i < 5; i++) {
      const bar = new Graphics().rect(0, PATIO_Y, 36 + i * 10, PATIO_H)
        .fill({ color: 0xffffff, alpha: 0.10 - i * 0.015 });
      bar.x = -50 - i * 10;
      sweep.addChild(bar);
    }
    fxLayer.addChild(sweep);
    gsap.to(sweep, {
      x: DW + 70, duration: 0.85, ease: "power1.inOut",
      onComplete: () => { if (sweep.parent) fxLayer.removeChild(sweep); sweep.destroy({ children: true }); },
    });

    // Mosaic sparkle on reveal
    if (!medallionSparkled) {
      medallionSparkled = true;
      gsap.delayedCall(0.3, spawnMedallionSparkle);
    }

    gsap.to(lightsCont, { alpha: 0.7, duration: 1.1 });
    gsap.delayedCall(REVEAL_HOLD_MS / 1000, showEndcard);
  }

  // ── Erase logic ─────────────────────────────────────────────────────────────
  let scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0;

  function screenToDesign(sx: number, sy: number): [number, number] {
    return [(sx - offsetX) / scaleX, (sy - offsetY) / scaleY];
  }

  function eraseAt(screenX: number, screenY: number): void {
    const [dx, dy] = screenToDesign(screenX, screenY);
    const eraseY = dy + ERASE_OFFSET_Y;

    showNozzle(dx, dy);

    if (eraseY < PATIO_Y || eraseY > PATIO_Y + PATIO_H + BRUSH_R) return;

    stampBrush(dx, eraseY);
    markClean(dx, eraseY);
    spawnFoam(dx, eraseY - BRUSH_R * 0.4);

    // Wet-sheen: throttle to once per 40px movement
    if (Math.hypot(dx - lastSheenX, eraseY - lastSheenY) > 40) {
      lastSheenX = dx; lastSheenY = eraseY;
      spawnWetSheen(dx, eraseY);
    }

    const prog = getProgress();
    setProgress(prog);

    if (gState === "washing") checkStubs(dx, eraseY);

    if (!mosaicShown && prog >= 0.5 && gState === "washing") {
      mosaicShown = true;
      gsap.to(mosaicGfx, { alpha: 1, duration: 0.55 });
      for (const s of stubs) {
        s.cont.visible = true;
        const sc = s.cont;
        gsap.from(sc.scale, { x: 0, y: 0, duration: 0.28, ease: "back.out(2)" });
      }
    }

    // Check medallion sparkle
    if (mosaicShown) checkMedallionSparkle();

    if ((gState === "washing") && prog >= SNAP_THRESH) {
      triggerComplete();
    }
  }

  function triggerComplete(): void {
    if (gState !== "washing" && gState !== "hook") return;
    gState = "snapping";

    for (const s of stubs) {
      if (!s.dead) { s.dead = true; s.cont.visible = false; }
    }

    clearEntireMask();
    fillAllGrid();
    setProgress(1);

    gsap.delayedCall(0.35, doReveal);
  }

  // ── Pointer events ──────────────────────────────────────────────────────────
  let ptrDown = false;
  let lastPX = -1, lastPY = -1;
  let distAcc = 0;
  let idleMs = 0;
  let idleCount = 0;
  let autoActive = false;

  app.stage.on("pointerdown", (e) => {
    if (gState !== "washing") return;
    ptrDown = true;
    idleMs = 0; idleCount = 0;
    lastPX = e.global.x; lastPY = e.global.y;
    distAcc = BRUSH_STEP;
    eraseAt(e.global.x, e.global.y);
  });

  app.stage.on("pointermove", (e) => {
    if (!ptrDown || gState !== "washing") return;
    idleMs = 0;
    const x = e.global.x, y = e.global.y;
    distAcc += Math.hypot(x - lastPX, y - lastPY);
    if (distAcc >= BRUSH_STEP) {
      eraseAt(x, y);
      distAcc = 0;
    }
    lastPX = x; lastPY = y;
  });

  app.stage.on("pointerup", () => {
    ptrDown = false;
    hideNozzle();
    if (ghostTl) { ghostTl.kill(); ghostTl = null; }
    ghostCont.visible = false;
  });
  app.stage.on("pointerupoutside", () => {
    ptrDown = false;
    hideNozzle();
  });

  // ── Auto-demo swipe ─────────────────────────────────────────────────────────
  function runAutoDemo(): void {
    if (gState !== "washing" || autoActive) return;
    autoActive = true;
    const startDX = DW * 0.18, startDY = PATIO_Y + PATIO_H * (0.25 + Math.random() * 0.45);
    const endDX = DW * 0.82, endDY = startDY + (Math.random() - 0.5) * 70;
    const obj = { t: 0 };
    gsap.to(obj, {
      t: 1, duration: 1.05, ease: "sine.inOut",
      onUpdate: () => {
        if (gState !== "washing") return;
        const dx = startDX + (endDX - startDX) * obj.t;
        const dy = startDY + (endDY - startDY) * obj.t;
        const eraseY = dy + ERASE_OFFSET_Y;
        if (eraseY >= PATIO_Y && eraseY <= PATIO_Y + PATIO_H) {
          stampBrush(dx, eraseY);
          markClean(dx, eraseY);
          spawnFoam(dx, eraseY - BRUSH_R * 0.4);
          showNozzle(dx, dy);
          setProgress(getProgress());
          if (!mosaicShown && getProgress() >= 0.5) {
            mosaicShown = true;
            gsap.to(mosaicGfx, { alpha: 1, duration: 0.5 });
            for (const s of stubs) {
              s.cont.visible = true;
              const sc = s.cont;
              gsap.from(sc.scale, { x: 0, y: 0, duration: 0.28, ease: "back.out(2)" });
            }
          }
          if (mosaicShown) checkMedallionSparkle();
          if (getProgress() >= SNAP_THRESH) triggerComplete();
        }
      },
      onComplete: () => {
        autoActive = false;
        hideNozzle();
      },
    });
  }

  // ── Ticker ──────────────────────────────────────────────────────────────────
  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);

    for (let i = foamPool.length - 1; i >= 0; i--) {
      const f = foamPool[i];
      if (!f.g.parent) { foamPool.splice(i, 1); continue; }
      f.g.x += f.vx * dt;
      f.g.y += f.vy * dt;
      f.vy += 100 * dt;
      f.life += dt;
      f.g.alpha = Math.max(0, 0.78 - f.life * 1.8);
      if (f.life > 0.45) {
        if (f.g.parent) fxLayer.removeChild(f.g);
        f.g.destroy();
        foamPool.splice(i, 1);
      }
    }

    if ((gState === "washing") && !ptrDown && !autoActive) {
      idleMs += ticker.deltaMS;
      if (idleMs >= IDLE_MS) {
        idleMs = 0;
        idleCount++;
        showGhost();
        if (idleCount >= AUTO_DEMO_AFTER) {
          idleCount = 0;
          runAutoDemo();
        }
      }
    }
  });

  // ── Hook autoplay ──────────────────────────────────────────────────────────
  function doHook(): void {
    gState = "hook";
    instrT.alpha = 0.75;

    const stripe1Y = PATIO_Y + PATIO_H * 0.22;
    const stripe2Y = PATIO_Y + PATIO_H * 0.42;
    for (let x = DW * 0.08; x <= DW * 0.52; x += BRUSH_STEP) {
      stampBrush(x, stripe1Y, BRUSH_R * 1.05);
      markClean(x, stripe1Y, BRUSH_R * 1.05);
    }
    for (let x = DW * 0.55; x <= DW * 0.92; x += BRUSH_STEP) {
      stampBrush(x, stripe1Y - BRUSH_R * 1.7, BRUSH_R * 0.9);
      markClean(x, stripe1Y - BRUSH_R * 1.7, BRUSH_R * 0.9);
    }
    setProgress(getProgress());

    const anim = { x: DW * 0.08 };
    gsap.to(anim, {
      x: DW * 0.92,
      duration: 0.92,
      ease: "sine.inOut",
      onUpdate: () => {
        stampBrush(anim.x, stripe2Y, BRUSH_R * 1.0);
        markClean(anim.x, stripe2Y, BRUSH_R * 1.0);
        showNozzle(anim.x, stripe2Y - ERASE_OFFSET_Y);
        setProgress(getProgress());
      },
      onComplete: () => {
        hideNozzle();
        setProgress(getProgress());
        gsap.delayedCall(0.2, () => {
          showGhost();
          gsap.delayedCall(0.4, () => {
            gState = "washing";
          });
        });
      },
    });
  }

  // ── Ambient motion: lights gently sway ───────────────────────────────────
  function startAmbientMotion(): void {
    if (lightsSprite) {
      // Gentle vertical drift
      gsap.to(lightsSprite, {
        y: (lightsSprite.y ?? 0) + 3,
        duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1,
      });
    }
  }

  // ── Layout — CONTAIN mode ─────────────────────────────────────────────────
  function layout(): void {
    const w = window.innerWidth, h = window.innerHeight;
    const s = Math.min(w / DW, h / DH);
    scaleX = s; scaleY = s;
    offsetX = (w - DW * s) / 2;
    offsetY = (h - DH * s) / 2;
    root.scale.set(s);
    root.position.set(offsetX, offsetY);
    app.canvas.style.width = w + "px";
    app.canvas.style.height = h + "px";
    app.renderer.resize(w, h);
    app.stage.hitArea = app.screen;
    backdropGfx.clear();
    backdropGfx.rect(0, 0, w, h).fill({ color: num("#d9c9ae") });
    for (let y = 14; y < h; y += 20) {
      backdropGfx.rect(0, y, w, 2.5).fill({ color: num("#c4b298"), alpha: 0.55 });
    }
    const patioScreenY = offsetY + PATIO_Y * s;
    if (patioScreenY < h) {
      backdropGfx.rect(0, patioScreenY, w, h - patioScreenY).fill({ color: num("#6B5B45") });
    }
  }

  // ── Build scene ────────────────────────────────────────────────────────────
  buildCleanPatio();
  buildPatioOverlay();
  buildWall();
  buildStringLights();
  buildNozzle();
  buildStubs();
  initMask();

  layout();
  window.addEventListener("resize", layout);

  app.renderer.render(app.stage);

  startAmbientMotion();
  gsap.delayedCall(0.05, doHook);

  gsap.delayedCall(4.5, () => {
    if (gState === "washing" || gState === "hook") triggerComplete();
  });

  requestAnimationFrame(() => {
    layout();
    app.renderer.render(app.stage);
  });
}

main().catch((e) => {
  console.error("Power Wash failed:", e);
});
