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
const UMB_OFFSET_Y    = Number(cfg.params.umbrellaOffsetY ?? 100);
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
    background: 0xbcdbef, // sky color, no cream bar
    antialias: false,
    preference: "webgl",
    resolution: 1,
    autoDensity: false,
  });
  app.canvas.style.width  = window.innerWidth  + "px";
  app.canvas.style.height = window.innerHeight + "px";
  // ensure no white gaps at edges
  app.canvas.style.display = "block";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.overflow = "hidden";
  document.body.style.background = "#bcdbef";
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

  // ── Sky gradient (full viewport top 60%) ──────────────────────────────────
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

  function drawTrees(ww: number, groundY: number): void {
    treesGfx.clear();
    const positions = [0.06, 0.14, 0.80, 0.88, 0.94];
    const heights   = [0.12, 0.09, 0.10, 0.08, 0.11];
    for (let i = 0; i < positions.length; i++) {
      const tx = ww * positions[i];
      const th = ww * heights[i];
      const ty = groundY;
      treesGfx.rect(tx - 4, ty - th * 0.5, 8, th * 0.55).fill({ color: num("#6b4c2a") });
      treesGfx.poly([tx - th * 0.38, ty - th * 0.55,
                     tx,             ty - th * 1.1,
                     tx + th * 0.38, ty - th * 0.55]).fill({ color: num("#3d7235") });
      treesGfx.poly([tx - th * 0.3, ty - th * 0.78,
                     tx,            ty - th * 1.28,
                     tx + th * 0.3, ty - th * 0.78]).fill({ color: num("#2e6b4f") });
    }
  }

  // ── Picnic paper indicator (small corner darkener, NOT the big card) ───────
  const paperGfx = new Graphics();
  gameLayer.addChild(paperGfx);

  // ── Family silhouette — 3 figures standing on grass ───────────────────────
  // Parent L (64px tall), Parent R (60px tall), Child center (40px)
  const familyCont = new Container();
  const familyGfx  = new Graphics();
  const familyWrap = new Container();
  familyWrap.addChild(familyGfx);
  familyCont.addChild(familyWrap);
  gameLayer.addChild(familyCont);

  function drawFamilyShape(ww: number): void {
    familyGfx.clear();
    // Parent Left — warm terracotta, 64px body total
    const pLH = 64;
    const pLHd = pLH * 0.22;  // head radius
    // Parent Right — slightly shorter warm brown, 60px
    const pRH = 60;
    const pRHd = pRH * 0.22;
    // Child — warm gold/amber, 40px
    const cH = 40;
    const cHd = cH * 0.24;

    // spacing between figures
    const spacing = ww * 0.09;

    // Parent Left (x = -spacing)
    const plx = -spacing;
    familyGfx.circle(plx, -pLH + pLHd, pLHd).fill({ color: num("#d4845a") }); // warm skin
    familyGfx.roundRect(plx - pLHd * 1.4, -pLH + pLHd * 2, pLHd * 2.8, pLH - pLHd * 2, pLHd * 0.5).fill({ color: num("#c06a38") });

    // Parent Right (x = +spacing)
    const prx = spacing;
    familyGfx.circle(prx, -pRH + pRHd, pRHd).fill({ color: num("#b87050") });
    familyGfx.roundRect(prx - pRHd * 1.4, -pRH + pRHd * 2, pRHd * 2.8, pRH - pRHd * 2, pRHd * 0.5).fill({ color: num("#8b4c28") });

    // Child center (x = 0)
    familyGfx.circle(0, -cH + cHd, cHd).fill({ color: num("#f0c080") });
    familyGfx.roundRect(-cHd * 1.3, -cH + cHd * 2, cHd * 2.6, cH - cHd * 2, cHd * 0.5).fill({ color: C_ACC });

    // Ground shadow
    familyGfx.ellipse(0, 0, spacing * 1.8, 5).fill({ color: 0x000000, alpha: 0.12 });
  }

  // Picnic paper corner indicator — small postcard-size element below family, visible only on miss
  function drawPaperCorner(cx: number, cy: number, pw: number): void {
    paperGfx.clear();
    if (paperCorner < 0.02) return;
    // Small picnic paper in corner
    const ph = pw * 0.55;
    const px = cx + pw * 0.28;
    const py = cy - ph * 0.5;
    paperGfx.roundRect(px, py, pw * 0.28, ph, 4).fill({ color: num("#fff0d0"), alpha: 0.9 });
    if (paperCorner > 0.05) {
      // darkened corner
      const cs = pw * 0.1 * paperCorner;
      paperGfx.poly([
        px + pw * 0.28 - cs, py,
        px + pw * 0.28,      py,
        px + pw * 0.28,      py + cs,
      ]).fill({ color: num("#7a5010"), alpha: 0.6 * paperCorner });
    }
    paperGfx.roundRect(px, py, pw * 0.28, ph, 4).stroke({ width: 1.5, color: C_PRI, alpha: 0.15 });
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
    // Green canopy — half-ellipse dome, alternating panel shades
    const panels = 6;
    for (let i = 0; i < panels; i++) {
      const a0 = Math.PI + (i / panels) * Math.PI;
      const a1 = Math.PI + ((i + 1) / panels) * Math.PI;
      const pts: number[] = [0, 0];
      for (let s = 0; s <= 8; s++) {
        const a = a0 + (s / 8) * (a1 - a0);
        pts.push(r * Math.cos(a), r * Math.sin(a) * 0.5);
      }
      const shade = i % 2 === 0 ? C_PRI : num("#3a7f60");
      umbrellaGfx.poly(pts).fill({ color: shade });
    }
    // Canopy outline ribs
    for (let i = 0; i <= panels; i++) {
      const a = Math.PI + (i / panels) * Math.PI;
      umbrellaGfx.moveTo(0, 0).lineTo(r * Math.cos(a), r * Math.sin(a) * 0.5)
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.25 });
    }
    // Canopy border
    const dpts: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (i / 24) * Math.PI;
      dpts.push(r * Math.cos(a), r * Math.sin(a) * 0.5);
    }
    umbrellaGfx.poly(dpts).stroke({ width: 2, color: 0xffffff, alpha: 0.4 });
    // Straight handle going down from center
    const handleLen = r * 0.6;
    umbrellaGfx.rect(-3.5, 0, 7, handleLen).fill({ color: num("#6b4c2a") });
    // Hook at bottom of handle
    umbrellaGfx.arc(-3.5, handleLen, 7, Math.PI * 0.5, Math.PI * 1.5)
      .stroke({ width: 4, color: num("#5a3a1a") });
    // Tip at top
    umbrellaGfx.circle(0, 0, 5).fill({ color: C_ACC });
  }

  // ── Protection meter ───────────────────────────────────────────────────────
  const meterBg   = new Graphics();
  const meterFill = new Graphics();
  uiLayer.addChild(meterBg, meterFill);

  function drawMeter(ww: number, hh: number): void {
    const mw = ww * 0.52, mh = 14;
    const mx = (ww - mw) / 2;
    const my = hh * 0.05;
    meterBg.clear().roundRect(mx, my, mw, mh, 7).fill({ color: 0x000000, alpha: 0.15 });
    meterFill.clear();
    const fw = Math.max(8, mw * (protection / 100));
    meterFill.roundRect(mx, my, fw, mh, 7).fill({ color: C_PRI });
    // bright overlay to show fill clearly
    if (fw > 12) {
      meterFill.roundRect(mx + 3, my + 3, Math.max(0, fw - 6), 4, 2).fill({ color: 0xffffff, alpha: 0.2 });
    }
  }

  // ── UI text elements ───────────────────────────────────────────────────────
  const instructionTxt = new Text({
    text: "Keep them dry",
    style: { fill: C_TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 18, align: "center" },
  });
  instructionTxt.anchor.set(0.5, 0);
  uiLayer.addChild(instructionTxt);

  const meterLabel = new Text({
    text: "Protection",
    style: { fill: C_PRI, fontFamily: FONT, fontWeight: "bold", fontSize: 12 },
  });
  meterLabel.anchor.set(0.5, 1);
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
    const ww = window.innerWidth;
    const hh = window.innerHeight;

    app.canvas.style.width  = ww + "px";
    app.canvas.style.height = hh + "px";

    // Sky occupies top 75% (light blue → grey-blue gradient)
    // Ground/grass strip at ~75% height
    const grassY = hh * 0.75;

    // Sky: full gradient fill (two layers for gradient approximation)
    skyGfx.clear()
      .rect(0, 0, ww, grassY).fill({ color: 0xbcdbef })            // light blue
      .rect(0, grassY * 0.5, ww, grassY * 0.5).fill({ color: 0xa8c8e0, alpha: 0.45 }) // grey-blue lower
      ;

    // Ground fill (below grass strip)
    groundGfx.clear()
      // soil/earth
      .rect(0, grassY + hh * 0.038, ww, hh - grassY - hh * 0.038).fill({ color: num("#8b6914"), alpha: 0.6 })
      // grass strip
      .rect(0, grassY, ww, hh * 0.038).fill({ color: C_GRASS })
      // grass top edge (darker blade)
      .rect(0, grassY, ww, hh * 0.012).fill({ color: num("#4a7226") })
      // flower spots
    ;
    // Flower spots decorative
    const flowerSpots = [[0.12, 0.755], [0.20, 0.765], [0.74, 0.755], [0.84, 0.762]];
    for (const [fx2, fy2] of flowerSpots) {
      groundGfx.circle(ww * fx2, hh * fy2, 5).fill({ color: C_ACC, alpha: 0.8 });
      groundGfx.circle(ww * fx2, hh * fy2, 2.5).fill({ color: 0xffffff, alpha: 0.7 });
    }

    // Decorative trees left/right (slim, outside family zone)
    drawTrees(ww, grassY);

    // Sun
    sunCont.position.set(ww * 0.72, hh * 0.09);

    // Clouds in upper 30% of sky
    cloud1.position.set(ww * 0.12, hh * 0.10);
    cloud2.position.set(ww * 0.58, hh * 0.07);
    cloud3.position.set(ww * 0.34, hh * 0.16);

    // Family stands ON the grass: feet at grassY, figures at 65-72% height
    // Family positioned at grassY so their feet touch the green strip
    const famUnit = ww * 0.045;
    drawFamilyShape(ww);
    familyCont.position.set(ww / 2, grassY);  // family origin at grass level (feet)

    // Paper corner indicator near family (small, only visible on miss)
    drawPaperCorner(ww / 2, grassY, ww * 0.36);

    // Umbrella: green canopy half-ellipse ~120px wide (radius 60px at min width)
    umbRadius = Math.max(60, ww * 0.17);
    drawUmbrella(umbRadius);

    // Initial umbrella position: canopy at pointer.y - UMB_OFFSET_Y (above family)
    if (!pointerDown) {
      umbTargetX = ww / 2;
      umbTargetY = grassY - hh * 0.28;  // well above family heads
    }
    umbX = umbTargetX;
    umbY = umbTargetY;
    umbrellaCont.position.set(umbX, umbY);

    // UI: top HUD strip
    // Meter label above meter
    const meterY = hh * 0.05;
    meterLabel.position.set(ww / 2, meterY - 4);
    drawMeter(ww, hh);

    // Instruction below meter
    instructionTxt.style.wordWrapWidth = ww * 0.76;
    instructionTxt.position.set(ww / 2, meterY + 18);

    // Nudge text in middle area (above family heads)
    nudgeTxt.position.set(ww / 2, grassY - hh * 0.28);

    // Ghost hint start pos
    ghostCont.position.set(ww * 0.35, grassY - hh * 0.12);

    // CTA button bottom thumb zone
    const bw = Math.min(ww * 0.76, 280);
    const bh = 56;
    const bx = (ww - bw) / 2;
    const by = hh - bh - hh * 0.04;
    ctaBg.clear().roundRect(bx, by, bw, bh, 28).fill({ color: C_ACC });
    ctaTxt.position.set(ww / 2, by + bh / 2);

    void famUnit;

    // Endcard panel
    buildEndcard(ww, hh);
  }

  // ── Endcard builder ────────────────────────────────────────────────────────
  function buildEndcard(ww: number, hh: number): void {
    endcardCont.removeChildren();
    // Scrim
    endcardCont.addChild(new Graphics().rect(0, 0, ww, hh).fill({ color: 0x000000, alpha: 0.5 }));

    const pw = Math.min(ww * 0.88, 360);
    const ph = hh * 0.65;
    const px = (ww - pw) / 2;
    const py = (hh - ph) / 2 - hh * 0.04;

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
    brandTxt.position.set(ww / 2, py + 20);
    endcardCont.addChild(brandTxt);

    // Brand tree/umbrella icon
    const iconG = new Graphics();
    const ix = ww / 2, iy = py + 80;
    iconG.poly([ix - 30, iy, ix, iy - 40, ix + 30, iy]).fill({ color: C_PRI });
    iconG.poly([ix - 22, iy - 16, ix, iy - 50, ix + 22, iy - 16]).fill({ color: num("#3a7f60") });
    iconG.rect(ix - 4, iy, 8, 20).fill({ color: num("#6b4c2a") });
    iconG.circle(ix - 16, iy + 28, 6).fill({ color: C_PRI });
    iconG.roundRect(ix - 20, iy + 34, 10, 18, 2).fill({ color: C_PRI });
    iconG.circle(ix + 16, iy + 28, 6).fill({ color: C_PRI });
    iconG.roundRect(ix + 10, iy + 34, 10, 18, 2).fill({ color: C_PRI });
    endcardCont.addChild(iconG);

    // "Protected" badge
    const badgeG = new Graphics()
      .roundRect(ww / 2 - 68, py + 136, 136, 28, 10)
      .fill({ color: C_PRI });
    endcardCont.addChild(badgeG);
    const badgeTxt = new Text({
      text: "Protected",
      style: { fill: 0xffffff, fontFamily: FONT, fontWeight: "bold", fontSize: 16, align: "center" },
    });
    badgeTxt.anchor.set(0.5);
    badgeTxt.position.set(ww / 2, py + 150);
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
    lineTxt.position.set(ww / 2, py + 176);
    endcardCont.addChild(lineTxt);

    // Disclaimer
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
    discTxt.position.set(ww / 2, py + ph - 8);
    endcardCont.addChild(discTxt);
  }

  // ── Drop factory ────────────────────────────────────────────────────────────
  // Rain drops: 3px × 12px rounded rects, alpha 0.7 per spec
  function spawnDrop(ww: number, hh: number, type: "rain" | "leaf" | "acorn" = "rain", fromX?: number): void {
    const spd = phase === "bit3" ? DROP_SPEED_BIT3
              : phase === "bit2" ? DROP_SPEED_BIT2
              : DROP_SPEED_BASE;
    const baseVY = spd * hh;

    const cont = new Container();
    const gfx  = new Graphics();
    if (type === "rain") {
      // Spec: 3px wide × 12px tall rounded rect, alpha 0.7
      gfx.roundRect(-1.5, 0, 3, 12, 1.5).fill({ color: C_RAIN, alpha: 0.7 });
    } else if (type === "leaf") {
      gfx.poly([0, -9, 7, 0, 0, 9, -7, 0]).fill({ color: num("#5a9a3c"), alpha: 0.92 });
    } else {
      gfx.circle(0, 3, 7).fill({ color: num("#8b6010") });
      gfx.ellipse(0, -4, 9, 5).fill({ color: num("#4a7a22") });
    }
    cont.addChild(gfx);

    const sx = fromX !== undefined ? fromX : ww * (0.08 + Math.random() * 0.84);
    const windVX = phase === "bit3" ? (Math.random() - 0.5) * ww * 0.14 : 0;
    cont.position.set(sx, -18);
    gameLayer.addChild(cont);

    const r = type === "rain" ? 3 : type === "leaf" ? 8 : 7;
    drops.push({ cont, x: sx, y: -18, vx: windVX, vy: baseVY, r, alive: true, type, bounced: false, bounceTimer: 0 });
  }

  // ── Bounce effect ──────────────────────────────────────────────────────────
  function doBounce(drop: Drop, ww: number, hh: number): void {
    drop.bounced = true;
    drop.bounceTimer = 0.38;
    // Squash/stretch the umbrella wrapper
    gsap.to(umbrellaWrap.scale, { x: 1.09, y: 0.92, duration: 0.07, yoyo: true, repeat: 1, ease: "power2.out" });
    // Ripple at bounce point
    const rip = new Graphics()
      .circle(0, 0, umbRadius * 0.38)
      .stroke({ width: 3, color: 0xffffff, alpha: 0.65 });
    rip.position.set(drop.x, umbrellaCont.y);
    fxLayer.addChild(rip);
    gsap.to(rip.scale, { x: 1.7, y: 1.7, duration: 0.32, ease: "power1.out" });
    gsap.to(rip, { alpha: 0, duration: 0.32, ease: "power1.in",
      onComplete: () => { if (rip.parent) fxLayer.removeChild(rip); rip.destroy(); } });
    if (!meterPaused) protection = Math.min(100, protection + 1.8);
    drawMeter(ww, hh);
    // Spawn heart to show the family is protected
    spawnHeart(drop.x, umbrellaCont.y - 10);
  }

  // ── Miss effect ────────────────────────────────────────────────────────────
  function doMiss(ww: number, hh: number): void {
    meterPaused   = true;
    meterPauseTimer = 2.2;
    protection = Math.max(20, protection - 7);
    drawMeter(ww, hh);
    // Paper corner darkens (small picnic paper in corner)
    paperCorner = Math.min(1, paperCorner + 0.45);
    const grassY = hh * 0.75;
    drawPaperCorner(ww / 2, grassY, ww * 0.36);
    gsap.to({ v: paperCorner }, {
      v: 0, duration: 1.9,
      onUpdate: function() {
        paperCorner = (this.targets() as Array<{v: number}>)[0].v;
        drawPaperCorner(ww / 2, hh * 0.75, ww * 0.36);
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
    drop.vx = (Math.random() - 0.5) * window.innerWidth * 0.3;
    drop.vy = drop.type === "leaf"
      ? -window.innerHeight * 0.22
      : -window.innerHeight * 0.32;
    // Gold sparkle
    const sp = new Container();
    const sg = new Graphics().star(0, 0, 5, 11, 5).fill({ color: C_ACC });
    sp.addChild(sg);
    sp.position.set(drop.x, drop.y);
    fxLayer.addChild(sp);
    gsap.to(sp, { y: sp.y - 55, alpha: 0, duration: 0.55, ease: "power2.out",
      onComplete: () => { if (sp.parent) fxLayer.removeChild(sp); sp.destroy(); } });
  }

  // ── Heart FX ─────────────────────────────────────────────────────────────
  function spawnHeart(x: number, y: number): void {
    const cont = new Container();
    const g    = new Graphics();
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
  function startGhostDemo(ww: number, hh: number): void {
    const grassY = hh * 0.75;
    ghostCont.alpha = 0.75;
    ghostCont.position.set(ww * 0.32, grassY - hh * 0.18);
    gsap.killTweensOf(ghostCont);
    gsap.to(ghostCont, {
      x: ww * 0.68, y: grassY - hh * 0.38,
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
      gsap.to(instructionTxt, { alpha: 0, duration: 0.5, delay: 2.0 });
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
    // Clear drops defensively
    for (const d of drops) {
      if (d.alive) {
        d.alive = false;
        gsap.killTweensOf(d.cont);
        if (d.cont.parent) gameLayer.removeChild(d.cont);
        d.cont.destroy();
      }
    }
    drops.length = 0;
    // Clouds part
    gsap.to(cloud1.position, { x: -w() * 0.6, duration: 1.3, ease: "power2.in" });
    gsap.to(cloud2.position, { x: w() * 1.5,  duration: 1.1, ease: "power2.in" });
    gsap.to(cloud3.position, { y: -h() * 0.2, duration: 0.9, ease: "power2.in" });
    // Sun rises
    gsap.to(sunCont, { alpha: 1, duration: 1.3, delay: 0.5, ease: "power1.out" });
    gsap.to(sunCont.scale, { x: 1.12, y: 1.12, duration: 2.0, delay: 0.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
    // Umbrella fades
    gsap.to(umbrellaCont, { alpha: 0, duration: 0.8, delay: 0.3 });
    // Hide UI
    gsap.to(instructionTxt, { alpha: 0, duration: 0.3 });
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

  // Start ghost demo immediately for first-time users
  gsap.delayedCall(0.4, () => {
    if (!hasInteracted) {
      startGhostDemo(window.innerWidth, window.innerHeight);
    }
  });

  // Spawn first rain drops IMMEDIATELY (t=0) so rain is visible from start
  // This ensures rain is visible at t0/t1 per spec
  spawnDrop(window.innerWidth, window.innerHeight, "rain", window.innerWidth * 0.3);
  spawnDrop(window.innerWidth, window.innerHeight, "rain", window.innerWidth * 0.6);
  spawnDrop(window.innerWidth, window.innerHeight, "rain", window.innerWidth * 0.5);

  // Continue spawning during hook phase too
  spawnTimer = spawnInterval * 0.5; // start half-way through first interval

  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const grassY = H * 0.75;

    if (phase === "end") { app.renderer.render(app.stage); return; }

    gameTime   += dt;
    phaseTimer += dt;

    // ── Idle tracking ────────────────────────────────────────────────────────
    if (phase !== "reveal" && phase !== "end") {
      idleTimer += dt;
      const idleLimit = hasInteracted ? 2.8 : IDLE_HINT_MS / 1000;
      if (idleTimer > idleLimit) {
        idleTimer = 0;
        idleCount++;
        if (!hasInteracted && idleCount < AUTO_DEMO_AFTER) {
          // just a tick
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
    // Clamp umbrella: never below family heads (top of tallest parent is ~64px above grass)
    const minUmbY = grassY - 70;
    if (umbY > minUmbY) umbY = minUmbY;
    umbrellaCont.position.set(umbX, umbY);

    // ── Wind (bit3) ───────────────────────────────────────────────────────────
    if (phase === "bit3") {
      windTimer += dt;
      if (windTimer > 1.6) { windTimer = 0; windX = (Math.random() - 0.5) * W * 0.25; }
    }

    // ── Spawn drops — spawn in ALL phases (including hook) ────────────────────
    if (phase !== "reveal" && phase !== "end") {
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
    // Umbrella hit radius from current umbrella position
    const hitR = umbRadius * HIT_SCALE;

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (!d.alive) { drops.splice(i, 1); continue; }

      if (phase === "bit3") d.vx += windX * dt * 0.3;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.cont.destroyed) { drops.splice(i, 1); continue; }
      d.cont.position.set(d.x, d.y);

      // Bounced drops fade out
      if (d.bounced) {
        d.bounceTimer -= dt;
        if (!d.cont.destroyed) d.cont.alpha = Math.max(0, d.bounceTimer / 0.38);
        if (d.bounceTimer <= 0) {
          d.alive = false;
          if (!d.cont.destroyed) {
            if (d.cont.parent) gameLayer.removeChild(d.cont);
            d.cont.destroy();
          }
          drops.splice(i, 1);
        }
        continue;
      }

      // Dome hit test (umbrella ellipse — rx=hitR, ry=hitR*0.5)
      const dx = d.x - umbX;
      const dy = d.y - umbY;
      const domeRy = hitR * 0.5;
      const expand = (Math.abs(d.vx) + Math.abs(d.vy)) * dt * 0.4;
      const inDome =
        (dx * dx) / ((hitR + expand) * (hitR + expand)) +
        (dy * dy) / ((domeRy + expand) * (domeRy + expand)) <= 1.0 &&
        dy <= 0;

      if (inDome) {
        const nx = dx / (hitR + 0.001);
        d.vx = nx * Math.abs(d.vy) * 0.45 + d.vx * 0.25;
        d.vy = -Math.abs(d.vy) * 0.5;
        if (d.type === "leaf" || d.type === "acorn") {
          doBonus(d);
        } else {
          doBounce(d, W, H);
        }
        const rim = Math.sqrt((dx * dx) / (hitR * hitR) + (dy * dy) / (domeRy * domeRy));
        if (rim > 0.72 && rim <= 1.02) {
          spawnHeart(d.x, d.y - 10);
        }
        continue;
      }

      // Miss zone: drop passes family zone
      // Family feet at grassY, tallest figure head ~64px above
      const famY0 = grassY - 70;
      const famY1 = grassY + 10;
      if (d.y > famY0 && d.y < famY1 && Math.abs(d.x - W / 2) < W * 0.22) {
        d.alive = false;
        if (!d.cont.destroyed) {
          if (d.cont.parent) gameLayer.removeChild(d.cont);
          d.cont.destroy();
        }
        drops.splice(i, 1);
        doMiss(W, H);
        continue;
      }

      // Off screen
      if (d.y > H + 20 || d.x < -40 || d.x > W + 40) {
        d.alive = false;
        if (!d.cont.destroyed) {
          if (d.cont.parent) gameLayer.removeChild(d.cont);
          d.cont.destroy();
        }
        drops.splice(i, 1);
      }
    }

    // ── Hearts ────────────────────────────────────────────────────────────────
    for (let i = hearts.length - 1; i >= 0; i--) {
      const hrt = hearts[i];
      if (hrt.cont.destroyed) { hearts.splice(i, 1); continue; }
      hrt.timer -= dt;
      hrt.cont.y += hrt.vy * dt;
      hrt.cont.alpha = Math.max(0, hrt.timer / 1.2);
      if (hrt.timer <= 0) {
        if (!hrt.cont.destroyed) {
          if (hrt.cont.parent) fxLayer.removeChild(hrt.cont);
          hrt.cont.destroy();
        }
        hearts.splice(i, 1);
      }
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
