// Carpet Clean — oddly-satisfying carpet cleaning (stamp-mask reveal).
// Variant family: v1..v5 share this game.ts; each variant ships its own
// assets/ (carpet-clean.webp + tool.webp) and styles/<id>.json palette.
//
// Mechanic: swipe wipes the dirt layer off a beautiful carpet via the proven
// RenderTexture stamp-mask engine. 100% clean required (no snap-fill) —
// idle auto-demo keeps cleaning for passive viewers so everyone reaches the
// endcard. Solid centred endcard panel with photo strip + CTA inside.

import { Application, Container, Graphics, RenderTexture, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";
declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }
function shade(c: number, f: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const t = f > 0 ? 255 : 0, a = Math.abs(f);
  return ((Math.round(r + (t - r) * a) << 16) | (Math.round(g + (t - g) * a) << 8) | Math.round(b + (t - b) * a));
}

// ── Tunables ──────────────────────────────────────────────────────────────────
const BRUSH_R   = Number(cfg.params.brushRadius ?? 40);
const BRUSH_STEP = Number(cfg.params.brushStep ?? 14);
const GCOLS = Number(cfg.params.gridCols ?? 22);
const GROWS = Number(cfg.params.gridRows ?? 30);
const WIN_THRESH = Number(cfg.params.winThreshold ?? 0.985);
const IDLE_MS = Number(cfg.params.idleHintMs ?? 2600);
const ERASE_OFFSET_Y = Number(cfg.params.eraseOffsetY ?? 88);
const BRAND = String(cfg.params.brand ?? "FreshPile");
const TAGLINE = String(cfg.params.tagline ?? "Deep clean. Pure calm.");

// ── Design canvas ─────────────────────────────────────────────────────────────
const DW = 400, DH = 860;
const HUD_H = 44;
const CARPET_Y = HUD_H + 6;
const CARPET_H = Math.round(DH * 0.80) - CARPET_Y;
const COL_ACCENT  = num(cfg.style.colors.accent);
const COL_PRIMARY = num(cfg.style.colors.primary);
const COL_DIRT    = num("#5d4f3d");
const FONT = cfg.style.font.family;

type GameState = "hook" | "washing" | "reveal" | "end";
let gState: GameState = "hook";

