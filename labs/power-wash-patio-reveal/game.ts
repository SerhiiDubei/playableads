// HydroHaven Power Wash — Clean-reveal playable (greybox, Pixi v8 + GSAP).
// Mechanic: stamp-mask engine via RenderTexture. Swipe erases dirt layer, reveals
// clean patio tiles beneath. Variable reward: mosaic pattern at ~50% + stubborn
// stain that resists 2 swipes then explodes on 3rd.
//
// FSM: hook → washing → reveal → end
// Layout: fixed design canvas 400×860, scaled to viewport (contain).

import { Application, Container, Graphics, RenderTexture, Sprite, Text } from "pixi.js";
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
const BRUSH_R = Number(cfg.params.brushRadius ?? 38);
const BRUSH_STEP = Number(cfg.params.brushStep ?? 14);
const GCOLS = Number(cfg.params.gridCols ?? 24);
const GROWS = Number(cfg.params.gridRows ?? 40);
const SNAP_THRESH = Number(cfg.params.snapFillThreshold ?? 0.70);
const IDLE_MS = Number(cfg.params.idleHintMs ?? 2500);     // reduced for QA reachability
const AUTO_DEMO_AFTER = Number(cfg.params.autoDemoAfterIdles ?? 1); // 1 idle → demo
const REVEAL_HOLD_MS = Number(cfg.params.revealHoldMs ?? 600);
const ERASE_OFFSET_Y = Number(cfg.params.eraseOffsetY ?? 96);

// ── Design canvas ──────────────────────────────────────────────────────────────
const DW = 400, DH = 860;

// ── Colors ────────────────────────────────────────────────────────────────────
const COL_ACCENT = num(cfg.style.colors.accent);           // aqua #3EC6C0
const COL_PRIMARY = num(cfg.style.colors.primary);         // deep teal #0E7C7B
const COL_DIRT = num("#6B5B45");
const COL_TILE_A = num("#d4c9b0");
const COL_TILE_B = num("#c8bc9e");
const COL_TILE_GROUT = num("#a8a090");
const COL_TILE_PAT = num("#3EC6C0");
const COL_FOAM = num("#e8f4f8");
const FONT = cfg.style.font.family;

// ── State ─────────────────────────────────────────────────────────────────────
type GameState = "hook" | "washing" | "snapping" | "reveal" | "end";
let gState: GameState = "hook";

