// Keep Them Dry — umbrella drag-catch playable (greybox, procedural graphics).
// PixiJS v8 + GSAP. Portrait 9:16. All visuals: Pixi Graphics only.
//
// Flow: hook (0-3s drop + ghost) → bit1 (normal rain, bounce feedback) →
//       bit2 (faster drops + leaf/acorn bonus) → bit3 (split clusters + wind) →
//       reveal (clouds part, sun) → endcard.
//
// Hard rules honored:
//  - Layout from window.innerWidth/Height, NEVER app.screen at init
//  - antialias: false
//  - Rotation/pivot only on Container wrappers
//  - Pointer input: stage.eventMode="static" + manual hit-tests
//  - dt-clamp: Math.min(0.05, ticker.deltaMS / 1000)
//  - CTA: window.FbPlayableAd.onCTAClick()
//  - Copy from cfg
//  - ghost-finger hint overlaid on first drop
//  - Idle fallback: auto-demo / nudge → endcard

import { Application, Container, Graphics, Text } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// CTA validator grep anchor
void (() => window.FbPlayableAd.onCTAClick);

function num(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

// ── Tunables ───────────────────────────────────────────────────────────────────
const IDLE_HINT_MS    = Number(cfg.params.idleHintMs    ?? 2500);
const AUTO_DEMO_AFTER = Number(cfg.params.autoDemoAfterIdles ?? 2);
const DROP_SPEED_BASE = Number(cfg.params.dropSpeedBase ?? 0.38);
const DROP_SPEED_BIT2 = Number(cfg.params.dropSpeedBit2 ?? 0.52);
const DROP_SPEED_BIT3 = Number(cfg.params.dropSpeedBit3 ?? 0.68);
const UMB_OFFSET_Y    = Number(cfg.params.umbrellaOffsetY ?? 90);
const HIT_SCALE       = Number(cfg.params.hitRadiusScale  ?? 1.4);
const REVEAL_HOLD_MS  = Number(cfg.params.revealHoldMs   ?? 2000);
const GAMEPLAY_MS     = Number(cfg.params.gameplayDurationMs ?? 18000);

// ── Colors ─────────────────────────────────────────────────────────────────────
const C_BG    = num(cfg.style.colors.background);  // #FFF8EC cream
const C_PRI   = num(cfg.style.colors.primary);      // #2E6B4F forest green
const C_ACC   = num(cfg.style.colors.accent);       // #E8B84B warm gold
const C_TXT   = num(cfg.style.colors.text);         // #1A3D2B dark green
const C_RAIN  = 0x7ab8d4;
const C_CLOUD = 0xdce8f0;
const C_SUN   = 0xffe066;
const C_GRASS = 0x5a8f3c;
const FONT    = cfg.style.font.family;

// ── Phase / state ──────────────────────────────────────────────────────────────
type Phase = "hook" | "bit1" | "bit2" | "bit3" | "reveal" | "end";
let phase: Phase     = "hook";
let phaseTimer       = 0;
let idleTimer        = 0;
let idleCount        = 0;
let hasInteracted    = false;
let gameTime         = 0;
let protection       = 100;    // 0..100
let meterPaused      = false;
let meterPauseTimer  = 0;
let spawnTimer       = 0;
let spawnInterval    = 0.7;
let windX            = 0;
let windTimer        = 0;
let shiverTimer      = 0;
let shiverActive     = false;
let paperCorner      = 0;      // 0..1

let umbX = 0, umbY = 0;
let umbTargetX = 0, umbTargetY = 0;
let pointerDown = false;
let pointerX = 0, pointerY = 0;
let umbRadius = 0;

interface Drop {
  cont: Container;
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  alive: boolean;
  type: "rain" | "leaf" | "acorn";
  bounced: boolean;
  bounceTimer: number;
}
interface Heart {
  cont: Container;
  vy: number;
  timer: number;
}
const drops:  Drop[]  = [];
const hearts: Heart[] = [];

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    background: C_BG,
    antialias: false,
    preference: "webgl",
    resolution: 1,
    autoDensity: false,
  });
  app.canvas.style.width  = window.innerWidth  + "px";
  app.canvas.style.height = window.innerHeight + "px";
  document.body.appendChild(app.canvas);

  app.stage.eventMode = "static";
  app.stage.hitArea   = app.screen;

  // ── Layers ─────────────────────────────────────────────────────────────────
  const bgLayer      = new Container();
  const cloudLayer   = new Container();
  const gameLayer    = new Container();
  const fxLayer      = new Container();
  const uiLayer      = new Container();
  const overlayLayer = new Container();
  app.stage.addChild(bgLayer, cloudLayer, gameLayer, fxLayer, uiLayer, overlayLayer);
  gameLayer.interactiveChildren = false;

  // ── Sky + ground background ────────────────────────────────────────────────
  const skyGfx    = new Graphics();
  const groundGfx = new Graphics();
  bgLayer.addChild(skyGfx, groundGfx);

  // ── Clouds ─────────────────────────────────────────────────────────────────
  function makeCloud(scale: number): Container {
    const c = new Container();
    const g = new Graphics();
    g.ellipse(0, 0, 54, 30).fill({ color: C_CLOUD });
    g.ellipse(38, -10, 40, 26).fill({ color: C_CLOUD });
    g.ellipse(-34, -4, 36, 22).fill({ color: C_CLOUD });
    g.ellipse(10, -18, 46, 28).fill({ color: C_CLOUD });
    const wrapper = new Container();
    wrapper.addChild(g);
    wrapper.scale.set(scale);
    c.addChild(wrapper);
    return c;
  }
  const cloud1 = makeCloud(1.2);
  const cloud2 = makeCloud(0.9);
  const cloud3 = makeCloud(1.05);
  cloudLayer.addChild(cloud1, cloud2, cloud3);

  // ── Sun (reveal) ───────────────────────────────────────────────────────────
  const sunCont = new Container();
  const sunGfx  = new Graphics();
  sunGfx.circle(0, 0, 50).fill({ color: C_SUN });
  for (let i = 0; i < 8; i++) {
    const ang  = (i / 8) * Math.PI * 2;
    const rWrap = new Container();
    const ray   = new Graphics().rect(-4, 56, 8, 20).fill({ color: C_SUN, alpha: 0.75 });
    rWrap.addChild(ray);
    rWrap.rotation = ang;
    sunCont.addChild(rWrap);
  }
  sunCont.addChild(sunGfx);
  sunCont.alpha = 0;
  bgLayer.addChild(sunCont);

  // ── Trees (background, decorative) ────────────────────────────────────────
  const treesGfx = new Graphics();
  bgLayer.addChild(treesGfx);

  function drawTrees(w: number, groundY: number): void {
    treesGfx.clear();
    const positions = [0.08, 0.18, 0.78, 0.88, 0.95];
    const heights   = [0.14, 0.10, 0.12, 0.09, 0.13];
    for (let i = 0; i < positions.length; i++) {
      const tx = w * positions[i];
      const th = w * heights[i];
      const ty = groundY;
      treesGfx.rect(tx - 4, ty - th * 0.5, 8, th * 0.55).fill({ color: num("#6b4c2a") });
      treesGfx.circle(tx, ty - th * 0.62).fill({ color: 0 }); // dummy reset
      treesGfx.poly([tx - th * 0.38, ty - th * 0.55,
                     tx,             ty - th * 1.1,
                     tx + th * 0.38, ty - th * 0.55]).fill({ color: num("#3d7235") });
      treesGfx.poly([tx - th * 0.3, ty - th * 0.78,
                     tx,            ty - th * 1.28,
                     tx + th * 0.3, ty - th * 0.78]).fill({ color: num("#2e6b4f") });
    }
  }

  // ── Paper card — drawn FIRST so family silhouettes appear on top ─────────
  const paperGfx = new Graphics();
  gameLayer.addChild(paperGfx);

  // ── Family silhouette ─────────────────────────────────────────────────────
  const familyCont = new Container();
  const familyGfx  = new Graphics();   // inside familyCont (no direct rotation on gfx)
  const familyWrap = new Container();  // wrapper for pivot-based tilt
  familyWrap.addChild(familyGfx);
  familyCont.addChild(familyWrap);
  gameLayer.addChild(familyCont);

  function drawFamilyShape(unit: number): void {
    familyGfx.clear();
    // Adults (green silhouettes)
    const au = unit;
    familyGfx.circle(-au * 1.8, -au * 3.8, au * 0.8).fill({ color: C_PRI });
    familyGfx.roundRect(-au * 2.6, -au * 3.0, au * 1.6, au * 3.0, au * 0.3).fill({ color: C_PRI });
    familyGfx.circle(au * 1.8,  -au * 3.8, au * 0.8).fill({ color: C_PRI });
    familyGfx.roundRect(au * 1.0, -au * 3.0, au * 1.6, au * 3.0, au * 0.3).fill({ color: C_PRI });
    // Child (gold, center)
    familyGfx.circle(0, -au * 2.5, au * 0.6).fill({ color: C_ACC });
    familyGfx.roundRect(-au * 0.7, -au * 1.9, au * 1.4, au * 1.9, au * 0.25).fill({ color: C_ACC });
    // Shadow line on ground
    familyGfx.ellipse(0, 0, au * 3.0, au * 0.5).fill({ color: 0x000000, alpha: 0.10 });
  }

  function drawPaper(cx: number, cy: number, pw: number, ph: number): void {
    paperGfx.clear();
    paperGfx.roundRect(cx - pw / 2, cy - ph, pw, ph, 10).fill({ color: 0xfff8ec });
    // Lines
    for (let i = 1; i <= 3; i++) {
      const lx1 = cx - pw * 0.38, lx2 = cx + pw * 0.38, ly = cy - ph * (i / 4);
      paperGfx.moveTo(lx1, ly).lineTo(lx2, ly).stroke({ width: 1, color: C_PRI, alpha: 0.1 });
    }
    // Darkened corner on miss
    if (paperCorner > 0.02) {
      const cs = pw * 0.36 * paperCorner;
      paperGfx.poly([
        cx + pw / 2 - cs, cy - ph,
        cx + pw / 2,      cy - ph,
        cx + pw / 2,      cy - ph + cs,
      ]).fill({ color: num("#7a5010"), alpha: 0.5 * paperCorner });
    }
    // Paper stroke
    paperGfx.roundRect(cx - pw / 2, cy - ph, pw, ph, 10).stroke({ width: 2, color: C_PRI, alpha: 0.12 });
  }

  // ── Umbrella ───────────────────────────────────────────────────────────────
  const umbrellaCont = new Container();
  const umbrellaWrap = new Container();  // pivot wrapper (squash/stretch here)
  const umbrellaGfx  = new Graphics();
  umbrellaWrap.addChild(umbrellaGfx);
  umbrellaCont.addChild(umbrellaWrap);
  gameLayer.addChild(umbrellaCont);

  function drawUmbrella(r: number): void {
    umbrellaGfx.clear();
    // Dome panels (alternating shades)
    const panels = 7;
    for (let i = 0; i < panels; i++) {
      const a0 = Math.PI + (i / panels) * Math.PI;
      const a1 = Math.PI + ((i + 1) / panels) * Math.PI;
      const mid = (a0 + a1) / 2;
      const pts: number[] = [0, 0];
      for (let s = 0; s <= 8; s++) {
        const a = a0 + (s / 8) * (a1 - a0);
        pts.push(r * Math.cos(a), r * Math.sin(a) * 0.52);
      }
      const shade = i % 2 === 0 ? C_PRI : num("#3a7f60");
      umbrellaGfx.poly(pts).fill({ color: shade });
      void mid;
    }
    // Ribs
    for (let i = 0; i <= panels; i++) {
      const a = Math.PI + (i / panels) * Math.PI;
      umbrellaGfx.moveTo(0, 0).lineTo(r * Math.cos(a), r * Math.sin(a) * 0.52)
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.22 });
    }
    // Dome outline
    const dpts: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (i / 24) * Math.PI;
      dpts.push(r * Math.cos(a), r * Math.sin(a) * 0.52);
    }
    umbrellaGfx.poly(dpts).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
    // Handle (shorter — just past the dome skirt, not long enough to occlude family)
    umbrellaGfx.rect(-3.5, 0, 7, r * 0.42).fill({ color: num("#6b4c2a") });
    umbrellaGfx.circle(-3.5, r * 0.42, 5).fill({ color: num("#5a3a1a") });
    // Tip at top
    umbrellaGfx.circle(0, 0, 5).fill({ color: C_ACC });
  }

  // ── Protection meter ───────────────────────────────────────────────────────
  const meterBg   = new Graphics();
  const meterFill = new Graphics();
  uiLayer.addChild(meterBg, meterFill);

  function drawMeter(w: number, h: number): void {
    const mw = w * 0.52, mh = 14;
    const mx = (w - mw) / 2, my = h * 0.055;
    meterBg.clear().roundRect(mx, my, mw, mh, 7).fill({ color: 0x000000, alpha: 0.12 });
    meterFill.clear();
    const fw = Math.max(10, mw * (protection / 100));
    meterFill.roundRect(mx, my, fw, mh, 7).fill({ color: C_PRI });
  }

  // ── UI text elements ───────────────────────────────────────────────────────
  const titleTxt = new Text({
    text: "Keep them dry",
    style: { fill: C_TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 20, align: "center" },
  });
  titleTxt.anchor.set(0.5, 0);
  uiLayer.addChild(titleTxt);

  const meterLabel = new Text({
    text: "Protection",
    style: { fill: C_PRI, fontFamily: FONT, fontWeight: "bold", fontSize: 13 },
  });
  uiLayer.addChild(meterLabel);

  const nudgeTxt = new Text({
    text: "Almost! Keep them covered",
    style: { fill: num("#c05000"), fontFamily: FONT, fontWeight: "bold", fontSize: 17, align: "center" },
  });
  nudgeTxt.anchor.set(0.5);
  nudgeTxt.alpha = 0;
  uiLayer.addChild(nudgeTxt);

  // ── Ghost finger ───────────────────────────────────────────────────────────
  const ghostCont   = new Container();
  const ghostCircle = new Graphics().circle(0, 0, 22).fill({ color: 0x000000, alpha: 0.25 });
  ghostCont.addChild(ghostCircle);
  ghostCont.alpha = 0;
  uiLayer.addChild(ghostCont);

  // ── CTA + endcard ──────────────────────────────────────────────────────────
  const endcardCont = new Container();
  endcardCont.alpha = 0;
  overlayLayer.addChild(endcardCont);

  const ctaBtn  = new Container();
  const ctaBg   = new Graphics();
  const ctaTxt  = new Text({
    text: cfg.copy.cta,
    style: { fill: 0xffffff, fontFamily: FONT, fontWeight: "bold", fontSize: 28 },
  });
  ctaTxt.anchor.set(0.5);
  ctaBtn.addChild(ctaBg, ctaTxt);
  ctaBtn.alpha = 0;
  ctaBtn.eventMode = "static";
  ctaBtn.cursor    = "pointer";
  ctaBtn.on("pointertap", () => window.FbPlayableAd.onCTAClick());
  overlayLayer.addChild(ctaBtn);

  // ── Layout function ─────────────────────────────────────────────────────────
  function layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    app.canvas.style.width  = w + "px";
    app.canvas.style.height = h + "px";

    // Sky (upper 62% of screen)
    const skyH = h * 0.62;
    skyGfx.clear()
      .rect(0, 0, w, skyH).fill({ color: 0xbcdbef })
      .rect(0, skyH * 0.7, w, skyH * 0.3).fill({ color: 0xcde4f0, alpha: 0.7 });

    // Ground + grass (lower 38%)
    const groundY = h * 0.62;
    groundGfx.clear()
      // earth fill
      .rect(0, groundY, w, h - groundY).fill({ color: 0xd4c69c })
      // grass strip
      .rect(0, groundY, w, h * 0.042).fill({ color: C_GRASS })
      // darker grass edge
      .rect(0, groundY + h * 0.042, w, h * 0.018).fill({ color: num("#4a7226"), alpha: 0.55 })
      // stone path running down the lower half
      .roundRect(w * 0.38, groundY + h * 0.06, w * 0.24, h * 0.32, 4).fill({ color: num("#c8bda6"), alpha: 0.85 })
      // path edge lines
      .roundRect(w * 0.38, groundY + h * 0.06, w * 0.24, h * 0.32, 4).stroke({ width: 2, color: num("#b0a48c"), alpha: 0.6 });
    // Path stone seams
    for (let si = 1; si <= 5; si++) {
      const sy = groundY + h * 0.06 + (h * 0.32 / 6) * si;
      groundGfx.moveTo(w * 0.38, sy).lineTo(w * 0.62, sy)
        .stroke({ width: 1, color: num("#b0a48c"), alpha: 0.5 });
    }
    // Flower spots on grass (decorative)
    const flowerSpots = [[0.15, 0.63], [0.22, 0.65], [0.72, 0.64], [0.82, 0.63]];
    for (const [fx2, fy2] of flowerSpots) {
      groundGfx.circle(w * fx2, h * fy2, 5).fill({ color: C_ACC, alpha: 0.7 });
      groundGfx.circle(w * fx2, h * fy2, 3).fill({ color: 0xffffff, alpha: 0.5 });
    }

    // Decorative trees left and right
    drawTrees(w, groundY);

    // Sun
    sunCont.position.set(w * 0.72, h * 0.09);

    // Clouds
    cloud1.position.set(w * 0.12, h * 0.11);
    cloud2.position.set(w * 0.58, h * 0.07);
    cloud3.position.set(w * 0.36, h * 0.16);

    // Family centered in upper zone, feet near ground line
    const unit = w * 0.048;
    drawFamilyShape(unit);
    familyCont.position.set(w / 2, groundY - h * 0.01);

    // Paper behind family
    const pw = w * 0.44, ph = h * 0.26;
    drawPaper(w / 2, groundY - h * 0.01, pw, ph);

    // Umbrella radius
    umbRadius = w * 0.21;
    drawUmbrella(umbRadius);

    // Initial umbrella position (above family)
    if (!pointerDown) {
      umbTargetX = w / 2;
      umbTargetY = groundY - h * 0.22;
    }
    umbX = umbTargetX;
    umbY = umbTargetY;
    umbrellaCont.position.set(umbX, umbY);

    // Meter (top area below title)
    const my = h * 0.055;
    drawMeter(w, h);
    meterLabel.position.set((w - w * 0.52) / 2, my - 18);

    // Title below meter
    titleTxt.style.wordWrapWidth = w * 0.76;
    titleTxt.position.set(w / 2, h * 0.078);

    // Nudge
    nudgeTxt.position.set(w / 2, groundY - h * 0.32);

    // Ghost hint start pos (will animate in startGhostDemo) — lower play zone
    ghostCont.position.set(w * 0.35, groundY + h * 0.12);

    // CTA button bottom thumb zone
    const bw = Math.min(w * 0.76, 280);
    const bh = 56;
    const bx = (w - bw) / 2;
    const by = h - bh - h * 0.04;
    ctaBg.clear().roundRect(bx, by, bw, bh, 28).fill({ color: C_ACC });
    ctaTxt.position.set(w / 2, by + bh / 2);

    // Endcard panel
    buildEndcard(w, h);
  }

  // ── Endcard builder ────────────────────────────────────────────────────────
  function buildEndcard(w: number, h: number): void {
    endcardCont.removeChildren();
    // Scrim
    endcardCont.addChild(new Graphics().rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.5 }));

    const pw = Math.min(w * 0.88, 360);
    const ph = h * 0.65;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2 - h * 0.04;

    endcardCont.addChild(
      new Graphics()
        .roundRect(px, py, pw, ph, 22)
        .fill({ color: C_BG })
        .stroke({ width: 4, color: C_PRI }),
    );

    // Brand name
    const brandTxt = new Text({
      text: "Evergreen Life",
      style: { fill: C_PRI, fontFamily: FONT, fontWeight: "bold", fontSize: 26, align: "center" },
    });
    brandTxt.anchor.set(0.5, 0);
    brandTxt.position.set(w / 2, py + 20);
    endcardCont.addChild(brandTxt);

    // Brand tree/umbrella icon
    const iconG = new Graphics();
    const ix = w / 2, iy = py + 80;
    // Canopy dome
    iconG.poly([ix - 30, iy, ix, iy - 40, ix + 30, iy]).fill({ color: C_PRI });
    iconG.poly([ix - 22, iy - 16, ix, iy - 50, ix + 22, iy - 16]).fill({ color: num("#3a7f60") });
    // Trunk
    iconG.rect(ix - 4, iy, 8, 20).fill({ color: num("#6b4c2a") });
    // Two small figures
    iconG.circle(ix - 16, iy + 28, 6).fill({ color: C_PRI });
    iconG.roundRect(ix - 20, iy + 34, 10, 18, 2).fill({ color: C_PRI });
    iconG.circle(ix + 16, iy + 28, 6).fill({ color: C_PRI });
    iconG.roundRect(ix + 10, iy + 34, 10, 18, 2).fill({ color: C_PRI });
    endcardCont.addChild(iconG);

    // "Protected" badge
    const badgeG = new Graphics()
      .roundRect(w / 2 - 68, py + 136, 136, 28, 10)
      .fill({ color: C_PRI });
    endcardCont.addChild(badgeG);
    const badgeTxt = new Text({
      text: "Protected",
      style: { fill: 0xffffff, fontFamily: FONT, fontWeight: "bold", fontSize: 16, align: "center" },
    });
    badgeTxt.anchor.set(0.5);
    badgeTxt.position.set(w / 2, py + 150);
    endcardCont.addChild(badgeTxt);

    // Endcard line
    const lineTxt = new Text({
      text: "They stayed dry. Find a life plan\nthat fits — free plan match,\nno obligation.",
      style: {
        fill: C_TXT,
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: 16,
        align: "center",
        wordWrap: true,
        wordWrapWidth: pw * 0.84,
      },
    });
    lineTxt.anchor.set(0.5, 0);
    lineTxt.position.set(w / 2, py + 176);
    endcardCont.addChild(lineTxt);

    // Disclaimer (≥10px, readable)
    const discTxt = new Text({
      text: "Coverage varies by state. Licensed agents in [State]. No obligation.",
      style: {
        fill: C_TXT,
        fontFamily: FONT,
        fontSize: 11,
        align: "center",
        wordWrap: true,
        wordWrapWidth: pw * 0.88,
      },
    });
    discTxt.anchor.set(0.5, 1);
    discTxt.position.set(w / 2, py + ph - 8);
    endcardCont.addChild(discTxt);
  }

  // ── Drop factory ────────────────────────────────────────────────────────────
  function spawnDrop(w: number, h: number, type: "rain" | "leaf" | "acorn" = "rain", fromX?: number): void {
    const r = type === "rain" ? 5 : type === "leaf" ? 8 : 7;
    const spd = phase === "bit3" ? DROP_SPEED_BIT3
              : phase === "bit2" ? DROP_SPEED_BIT2
              : DROP_SPEED_BASE;
    const baseVY = spd * h;

    const cont = new Container();
    const gfx  = new Graphics();
    if (type === "rain") {
      gfx.ellipse(0, 0, r, r * 1.55).fill({ color: C_RAIN, alpha: 0.9 });
    } else if (type === "leaf") {
      gfx.poly([0, -9, 7, 0, 0, 9, -7, 0]).fill({ color: num("#5a9a3c"), alpha: 0.92 });
    } else {
      gfx.circle(0, 3, 7).fill({ color: num("#8b6010") });
      gfx.ellipse(0, -4, 9, 5).fill({ color: num("#4a7a22") });
    }
    cont.addChild(gfx);

    const sx = fromX !== undefined ? fromX : w * (0.08 + Math.random() * 0.84);
    const windVX = phase === "bit3" ? (Math.random() - 0.5) * w * 0.14 : 0;
    cont.position.set(sx, -18);
    gameLayer.addChild(cont);

    drops.push({ cont, x: sx, y: -18, vx: windVX, vy: baseVY, r, alive: true, type, bounced: false, bounceTimer: 0 });
  }

  // ── Bounce effect ──────────────────────────────────────────────────────────
  function doBounce(drop: Drop, w: number, h: number): void {
    drop.bounced = true;
    drop.bounceTimer = 0.38;
    // Squash/stretch the umbrella wrapper
    gsap.to(umbrellaWrap.scale, { x: 1.09, y: 0.92, duration: 0.07, yoyo: true, repeat: 1, ease: "power2.out" });
    // Ripple
    const rip = new Graphics()
      .circle(0, 0, umbRadius * 0.38)
      .stroke({ width: 3, color: 0xffffff, alpha: 0.65 });
    rip.position.set(drop.x, umbrellaCont.y);
    fxLayer.addChild(rip);
    gsap.to(rip.scale, { x: 1.7, y: 1.7, duration: 0.32, ease: "power1.out" });
    gsap.to(rip, { alpha: 0, duration: 0.32, ease: "power1.in",
      onComplete: () => { fxLayer.removeChild(rip); rip.destroy(); } });
    if (!meterPaused) protection = Math.min(100, protection + 1.8);
    drawMeter(w, h);
  }

  // ── Miss effect ────────────────────────────────────────────────────────────
  function doMiss(w: number, h: number): void {
    meterPaused   = true;
    meterPauseTimer = 2.2;
    protection = Math.max(20, protection - 7);
    drawMeter(w, h);
    // Paper corner darkens
    paperCorner = Math.min(1, paperCorner + 0.45);
    drawPaper(w / 2, h * 0.62 - h * 0.01, w * 0.44, h * 0.26);
    gsap.to({ v: paperCorner }, {
      v: 0, duration: 1.9,
      onUpdate: function() {
        paperCorner = (this.targets() as Array<{v: number}>)[0].v;
        drawPaper(w / 2, h * 0.62 - h * 0.01, w * 0.44, h * 0.26);
      },
    });
    // Family shiver
    shiverActive = true;
    shiverTimer  = 0.5;
    // Sad tilt on wrapper
    gsap.to(familyWrap, { rotation: 0.07, duration: 0.15, yoyo: true, repeat: 3, ease: "sine.inOut" });
    // Nudge
    nudgeTxt.alpha = 0;
    gsap.to(nudgeTxt, { alpha: 1, duration: 0.2 });
    gsap.to(nudgeTxt, { alpha: 0, duration: 0.4, delay: 1.7 });
  }

  // ── Leaf/acorn bonus ───────────────────────────────────────────────────────
  function doBonus(drop: Drop): void {
    protection = Math.min(100, protection + 4.5);
    drop.bounced = true;
    drop.bounceTimer = 0.55;
    // Different arc per type
    drop.vx = (Math.random() - 0.5) * window.innerWidth * 0.3;
    drop.vy = drop.type === "leaf"
      ? -window.innerHeight * 0.22   // leaf floats gently
      : -window.innerHeight * 0.32;  // acorn pops
    // Gold sparkle
    const sp = new Container();
    const sg = new Graphics().star(0, 0, 5, 11, 5).fill({ color: C_ACC });
    sp.addChild(sg);
    sp.position.set(drop.x, drop.y);
    fxLayer.addChild(sp);
    gsap.to(sp, { y: sp.y - 55, alpha: 0, duration: 0.55, ease: "power2.out",
      onComplete: () => { fxLayer.removeChild(sp); sp.destroy(); } });
  }

  // ── Near-miss: gold heart ─────────────────────────────────────────────────
  function spawnHeart(x: number, y: number): void {
    const cont = new Container();
    const g    = new Graphics();
    // Heart using two circles + triangle
    g.circle(-6, -6, 6).fill({ color: C_ACC });
    g.circle( 6, -6, 6).fill({ color: C_ACC });
    g.poly([-12, -4, 12, -4, 0, 10]).fill({ color: C_ACC });
    cont.addChild(g);
    cont.position.set(x, y);
    fxLayer.addChild(cont);
    cont.scale.set(0.4);
    gsap.to(cont.scale, { x: 1.3, y: 1.3, duration: 0.18, ease: "back.out(2.5)" });
    gsap.to(cont.scale, { x: 1.0, y: 1.0, duration: 0.18, delay: 0.18, ease: "back.out(1.6)" });
    hearts.push({ cont, vy: -window.innerHeight * 0.17, timer: 1.2 });
  }

  // ── Ghost finger demo ──────────────────────────────────────────────────────
  function startGhostDemo(w: number, h: number): void {
    ghostCont.alpha = 0.75;
    ghostCont.position.set(w * 0.32, h * 0.68);
    gsap.killTweensOf(ghostCont);
    gsap.to(ghostCont, {
      x: w * 0.68, y: h * 0.48,
      duration: 1.8, ease: "sine.inOut",
      yoyo: true, repeat: -1,
      onUpdate: () => {
        if (!pointerDown) {
          umbTargetX = ghostCont.x;
          umbTargetY = ghostCont.y - UMB_OFFSET_Y;
        }
      },
    });
  }

  function stopGhostDemo(): void {
    gsap.killTweensOf(ghostCont);
    gsap.to(ghostCont, { alpha: 0, duration: 0.3 });
  }

  // ── Pointer events ─────────────────────────────────────────────────────────
  app.stage.on("pointerdown", (e) => {
    if (phase === "end" || phase === "reveal") return;
    pointerDown = true;
    pointerX    = e.global.x;
    pointerY    = e.global.y;
    umbTargetX  = pointerX;
    umbTargetY  = pointerY - UMB_OFFSET_Y;
    if (!hasInteracted) {
      hasInteracted = true;
      stopGhostDemo();
      gsap.to(titleTxt, { alpha: 0, duration: 0.5, delay: 2.0 });
    }
    idleTimer = 0;
    idleCount = 0;
  });
  app.stage.on("pointermove", (e) => {
    if (!pointerDown || phase === "end" || phase === "reveal") return;
    pointerX   = e.global.x;
    pointerY   = e.global.y;
    umbTargetX = pointerX;
    umbTargetY = pointerY - UMB_OFFSET_Y;
    idleTimer  = 0;
  });
  app.stage.on("pointerup",        () => { pointerDown = false; });
  app.stage.on("pointerupoutside", () => { pointerDown = false; });

  // ── Phase transitions ──────────────────────────────────────────────────────
  function enterReveal(): void {
    if (phase === "reveal" || phase === "end") return;
    phase = "reveal";
    // Clear drops
    for (const d of drops) {
      if (d.alive) { d.alive = false; gameLayer.removeChild(d.cont); d.cont.destroy(); }
    }
    drops.length = 0;
    // Clouds part
    gsap.to(cloud1, { x: -w() * 0.6, duration: 1.3, ease: "power2.in" });
    gsap.to(cloud2, { x: w() * 1.5,  duration: 1.1, ease: "power2.in" });
    gsap.to(cloud3, { y: -h() * 0.2, duration: 0.9, ease: "power2.in" });
    // Sun rises
    gsap.to(sunCont, { alpha: 1, duration: 1.3, delay: 0.5, ease: "power1.out" });
    gsap.to(sunCont.scale, { x: 1.12, y: 1.12, duration: 2.0, delay: 0.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
    // Umbrella fades (family now safe)
    gsap.to(umbrellaCont, { alpha: 0, duration: 0.8, delay: 0.3 });
    // Hide UI
    gsap.to(titleTxt, { alpha: 0, duration: 0.3 });
    gsap.delayedCall(REVEAL_HOLD_MS / 1000, showEndcard);
  }

  function showEndcard(): void {
    if (phase === "end") return;
    phase = "end";
    buildEndcard(window.innerWidth, window.innerHeight);
    gsap.to(endcardCont, { alpha: 1, duration: 0.45, ease: "power1.out" });
    gsap.to(ctaBtn,      { alpha: 1, duration: 0.45, delay: 0.25, ease: "power1.out" });
    // CTA bob
    gsap.to(ctaBtn, { y: -6, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  function w(): number { return window.innerWidth; }
  function h(): number { return window.innerHeight; }

  // ── Main ticker ─────────────────────────────────────────────────────────────
  layout();
  window.addEventListener("resize", layout);

  // Hook: scripted first drop at 0.8s + ghost finger
  gsap.delayedCall(0.4, () => {
    if (!hasInteracted) {
      startGhostDemo(window.innerWidth, window.innerHeight);
    }
  });
  gsap.delayedCall(0.8, () => {
    spawnDrop(window.innerWidth, window.innerHeight, "rain", window.innerWidth * 0.5);
  });

  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const groundY = H * 0.62;

    if (phase === "end") { app.renderer.render(app.stage); return; }

    gameTime   += dt;
    phaseTimer += dt;

    // ── Idle tracking ────────────────────────────────────────────────────────
    // Two paths:
    //  • Never interacted: enterReveal after AUTO_DEMO_AFTER × IDLE_HINT_MS
    //  • Interacted then went idle: enterReveal after 3.5s of no pointermove
    if (phase !== "reveal" && phase !== "end") {
      idleTimer += dt;
      const idleLimit = hasInteracted ? 2.8 : IDLE_HINT_MS / 1000;
      if (idleTimer > idleLimit) {
        idleTimer = 0;
        idleCount++;
        if (!hasInteracted && idleCount < AUTO_DEMO_AFTER) {
          // just a tick, not yet reveal
        } else {
          enterReveal();
        }
      }
    }

    // ── Phase transitions ────────────────────────────────────────────────────
    if (phase === "hook"  && phaseTimer >  3.0) { phase = "bit1"; phaseTimer = 0; spawnInterval = 0.65; }
    if (phase === "bit1"  && phaseTimer >  6.0) { phase = "bit2"; phaseTimer = 0; spawnInterval = 0.46; windTimer = 2.0; }
    if (phase === "bit2"  && phaseTimer >  5.0) { phase = "bit3"; phaseTimer = 0; spawnInterval = 0.30; windX = 0; }
    if (phase === "bit3"  && phaseTimer >  4.5) { enterReveal(); }
    if (gameTime > GAMEPLAY_MS / 1000 && phase !== "reveal" && phase !== "end") { enterReveal(); }

    // ── Umbrella lerp ────────────────────────────────────────────────────────
    const ls = Math.min(1, 18 * dt);
    umbX += (umbTargetX - umbX) * ls;
    umbY += (umbTargetY - umbY) * ls;
    umbrellaCont.position.set(umbX, umbY);

    // ── Wind (bit3) ───────────────────────────────────────────────────────────
    if (phase === "bit3") {
      windTimer += dt;
      if (windTimer > 1.6) { windTimer = 0; windX = (Math.random() - 0.5) * W * 0.25; }
    }

    // ── Spawn drops ───────────────────────────────────────────────────────────
    if (phase !== "hook" && phase !== "reveal" && phase !== "end") {
      spawnTimer += dt;
      if (spawnTimer >= spawnInterval) {
        spawnTimer = 0;
        if (phase === "bit3") {
          spawnDrop(W, H, "rain", W * (0.18 + Math.random() * 0.26));
          spawnDrop(W, H, "rain", W * (0.56 + Math.random() * 0.26));
        } else {
          spawnDrop(W, H, "rain");
        }
        if ((phase === "bit2" || phase === "bit3") && Math.random() < 0.22) {
          spawnDrop(W, H, Math.random() < 0.5 ? "leaf" : "acorn");
        }
      }
    }

    // ── Update drops ─────────────────────────────────────────────────────────
    const hitR = umbRadius * HIT_SCALE;

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (!d.alive) { drops.splice(i, 1); continue; }

      if (phase === "bit3") d.vx += windX * dt * 0.3;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.cont.position.set(d.x, d.y);

      // Bounced drops fade out
      if (d.bounced) {
        d.bounceTimer -= dt;
        d.cont.alpha = Math.max(0, d.bounceTimer / 0.38);
        if (d.bounceTimer <= 0) {
          d.alive = false; gameLayer.removeChild(d.cont); d.cont.destroy(); drops.splice(i, 1);
        }
        continue;
      }

      // Dome hit test
      const dx = d.x - umbX;
      const dy = d.y - umbY;
      const domeRy = hitR * 0.52; // dome is an ellipse, ry ≈ 0.52 * rx
      // Expand hitbox by velocity*dt against tunneling
      const expand = (Math.abs(d.vx) + Math.abs(d.vy)) * dt * 0.4;
      const inDome =
        (dx * dx) / ((hitR + expand) * (hitR + expand)) +
        (dy * dy) / ((domeRy + expand) * (domeRy + expand)) <= 1.0 &&
        dy <= 0; // only upper hemisphere

      if (inDome) {
        // Reflect: rotate normal at dome edge
        const nx = dx / (hitR + 0.001);
        d.vx = nx * Math.abs(d.vy) * 0.45 + d.vx * 0.25;
        d.vy = -Math.abs(d.vy) * 0.5;
        if (d.type === "leaf" || d.type === "acorn") {
          doBonus(d);
        } else {
          doBounce(d, W, H);
        }
        // Near-miss check (drop near rim)
        const rim = Math.sqrt((dx * dx) / (hitR * hitR) + (dy * dy) / (domeRy * domeRy));
        if (rim > 0.72 && rim <= 1.02) {
          spawnHeart(d.x, d.y);
        }
        continue;
      }

      // Miss zone: drop hits the family
      const famY0 = groundY - H * 0.30;
      const famY1 = groundY + H * 0.02;
      if (d.y > famY0 && d.y < famY1 && Math.abs(d.x - W / 2) < W * 0.26) {
        d.alive = false; gameLayer.removeChild(d.cont); d.cont.destroy(); drops.splice(i, 1);
        doMiss(W, H);
        continue;
      }

      // Off screen
      if (d.y > H + 20 || d.x < -40 || d.x > W + 40) {
        d.alive = false; gameLayer.removeChild(d.cont); d.cont.destroy(); drops.splice(i, 1);
      }
    }

    // ── Hearts ────────────────────────────────────────────────────────────────
    for (let i = hearts.length - 1; i >= 0; i--) {
      const hrt = hearts[i];
      hrt.timer -= dt;
      hrt.cont.y += hrt.vy * dt;
      hrt.cont.alpha = Math.max(0, hrt.timer / 1.2);
      if (hrt.timer <= 0) { fxLayer.removeChild(hrt.cont); hrt.cont.destroy(); hearts.splice(i, 1); }
    }

    // ── Meter decay ───────────────────────────────────────────────────────────
    if (meterPaused) {
      meterPauseTimer -= dt;
      if (meterPauseTimer <= 0) meterPaused = false;
    } else {
      protection = Math.max(0, protection - 0.7 * dt);
    }
    drawMeter(W, H);

    // ── Shiver ────────────────────────────────────────────────────────────────
    if (shiverActive) {
      shiverTimer -= dt;
      if (shiverTimer <= 0) {
        shiverActive = false;
        familyCont.x = W / 2;
      } else {
        familyCont.x = W / 2 + Math.sin(shiverTimer * 58) * 4;
      }
    }

    app.renderer.render(app.stage);
  });

  // Second paint: Pixi v8 shader-race workaround
  requestAnimationFrame(() => { layout(); app.renderer.render(app.stage); });
}

main().catch((e) => console.error(e));