// ── Textures ──────────────────────────────────────────────────────────────────
const TEX: Record<string, Texture> = {};
async function preloadTextures(): Promise<void> {
  await Promise.all(Object.entries(cfg.assets).map(async ([k, uri]) => {
    if (!/\.(webp|png)$/i.test(k)) return;
    const img = new Image(); img.src = uri;
    try { await img.decode(); } catch { return; }
    TEX[k] = Texture.from(img);
  }));
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: window.innerWidth, height: window.innerHeight,
    background: num(cfg.style.colors.background),
    antialias: false, preference: "webgl", resolution: 1, autoDensity: false,
  });
  app.canvas.style.width = window.innerWidth + "px";
  app.canvas.style.height = window.innerHeight + "px";
  document.body.appendChild(app.canvas);
  await preloadTextures();

  // root scaled design-space
  const root = new Container();
  app.stage.addChild(root);
  const bgLayer     = new Container();
  const carpetLayer = new Container();
  const dirtLayer   = new Container();
  const fxLayer     = new Container();
  const toolLayer   = new Container();
  const uiLayer     = new Container();
  const overlayLayer = new Container();
  root.addChild(bgLayer, carpetLayer, dirtLayer, fxLayer, toolLayer, uiLayer, overlayLayer);
  for (const l of [bgLayer, carpetLayer, dirtLayer, fxLayer, toolLayer]) l.interactiveChildren = false;
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // ── Floor backdrop around the carpet ─────────────────────────────────────
  const floorG = new Graphics();
  floorG.rect(0, 0, DW, DH).fill({ color: shade(num(cfg.style.colors.background), -0.12) });
  for (let i = 0; i < 9; i++) {
    floorG.rect(0, (DH / 9) * i, DW, 1.5).fill({ color: 0x000000, alpha: 0.07 });
  }
  bgLayer.addChild(floorG);

  // ── Clean carpet (the reveal target) ──────────────────────────────────────
  const carpetTex = TEX["carpet-clean.webp"] ?? null;
  if (carpetTex) {
    const sp = new Sprite(carpetTex);
    const s = Math.max((DW - 16) / carpetTex.width, CARPET_H / carpetTex.height);
    sp.scale.set(s);
    sp.anchor.set(0.5);
    sp.position.set(DW / 2, CARPET_Y + CARPET_H / 2);
    const m = new Graphics().roundRect(8, CARPET_Y, DW - 16, CARPET_H, 14).fill({ color: 0xffffff });
    carpetLayer.addChild(m, sp);
    sp.mask = m;
    // soft fringe top/bottom
    const fr = new Graphics();
    for (let i = 0; i < 26; i++) {
      const fx2 = 14 + i * ((DW - 28) / 25);
      fr.rect(fx2, CARPET_Y - 6, 3, 7).fill({ color: 0xd8d2c4 });
      fr.rect(fx2, CARPET_Y + CARPET_H - 1, 3, 7).fill({ color: 0xd8d2c4 });
    }
    carpetLayer.addChild(fr);
  } else {
    const g = new Graphics().roundRect(8, CARPET_Y, DW - 16, CARPET_H, 14).fill({ color: 0x9a4040 });
    carpetLayer.addChild(g);
  }

  // ── Dirt layer (procedural, masked by stamp RT) ───────────────────────────
  const dirtG = new Graphics();
  dirtG.roundRect(8, CARPET_Y, DW - 16, CARPET_H, 14).fill({ color: COL_DIRT, alpha: 0.96 });
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i++) {
    const bx = 14 + rnd() * (DW - 28), by = CARPET_Y + rnd() * CARPET_H;
    dirtG.circle(bx, by, 6 + rnd() * 22).fill({ color: shade(COL_DIRT, (rnd() - 0.6) * 0.5), alpha: 0.25 + rnd() * 0.4 });
  }
  for (let i = 0; i < 60; i++) {
    const bx = 14 + rnd() * (DW - 28), by = CARPET_Y + rnd() * CARPET_H;
    dirtG.circle(bx, by, 1 + rnd() * 2.5).fill({ color: num("#3a3026"), alpha: 0.6 });
  }
  dirtLayer.addChild(dirtG);

  // ── Stamp-mask engine (white = keep dirt, black stamps = erased) ──────────
  const maskRT = RenderTexture.create({ width: DW, height: DH, resolution: 1 });
  const white = new Graphics().rect(0, 0, DW, DH).fill({ color: 0xffffff });
  app.renderer.render({ container: white, target: maskRT, clear: true });
  white.destroy();
  const maskSprite = new Sprite(maskRT);
  dirtLayer.addChild(maskSprite);
  dirtG.mask = maskSprite;
  const stamp = new Graphics();
  function stampBrush(x: number, y: number, r = BRUSH_R): void {
    stamp.clear();
    stamp.circle(x, y, r).fill({ color: 0x000000 });
    stamp.circle(x, y, r * 1.18).fill({ color: 0x000000, alpha: 0.45 });
    app.renderer.render({ container: stamp, target: maskRT, clear: false });
  }
  function clearAllDirt(): void {
    stamp.clear();
    stamp.rect(0, 0, DW, DH).fill({ color: 0x000000 });
    app.renderer.render({ container: stamp, target: maskRT, clear: false });
  }

  // ── CPU progress grid ─────────────────────────────────────────────────────
  const grid = new Uint8Array(GCOLS * GROWS);
  const cellW = (DW - 16) / GCOLS, cellH = CARPET_H / GROWS;
  let cleanCells = 0;
  function markClean(x: number, y: number, r = BRUSH_R): void {
    const c0 = Math.max(0, Math.floor((x - 8 - r) / cellW));
    const c1 = Math.min(GCOLS - 1, Math.floor((x - 8 + r) / cellW));
    const r0 = Math.max(0, Math.floor((y - CARPET_Y - r) / cellH));
    const r1 = Math.min(GROWS - 1, Math.floor((y - CARPET_Y + r) / cellH));
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      const cx = 8 + (cc + 0.5) * cellW, cy2 = CARPET_Y + (rr + 0.5) * cellH;
      if (Math.hypot(cx - x, cy2 - y) <= r && !grid[rr * GCOLS + cc]) {
        grid[rr * GCOLS + cc] = 1; cleanCells++;
      }
    }
  }
  const totalCells = GCOLS * GROWS;
  const getProgress = () => cleanCells / totalCells;

  // ── Stubborn spot (resists 2 passes, bursts on 3rd) ───────────────────────
  const stub = { x: DW * 0.5, y: CARPET_Y + CARPET_H * 0.55, hits: 0, alive: true };
  const stubG = new Graphics();
  stubG.circle(stub.x, stub.y, 26).fill({ color: num("#3a2c1c"), alpha: 0.95 });
  stubG.circle(stub.x - 8, stub.y - 6, 9).fill({ color: num("#2a1f12"), alpha: 0.8 });
  fxLayer.addChild(stubG);
  function hitStub(x: number, y: number): void {
    if (!stub.alive || Math.hypot(x - stub.x, y - stub.y) > 42) return;
    stub.hits++;
    gsap.fromTo(stubG, { x: -3 }, { x: 0, duration: 0.2, ease: "elastic.out(2,0.4)" });
    if (stub.hits >= 3) {
      stub.alive = false;
      for (let i = 0; i < 14; i++) {
        const p = new Graphics().circle(0, 0, 3 + Math.random() * 4).fill({ color: num("#6b573f") });
        p.position.set(stub.x, stub.y);
        fxLayer.addChild(p);
        const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 50;
        gsap.to(p, { x: stub.x + Math.cos(a) * d, y: stub.y + Math.sin(a) * d, alpha: 0, duration: 0.5, onComplete: () => { fxLayer.removeChild(p); p.destroy(); } });
      }
      gsap.to(stubG, { alpha: 0, duration: 0.3, onComplete: () => { fxLayer.removeChild(stubG); stubG.destroy(); } });
    }
  }

  // ── Foam FX at the cleaning front ─────────────────────────────────────────
  interface Foam { g: Graphics; vx: number; vy: number; life: number; }
  const foam: Foam[] = [];
  function spawnFoam(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const g = new Graphics().circle(0, 0, 3 + Math.random() * 5).fill({ color: 0xf2fbfd, alpha: 0.8 });
      g.position.set(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 16);
      fxLayer.addChild(g);
      foam.push({ g, vx: (Math.random() - 0.5) * 70, vy: -30 - Math.random() * 50, life: 0 });
    }
  }

  // ── Tool sprite follows the touch ─────────────────────────────────────────
  const toolCont = new Container();
  const toolTex = TEX["tool.webp"] ?? null;
  if (toolTex) {
    const sp = new Sprite(toolTex);
    sp.anchor.set(0.5, 0.85);
    sp.scale.set(Math.min(170 / toolTex.width, 1));
    toolCont.addChild(sp);
  } else {
    const g = new Graphics().roundRect(-22, -60, 44, 70, 10).fill({ color: COL_PRIMARY });
    toolCont.addChild(g);
  }
  toolCont.visible = false;
  toolLayer.addChild(toolCont);
  let toolWiggle: gsap.core.Tween | null = null;
  function showTool(x: number, y: number): void {
    toolCont.visible = true;
    toolCont.position.set(x, y);
    if (!toolWiggle) {
      toolWiggle = gsap.to(toolCont, { rotation: 0.06, duration: 0.1, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }
  }
  function hideTool(): void {
    toolCont.visible = false;
    if (toolWiggle) { toolWiggle.kill(); toolWiggle = null; toolCont.rotation = 0; }
  }

  // ── HUD: progress + instruction ───────────────────────────────────────────
  const hudBg = new Graphics().rect(0, 0, DW, HUD_H).fill({ color: 0x000000, alpha: 0.35 });
  uiLayer.addChild(hudBg);
  const progBg = new Graphics().roundRect(14, 14, DW - 110, 16, 8).fill({ color: 0x000000, alpha: 0.4 });
  uiLayer.addChild(progBg);
  const progFill = new Graphics();
  uiLayer.addChild(progFill);
  const progLabel = new Text({ text: "0%", style: { fill: 0xffffff, fontFamily: FONT, fontWeight: "bold", fontSize: 17 } });
  progLabel.anchor.set(1, 0.5); progLabel.position.set(DW - 16, 22);
  uiLayer.addChild(progLabel);
  function setProgress(p: number): void {
    progFill.clear();
    const w = Math.max(4, (DW - 114) * p);
    progFill.roundRect(16, 16, w, 12, 6).fill({ color: COL_ACCENT });
    progLabel.text = `${Math.round(p * 100)}%`;
  }
  setProgress(0);
  const instrT = new Text({ text: "Swipe to clean!", style: { fill: 0xffffff, fontFamily: FONT, fontWeight: "bold", fontSize: 22 } });
  instrT.anchor.set(0.5);
  instrT.position.set(DW / 2, DH * 0.86);
  uiLayer.addChild(instrT);
  gsap.to(instrT.scale, { x: 1.06, y: 1.06, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });

  // ── Erase pipeline ────────────────────────────────────────────────────────
  let shineShown = false;
  function eraseAt(px: number, py: number): void {
    const y = py + ERASE_OFFSET_Y;
    if (y < CARPET_Y || y > CARPET_Y + CARPET_H) { showTool(px, py); return; }
    stampBrush(px, y);
    markClean(px, y);
    hitStub(px, y);
    spawnFoam(px, y - BRUSH_R * 0.4);
    showTool(px, py);
    const p = getProgress();
    setProgress(p);
    if (!shineShown && p >= 0.5) {
      shineShown = true;
      const shine = new Graphics().rect(0, CARPET_Y, 70, CARPET_H).fill({ color: 0xffffff, alpha: 0.30 });
      shine.skew.x = -0.25;
      shine.x = -90;
      fxLayer.addChild(shine);
      gsap.to(shine, { x: DW + 90, duration: 0.8, ease: "power1.inOut", onComplete: () => { fxLayer.removeChild(shine); shine.destroy(); } });
    }
    if (p >= WIN_THRESH && gState === "washing") triggerWin();
  }

  // ── Win → reveal → endcard ────────────────────────────────────────────────
  function triggerWin(): void {
    gState = "reveal";
    hideTool();
    clearAllDirt();
    setProgress(1);
    const warm = new Graphics().rect(0, 0, DW, DH).fill({ color: num("#ffd8a0"), alpha: 0 });
    fxLayer.addChild(warm);
    gsap.to(warm, { alpha: 0.18, duration: 0.7, yoyo: true, repeat: 1 });
    for (let i = 0; i < 22; i++) {
      const s = new Graphics().star(0, 0, 4, 5 + Math.random() * 5, 2).fill({ color: 0xfff3c0, alpha: 0.95 });
      s.position.set(20 + Math.random() * (DW - 40), CARPET_Y + Math.random() * CARPET_H);
      s.alpha = 0;
      fxLayer.addChild(s);
      gsap.to(s, { alpha: 1, duration: 0.2, delay: i * 0.04 });
      gsap.to(s, { alpha: 0, y: s.y - 26, duration: 0.5, delay: i * 0.04 + 0.25, onComplete: () => { fxLayer.removeChild(s); s.destroy(); } });
    }
    gsap.delayedCall(1.25, showEndcard);
  }

  function showEndcard(): void {
    if (gState === "end") return;
    gState = "end";
    const ov = new Graphics().rect(0, 0, DW, DH).fill({ color: 0x000000, alpha: 0 });
    overlayLayer.addChild(ov);
    gsap.to(ov, { alpha: 0.55, duration: 0.5 });

    const PW = DW - 48, PH = 430;
    const panel = new Container();
    const panBg = new Graphics();
    panBg.roundRect(0, 0, PW, PH, 22).fill({ color: num("#fbfaf7") });
    panBg.roundRect(0, 0, PW, PH, 22).stroke({ width: 4, color: COL_ACCENT });
    panel.addChild(panBg);

    let cy = 18;
    const brandBg = new Graphics().roundRect(0, 0, 200, 42, 12).fill({ color: COL_PRIMARY });
    const brandTxt = new Text({ text: BRAND, style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "bold", fontSize: 21 } });
    brandTxt.anchor.set(0.5); brandTxt.position.set(100, 21);
    const brandCont = new Container();
    brandCont.addChild(brandBg, brandTxt);
    brandCont.position.set((PW - 200) / 2, cy);
    panel.addChild(brandCont);
    cy += 52;

    const tagT = new Text({ text: TAGLINE, style: { fill: COL_PRIMARY, fontFamily: FONT, fontWeight: "bold", fontSize: 14, align: "center" } });
    tagT.anchor.set(0.5, 0); tagT.position.set(PW / 2, cy);
    panel.addChild(tagT);
    cy += tagT.height + 8;

    const hlT = new Text({ text: cfg.copy.title, style: { fill: 0x1a1a1a, fontFamily: FONT, fontWeight: "bold", fontSize: 25, align: "center", wordWrap: true, wordWrapWidth: PW - 40 } });
    hlT.anchor.set(0.5, 0); hlT.position.set(PW / 2, cy);
    panel.addChild(hlT);
    cy += hlT.height + 8;

    const elT = new Text({ text: "Carpet 100% refreshed! Pro deep-clean,\nsame-week slots available.", style: { fill: 0x2a2a2a, fontFamily: FONT, fontWeight: "normal", fontSize: 14, align: "center", wordWrap: true, wordWrapWidth: PW - 40 } });
    elT.anchor.set(0.5, 0); elT.position.set(PW / 2, cy);
    panel.addChild(elT);
    cy += elT.height + 12;

    // Photo strip = the actual clean carpet
    const stripW = PW - 28, stripH = 64;
    const stripCont = new Container();
    if (carpetTex) {
      const sp = new Sprite(carpetTex);
      const s = Math.max(stripW / carpetTex.width, stripH / carpetTex.height);
      sp.scale.set(s); sp.anchor.set(0.5); sp.position.set(stripW / 2, stripH / 2);
      const m = new Graphics().roundRect(0, 0, stripW, stripH, 10).fill({ color: 0xffffff });
      stripCont.addChild(m, sp);
      sp.mask = m;
      stripCont.addChild(new Graphics().roundRect(0, 0, stripW, stripH, 10).stroke({ width: 2, color: COL_PRIMARY, alpha: 0.6 }));
    }
    stripCont.position.set(14, cy);
    panel.addChild(stripCont);
    cy += stripH + 10;

    const disT = new Text({ text: "Free quote, no obligation. Results shown are illustrative.", style: { fill: 0x666666, fontFamily: FONT, fontWeight: "normal", fontSize: 11, align: "center", wordWrap: true, wordWrapWidth: PW - 40 } });
    disT.anchor.set(0.5, 0); disT.position.set(PW / 2, cy);
    panel.addChild(disT);
    cy += disT.height + 14;

    const inCtaW = PW - 28, inCtaH = 56;
    const inCta = new Container();
    const inCtaBg = new Graphics();
    inCtaBg.roundRect(0, 0, inCtaW, inCtaH, 28).fill({ color: COL_ACCENT });
    inCtaBg.roundRect(0, 0, inCtaW, inCtaH, 28).stroke({ width: 3, color: shade(COL_ACCENT, -0.22) });
    const inCtaTxt = new Text({ text: cfg.copy.cta, style: { fill: "#1a1208", fontFamily: FONT, fontWeight: "bold", fontSize: 19 } });
    inCtaTxt.anchor.set(0.5); inCtaTxt.position.set(inCtaW / 2, inCtaH / 2);
    inCta.addChild(inCtaBg, inCtaTxt);
    inCta.eventMode = "static";
    inCta.cursor = "pointer";
    inCta.on("pointertap", (e) => { e.stopPropagation(); window.FbPlayableAd.onCTAClick(); });
    inCta.position.set(14, cy);
    panel.addChild(inCta);
    gsap.to(inCta.scale, { x: 1.03, y: 1.03, duration: 0.68, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 0.5 });

    panel.position.set((DW - PW) / 2, (DH - PH) / 2 - 16);
    panel.scale.set(0.82);
    panel.alpha = 0;
    overlayLayer.addChild(panel);
    gsap.to(panel, { alpha: 1, duration: 0.28, delay: 0.05 });
    gsap.to(panel.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(1.7)", delay: 0.05 });

    gsap.to(instrT, { alpha: 0, duration: 0.3 });
    gsap.to([hudBg, progBg, progFill, progLabel], { alpha: 0, duration: 0.5 });
  }

  // ── Ghost finger hint ─────────────────────────────────────────────────────
  const ghost = new Container();
  const gc = new Graphics().circle(0, 0, 20).fill({ color: 0xffffff, alpha: 0.55 });
  ghost.addChild(gc);
  ghost.visible = false;
  fxLayer.addChild(ghost);
  let ghostTl: gsap.core.Timeline | null = null;
  function showGhost(): void {
    if (ghost.visible || gState !== "washing") return;
    ghost.visible = true;
    ghost.alpha = 0;
    const gy = CARPET_Y + CARPET_H * 0.35;
    ghost.position.set(DW * 0.2, gy);
    ghostTl = gsap.timeline({ repeat: 1, onComplete: () => { ghost.visible = false; ghostTl = null; } })
      .to(ghost, { alpha: 0.9, duration: 0.2 })
      .to(ghost, { x: DW * 0.8, duration: 0.9, ease: "sine.inOut" })
      .to(ghost, { alpha: 0, duration: 0.2 });
  }

  // ── Input (convert screen → design space) ─────────────────────────────────
  let ptrDown = false, lastX = -1, lastY = -1, acc = 0, idleMs = 0;
  function toDesign(gx: number, gy: number): { x: number; y: number } {
    return { x: (gx - rootPX) / rootScale, y: (gy - rootPY) / rootScale };
  }
  app.stage.on("pointerdown", (e) => {
    if (gState === "hook") startWashing();
    if (gState !== "washing") return;
    ptrDown = true; idleMs = 0;
    const p = toDesign(e.global.x, e.global.y);
    lastX = p.x; lastY = p.y;
    acc = BRUSH_STEP;
    eraseAt(p.x, p.y);
    if (ghostTl) { ghostTl.kill(); ghostTl = null; ghost.visible = false; }
  });
  app.stage.on("pointermove", (e) => {
    if (!ptrDown || gState !== "washing") return;
    idleMs = 0;
    const p = toDesign(e.global.x, e.global.y);
    acc += Math.hypot(p.x - lastX, p.y - lastY);
    if (acc >= BRUSH_STEP) { eraseAt(p.x, p.y); acc = 0; }
    lastX = p.x; lastY = p.y;
  });
  const up = () => { ptrDown = false; hideTool(); };
  app.stage.on("pointerup", up);
  app.stage.on("pointerupoutside", up);

  // ── Auto-demo (idle fallback — keeps cleaning to 100% for passive users) ──
  let autoActive = false;
  function runAutoDemo(): void {
    if (gState !== "washing" || autoActive) return;
    autoActive = true;
    const sy = CARPET_Y + 30 + Math.random() * (CARPET_H - 60);
    const obj = { t: 0 };
    gsap.to(obj, {
      t: 1, duration: 1.1, ease: "sine.inOut",
      onUpdate: () => {
        if (gState !== "washing") return;
        const x = DW * 0.12 + (DW * 0.76) * obj.t;
        eraseAt(x, sy - ERASE_OFFSET_Y);
      },
      onComplete: () => { autoActive = false; hideTool(); },
    });
  }

  // ── Ticker ────────────────────────────────────────────────────────────────
  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    for (let i = foam.length - 1; i >= 0; i--) {
      const f = foam[i];
      f.g.x += f.vx * dt; f.g.y += f.vy * dt; f.vy += 90 * dt; f.life += dt;
      f.g.alpha = Math.max(0, 0.8 - f.life * 1.9);
      if (f.life > 0.45) { fxLayer.removeChild(f.g); f.g.destroy(); foam.splice(i, 1); }
    }
    if (gState === "washing" && !ptrDown && !autoActive) {
      idleMs += ticker.deltaMS;
      if (idleMs >= IDLE_MS) { idleMs = 0; showGhost(); runAutoDemo(); }
    }
  });

  // ── Hook: tool auto-cleans one stripe, then hands control over ────────────
  function doHook(): void {
    gState = "hook";
    const sy = CARPET_Y + CARPET_H * 0.22;
    const obj = { t: 0 };
    gsap.to(obj, {
      t: 1, duration: 1.0, ease: "sine.inOut", delay: 0.3,
      onUpdate: () => {
        const x = DW * 0.1 + (DW * 0.55) * obj.t;
        stampBrush(x, sy, BRUSH_R * 1.1);
        markClean(x, sy, BRUSH_R * 1.1);
        spawnFoam(x, sy - 16);
        showTool(x, sy - ERASE_OFFSET_Y);
        setProgress(getProgress());
      },
      onComplete: () => { hideTool(); startWashing(); },
    });
  }
  function startWashing(): void {
    if (gState !== "hook") return;
    gState = "washing";
  }

  // ── Layout (design-space contain) ─────────────────────────────────────────
  let rootScale = 1, rootPX = 0, rootPY = 0;
  function layout(): void {
    const w = window.innerWidth, h = window.innerHeight;
    app.canvas.style.width = w + "px";
    app.canvas.style.height = h + "px";
    rootScale = Math.min(w / DW, h / DH);
    rootPX = (w - DW * rootScale) / 2;
    rootPY = (h - DH * rootScale) / 2;
    root.scale.set(rootScale);
    root.position.set(rootPX, rootPY);
  }
  layout();
  window.addEventListener("resize", layout);

  doHook();
  app.renderer.render(app.stage);
  requestAnimationFrame(() => { layout(); app.renderer.render(app.stage); });
}

void (() => window.FbPlayableAd.onCTAClick);
main().catch((e) => console.error("carpet-clean boot error:", e));