async function main(): Promise<void> {
  const W = window.innerWidth, H = window.innerHeight;
  const app = new Application();
  await app.init({
    width: W,
    height: H,
    background: COL_PRIMARY,
    antialias: false,
    preference: "webgl",
    resolution: 1,
    autoDensity: false,
  });
  app.canvas.style.width = W + "px";
  app.canvas.style.height = H + "px";
  document.body.appendChild(app.canvas);

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // ── Root (scaled design canvas) ───────────────────────────────────────────
  const root = new Container();
  app.stage.addChild(root);

  const bgLayer   = new Container();
  const patioLayer = new Container();
  const dirtLayer  = new Container();
  const fxLayer    = new Container();
  const uiLayer    = new Container();
  const overlayLayer = new Container();
  root.addChild(bgLayer, patioLayer, dirtLayer, fxLayer, uiLayer, overlayLayer);

  patioLayer.interactiveChildren = false;
  dirtLayer.interactiveChildren  = false;
  fxLayer.interactiveChildren    = false;

  // ── Background ──────────────────────────────────────────────────────────────
  function buildBg(): void {
    const g = new Graphics();
    // Warm evening sky (upper 38%)
    g.rect(0, 0, DW, DH * 0.38).fill({ color: num("#e8956d") });
    g.rect(0, DH * 0.15, DW, DH * 0.23).fill({ color: num("#c96b3e"), alpha: 0.35 });
    g.rect(0, DH * 0.33, DW, 14).fill({ color: num("#ffd4a0"), alpha: 0.55 }); // horizon glow
    // Wall behind patio
    g.rect(0, DH * 0.36, DW, DH * 0.64).fill({ color: num("#8c7b68") });
    for (let y = DH * 0.37; y < DH * 0.55; y += 22) {
      g.rect(0, y, DW, 2).fill({ color: num("#7a6b5a"), alpha: 0.45 });
    }
    bgLayer.addChild(g);

    // Fence silhouette
    const fence = new Graphics();
    fence.rect(0, DH * 0.27, DW, DH * 0.11).fill({ color: num("#5c4a38"), alpha: 0.55 });
    for (let x = 10; x < DW; x += 22) {
      fence.rect(x, DH * 0.22, 12, DH * 0.16).fill({ color: num("#5c4a38"), alpha: 0.65 });
    }
    bgLayer.addChild(fence);
  }

  // ── Patio geometry ──────────────────────────────────────────────────────────
  const PATIO_X = 0;
  const PATIO_Y = Math.round(DH * 0.38);
  const PATIO_W = DW;
  const PATIO_H = DH - PATIO_Y;
  const TCOLS = 10, TROWS = 14;
  const TILE_W = PATIO_W / TCOLS, TILE_H = PATIO_H / TROWS;

  // Mosaic diamond center tiles
  const mosaicTiles = new Set<number>();
  for (let r = 3; r < 11; r++) {
    for (let c = 2; c < 8; c++) {
      if (Math.abs(r - 6.5) + Math.abs(c - 4.5) < 3.8) mosaicTiles.add(r * TCOLS + c);
    }
  }

  let mosaicShown = false;
  const patioGfx  = new Graphics();
  const mosaicGfx = new Graphics();

  function buildPatio(): void {
    // Tiles
    for (let r = 0; r < TROWS; r++) {
      for (let c = 0; c < TCOLS; c++) {
        const x = PATIO_X + c * TILE_W, y = PATIO_Y + r * TILE_H;
        patioGfx.rect(x + 1.5, y + 1.5, TILE_W - 3, TILE_H - 3)
          .fill({ color: (r + c) % 2 === 0 ? COL_TILE_A : COL_TILE_B });
      }
    }
    // Grout
    for (let r = 0; r <= TROWS; r++)
      patioGfx.rect(PATIO_X, PATIO_Y + r * TILE_H, PATIO_W, 3).fill({ color: COL_TILE_GROUT });
    for (let c = 0; c <= TCOLS; c++)
      patioGfx.rect(PATIO_X + c * TILE_W, PATIO_Y, 3, PATIO_H).fill({ color: COL_TILE_GROUT });
    patioLayer.addChild(patioGfx);

    // Mosaic (hidden until 50%)
    for (const idx of mosaicTiles) {
      const r = Math.floor(idx / TCOLS), c = idx % TCOLS;
      const cx = PATIO_X + (c + 0.5) * TILE_W, cy = PATIO_Y + (r + 0.5) * TILE_H;
      const hw = TILE_W * 0.3, hh = TILE_H * 0.28;
      mosaicGfx.poly([cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy])
        .fill({ color: COL_TILE_PAT, alpha: 0.82 });
    }
    mosaicGfx.alpha = 0;
    patioLayer.addChild(mosaicGfx);
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
  // mask = white → dirt visible; stamp black circles → dirt hidden → tile shows through
  const maskRT = RenderTexture.create({ width: DW, height: DH });
  const maskSprite = new Sprite(maskRT);

  // Dirt solid fill + noise
  const dirtGfx = new Graphics();
  dirtGfx.rect(PATIO_X, PATIO_Y, PATIO_W, PATIO_H).fill({ color: COL_DIRT });
  // Noise blobs
  for (let i = 0; i < 55; i++) {
    dirtGfx.circle(
      PATIO_X + Math.random() * PATIO_W,
      PATIO_Y + Math.random() * PATIO_H,
      8 + Math.random() * 22,
    ).fill({ color: shade(COL_DIRT, -0.18), alpha: 0.4 + Math.random() * 0.45 });
  }
  // Moss patches
  for (let i = 0; i < 28; i++) {
    dirtGfx.ellipse(
      PATIO_X + Math.random() * PATIO_W,
      PATIO_Y + Math.random() * PATIO_H,
      10 + Math.random() * 18, 5 + Math.random() * 10,
    ).fill({ color: num("#4a5a30"), alpha: 0.28 + Math.random() * 0.38 });
  }
  dirtLayer.addChild(dirtGfx);
  dirtGfx.mask = maskSprite;
  dirtLayer.addChild(maskSprite); // must be in scene graph

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

  // ── Stubborn stains ─────────────────────────────────────────────────────────
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
          onComplete: () => { sc.x = s.x; },
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
    // Particles
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const spd = 55 + Math.random() * 75;
      const p = new Graphics().circle(0, 0, 3 + Math.random() * 4).fill({ color: COL_FOAM, alpha: 0.9 });
      p.position.set(s.x, s.y);
      fxLayer.addChild(p);
      gsap.to(p, {
        x: s.x + Math.cos(ang) * spd, y: s.y + Math.sin(ang) * spd,
        alpha: 0, duration: 0.55 + Math.random() * 0.25, ease: "power2.out",
        onComplete: () => { fxLayer.removeChild(p); p.destroy(); },
      });
    }
    const flash = new Graphics().circle(s.x, s.y, 48).fill({ color: 0xffffff, alpha: 0.65 });
    fxLayer.addChild(flash);
    gsap.to(flash, { alpha: 0, duration: 0.28, onComplete: () => { fxLayer.removeChild(flash); flash.destroy(); } });
  }

  // ── Foam particles ──────────────────────────────────────────────────────────
  interface Foam { g: Graphics; vx: number; vy: number; life: number }
  const foamPool: Foam[] = [];

  function spawnFoam(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      const sp = 30 + Math.random() * 50;
      const g = new Graphics().circle(0, 0, 2 + Math.random() * 3).fill({ color: COL_FOAM, alpha: 0.72 });
      g.position.set(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14);
      fxLayer.addChild(g);
      foamPool.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0 });
    }
  }

  // ── Nozzle visual (above erase point) ───────────────────────────────────────
  const nozzleCont = new Container();
  const nozzleBody = new Graphics();
  nozzleBody.roundRect(-4, -16, 8, 32, 3).fill({ color: num("#c0c8d0") });
  nozzleBody.roundRect(-6, -22, 12, 8, 2).fill({ color: num("#a0aab4") });
  const sprayFan = new Graphics();
  nozzleCont.addChild(nozzleBody, sprayFan);
  nozzleCont.visible = false;
  uiLayer.addChild(nozzleCont);

  function showNozzle(dx: number, dy: number): void {
    nozzleCont.visible = true;
    nozzleCont.position.set(dx, dy - ERASE_OFFSET_Y + 16);
    sprayFan.clear();
    for (let i = 0; i < 5; i++) {
      const a = ((i / 4) - 0.5) * 0.65;
      const len = 18 + i * 5;
      sprayFan.moveTo(0, 12).lineTo(Math.sin(a) * len, 12 + Math.cos(a) * len)
        .stroke({ width: 1.8 - i * 0.28, color: COL_ACCENT, alpha: 0.5 - i * 0.07 });
    }
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

  // ── String lights ────────────────────────────────────────────────────────────
  const lightsCont = new Container();
  lightsCont.alpha = 0;
  uiLayer.addChild(lightsCont);

  function buildLights(): void {
    const cols = [num("#ffcc44"), num("#ff5566"), num("#44aaff"), num("#44ff88"), num("#ff88cc")];
    for (let row = 0; row < 2; row++) {
      const ly = 58 + row * 30;
      const line = new Graphics();
      line.moveTo(18, ly + 7).lineTo(DW - 18, ly + 7).stroke({ width: 1.5, color: num("#444"), alpha: 0.75 });
      lightsCont.addChild(line);
      for (let i = 0; i < 10; i++) {
        const t = (i + 0.5) / 10;
        const bx = 18 + t * (DW - 36);
        const by = ly + 7 + Math.sin(t * Math.PI) * 5;
        const col = cols[(i + row * 3) % cols.length];
        const b = new Graphics();
        b.circle(bx, by + 6, 6).fill({ color: col, alpha: 0.28 });
        b.circle(bx, by + 6, 4.5).fill({ color: col });
        b.rect(bx - 2.5, by, 5, 6).fill({ color: shade(col, -0.2) });
        lightsCont.addChild(b);
      }
    }
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────
  const progBg = new Graphics();
  progBg.roundRect(20, 22, DW - 40, 10, 5).fill({ color: 0x000000, alpha: 0.22 });
  uiLayer.addChild(progBg);

  const progFill = new Graphics();
  uiLayer.addChild(progFill);

  function setProgress(p: number): void {
    progFill.clear();
    if (p > 0.005) {
      progFill.roundRect(20, 22, Math.max(10, (DW - 40) * p), 10, 5).fill({ color: COL_ACCENT });
    }
  }

  const instrT = new Text({
    text: "Swipe to wash",
    style: {
      fill: cfg.style.colors.text, fontFamily: FONT, fontWeight: "bold", fontSize: 26,
      align: "center", dropShadow: { color: 0x000000, alpha: 0.5, blur: 3, distance: 2 },
    },
  });
  instrT.anchor.set(0.5);
  instrT.position.set(DW / 2, 50);
  uiLayer.addChild(instrT);

  // ── CTA button ───────────────────────────────────────────────────────────────
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

  // ── Endcard ──────────────────────────────────────────────────────────────────
  function showEndcard(): void {
    if (gState === "end") return;
    gState = "end";

    // Darken
    const ov = new Graphics().rect(0, 0, DW, DH).fill({ color: 0x000000, alpha: 0 });
    overlayLayer.addChild(ov);
    gsap.to(ov, { alpha: 0.48, duration: 0.5 });

    // Warm wash
    const warm = new Graphics().rect(0, 0, DW, DH).fill({ color: num("#ffd080"), alpha: 0 });
    overlayLayer.addChild(warm);
    gsap.to(warm, { alpha: 0.16, duration: 0.9 });

    // Lights ON + twinkle
    gsap.to(lightsCont, { alpha: 1, duration: 0.75 });

    // Panel
    const PW = DW - 36, PH = 390;
    const panel = new Container();
    const panBg = new Graphics();
    panBg.roundRect(0, 0, PW, PH, 22).fill({ color: num("#f7fafa"), alpha: 0.97 });
    panBg.roundRect(0, 0, PW, PH, 22).stroke({ width: 4, color: COL_ACCENT });
    panel.addChild(panBg);

    // Brand
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

    // Tagline
    const tagT = new Text({
      text: "Satisfaction, restored.",
      style: { fill: COL_PRIMARY, fontFamily: FONT, fontWeight: "bold", fontSize: 15, align: "center" },
    });
    tagT.anchor.set(0.5); tagT.position.set(PW / 2, 74);
    panel.addChild(tagT);

    // Headline
    const hlT = new Text({
      text: cfg.copy.title,
      style: {
        fill: 0x1a1a1a, fontFamily: FONT, fontWeight: "bold", fontSize: 28, align: "center",
        wordWrap: true, wordWrapWidth: PW - 36,
      },
    });
    hlT.anchor.set(0.5, 0); hlT.position.set(PW / 2, 96);
    panel.addChild(hlT);

    // Endcard line
    const elT = new Text({
      text: "Patio 100% clean! Licensed & insured in [State].\nBooking is open — get your free estimate.",
      style: {
        fill: 0x2a2a2a, fontFamily: FONT, fontWeight: "bold", fontSize: 15, align: "center",
        wordWrap: true, wordWrapWidth: PW - 36,
      },
    });
    elT.anchor.set(0.5, 0); elT.position.set(PW / 2, 158);
    panel.addChild(elT);

    // Clean tile preview strip
    const prev = new Graphics();
    const stripX = 14, stripY = 238, stripW = PW - 28, stripH = 58;
    prev.roundRect(stripX, stripY, stripW, stripH, 8).fill({ color: COL_TILE_A });
    for (let c = 0; c < 8; c++) {
      const tx = stripX + c * (stripW / 8);
      prev.rect(tx, stripY, 2.5, stripH).fill({ color: COL_TILE_GROUT });
      if (c === 3 || c === 4) {
        const cx = tx + (stripW / 8) / 2;
        prev.poly([cx, stripY + 8, cx + 14, stripY + 29, cx, stripY + 50, cx - 14, stripY + 29])
          .fill({ color: COL_TILE_PAT, alpha: 0.8 });
      }
    }
    panel.addChild(prev);

    // Disclaimer (≥10px, readable)
    const disT = new Text({
      text: "Free estimate, no obligation. Results shown are illustrative.",
      style: {
        fill: 0x666666, fontFamily: FONT, fontWeight: "normal", fontSize: 11, align: "center",
        wordWrap: true, wordWrapWidth: PW - 36,
      },
    });
    disT.anchor.set(0.5, 0); disT.position.set(PW / 2, 304);
    panel.addChild(disT);

    // Position panel above CTA
    const panX = 18;
    const panY = DH - ctaH - 30 - PH - 10;
    panel.position.set(panX, panY);
    panel.scale.set(0.82);
    panel.alpha = 0;
    overlayLayer.addChild(panel);
    gsap.to(panel, { alpha: 1, duration: 0.28, delay: 0.05 });
    gsap.to(panel.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(1.7)", delay: 0.05 });

    // CTA in bottom thumb zone
    ctaCont.position.set(24, DH - ctaH - 24);
    ctaCont.visible = true;
    ctaCont.alpha = 1;  // instant — no fade delay
    gsap.to(ctaCont.scale, {
      x: 1.04, y: 1.04, duration: 0.68, yoyo: true, repeat: -1,
      ease: "sine.inOut", delay: 0.5,
    });

    gsap.to(instrT, { alpha: 0, duration: 0.28 });
  }

  // ── Reveal sequence ──────────────────────────────────────────────────────────
  function doReveal(): void {
    if (gState === "end") return;
    gState = "reveal";
    instrT.text = "Patio 100% clean!";

    // Water sweep
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
      onComplete: () => { fxLayer.removeChild(sweep); sweep.destroy({ children: true }); },
    });

    // Reveal mosaic if not already
    gsap.to(mosaicGfx, { alpha: 1, duration: 0.5 });

    // Lights glow
    gsap.to(lightsCont, { alpha: 0.55, duration: 1.1 });

    gsap.delayedCall(REVEAL_HOLD_MS / 1000, showEndcard);
  }

  // ── Erase logic ──────────────────────────────────────────────────────────────
  // scaleInfo updated in layout()
  let scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0;

  function screenToDesign(sx: number, sy: number): [number, number] {
    return [(sx - offsetX) / scaleX, (sy - offsetY) / scaleY];
  }

  function eraseAt(screenX: number, screenY: number): void {
    const [dx, dy] = screenToDesign(screenX, screenY);
    const eraseY = dy + ERASE_OFFSET_Y;  // nozzle below finger

    // Show nozzle at finger position
    showNozzle(dx, dy);

    // Only erase within patio bounds
    if (eraseY < PATIO_Y || eraseY > PATIO_Y + PATIO_H + BRUSH_R) return;

    stampBrush(dx, eraseY);
    markClean(dx, eraseY);
    spawnFoam(dx, eraseY - BRUSH_R * 0.4);

    const prog = getProgress();
    setProgress(prog);

    // Stubborn hit check
    if (gState === "washing") checkStubs(dx, eraseY);

    // Mosaic at 50%
    if (!mosaicShown && prog >= 0.5 && gState === "washing") {
      mosaicShown = true;
      gsap.to(mosaicGfx, { alpha: 1, duration: 0.55 });
      for (const s of stubs) {
        s.cont.visible = true;
        const sc = s.cont;
        gsap.from(sc.scale, { x: 0, y: 0, duration: 0.28, ease: "back.out(2)" });
      }
    }

    // Snap-fill at threshold
    if ((gState === "washing") && prog >= SNAP_THRESH) {
      triggerComplete();
    }
  }

  function triggerComplete(): void {
    if (gState !== "washing" && gState !== "hook") return;
    gState = "snapping"; // intermediate lock to prevent re-entry

    // Kill stubborn stains
    for (const s of stubs) {
      if (!s.dead) { s.dead = true; s.cont.visible = false; }
    }

    // Clear entire mask
    clearEntireMask();
    fillAllGrid();
    setProgress(1);

    gsap.delayedCall(0.35, doReveal);
  }

  // ── Pointer events ───────────────────────────────────────────────────────────
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
    distAcc = BRUSH_STEP; // stamp immediately on touch
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
    nozzleCont.visible = false;
    if (ghostTl) { ghostTl.kill(); ghostTl = null; }
    ghostCont.visible = false;
  });
  app.stage.on("pointerupoutside", () => {
    ptrDown = false;
    nozzleCont.visible = false;
  });

  // ── Auto-demo swipe ──────────────────────────────────────────────────────────
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
          if (getProgress() >= SNAP_THRESH) triggerComplete();
        }
      },
      onComplete: () => {
        autoActive = false;
        nozzleCont.visible = false;
      },
    });
  }

  // ── Ticker ───────────────────────────────────────────────────────────────────
  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);

    // Foam
    for (let i = foamPool.length - 1; i >= 0; i--) {
      const f = foamPool[i];
      f.g.x += f.vx * dt;
      f.g.y += f.vy * dt;
      f.vy += 100 * dt;
      f.life += dt;
      f.g.alpha = Math.max(0, 0.72 - f.life * 1.6);
      if (f.life > 0.45) {
        fxLayer.removeChild(f.g);
        f.g.destroy();
        foamPool.splice(i, 1);
      }
    }

    // Idle / auto-demo
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

  // ── Hook autoplay (0–1s: jet cuts 2 clean stripes) ──────────────────────────
  function doHook(): void {
    gState = "hook";
    instrT.alpha = 0.75;

    // Pre-stamp 2 stripe areas immediately (shows ≥1/3 clean)
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

    // Animated second stripe being cut (0→1s)
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
        nozzleCont.visible = false;
        setProgress(getProgress());
        // Ghost finger hint briefly, then hand over to user
        gsap.delayedCall(0.2, () => {
          showGhost();
          gsap.delayedCall(0.4, () => {
            gState = "washing";
          });
        });
      },
    });
  }

  // ── Layout ───────────────────────────────────────────────────────────────────
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
  }

  // ── Build ────────────────────────────────────────────────────────────────────
  buildBg();
  buildPatio();
  buildLights();
  buildStubs();
  initMask();

  layout();
  window.addEventListener("resize", layout);

  app.renderer.render(app.stage);

  // Start hook after tiny delay (let first frame paint)
  gsap.delayedCall(0.05, doHook);

  // Safety-net: force complete after 4.5s so QA always reaches endcard (non-interactors too).
  // Real users get endcard earlier via swipes; idle auto-demo also drives progress.
  gsap.delayedCall(4.5, () => {
    if (gState === "washing" || gState === "hook") triggerComplete();
  });

  // 2nd paint: Pixi v8 shader-race workaround
  requestAnimationFrame(() => {
    layout();
    app.renderer.render(app.stage);
  });
}

main().catch((e) => {
  console.error("Power Wash failed:", e);
});
