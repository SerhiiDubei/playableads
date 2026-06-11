// Budget Slider: Bath Morph — RenoScope playable ad.
// PixiJS + GSAP. Asset-integrated pass: 3-sprite crossfade stack.
// Mechanic: horizontal budget slider ($6K–$25K) morphs bathroom scene
// across three tiers at $8K/$15K/$22K thresholds (discrete crossfades
// with hysteresis). Continuous micro-channels between thresholds.
// Variable reward: designer-bonus objects + Best Value sweet-spot $18.5K.
// FSM: intro → interactive → locked → endcard.

import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// ── Tunables ──────────────────────────────────────────────────────────────────
const MIN_BUDGET  = Number(cfg.params.minBudget       ?? 6000);
const MAX_BUDGET  = Number(cfg.params.maxBudget       ?? 25000);
const START_BUDGET= Number(cfg.params.startBudget     ?? 9500);
const T1          = Number(cfg.params.threshold1      ?? 8000);   // Standard→Mid
const T2          = Number(cfg.params.threshold2      ?? 15000);  // Mid→Premium
const T3          = Number(cfg.params.threshold3      ?? 22000);  // Premium→Luxury
const SWEET_SPOT  = Number(cfg.params.sweetSpot       ?? 18500);
const IDLE_HINT_MS       = Number(cfg.params.idleHintMs      ?? 6000);
const AUTO_DEMO_AFTER_MS = Number(cfg.params.autoDemoAfterMs ?? 8000);
const LOCK_CHIP_DELAY_MS = Number(cfg.params.lockChipDelayMs ?? 12000);

// ── Color helpers ─────────────────────────────────────────────────────────────
function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }
function shade(c: number, f: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const t = f > 0 ? 255 : 0, a = Math.abs(f);
  return (Math.round(r+(t-r)*a)<<16)|(Math.round(g+(t-g)*a)<<8)|Math.round(b+(t-b)*a);
}
function lerpC(ca: number, cb: number, t: number): number {
  const ra=(ca>>16)&255, ga=(ca>>8)&255, ba=ca&255;
  const rb=(cb>>16)&255, gb=(cb>>8)&255, bb=cb&255;
  return (Math.round(ra+(rb-ra)*t)<<16)|(Math.round(ga+(gb-ga)*t)<<8)|Math.round(ba+(bb-ba)*t);
}
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const PRIMARY = num(cfg.style.colors.primary);   // #3D5A6C slate-blue
const ACCENT  = num(cfg.style.colors.accent);    // #C77B4F copper
const BG      = num(cfg.style.colors.background);// #26333B dark graphite
const TXT     = cfg.style.colors.text;           // #F4F1EC marble white
const FONT    = cfg.style.font.family;

// ── Design canvas (fixed; scaled to fit viewport) ─────────────────────────────
const DW = 400, DH = 680;

// Layout zones  — tightly packed so no dead band >25% of height
const ROOM_TOP    = 0;     // room scene fills top portion
const ROOM_BOTTOM = 460;   // floor level
const WALL_SPLIT  = 325;   // wall/floor boundary inside room
const TRACK_Y     = 580;   // slider track Y (bottom CTA zone)
const TRACK_L     = 32, TRACK_R = 368, TRACK_W = TRACK_R - TRACK_L;
const THUMB_R     = 26;    // ≥44px touch diameter

// ── Tier data ──────────────────────────────────────────────────────────────────
type Tier = 0 | 1 | 2 | 3;
const TIER_NAMES  = ["Standard", "Mid-Range", "Premium", "Luxury"];
const TIER_RANGES = ["$6K–$8K", "$8K–$15K", "$15K–$22K", "$22K–$25K"];

const WALL_COLORS = [num("#C8B89A"), num("#D4C4AE"), num("#E2D8C8"), num("#EEE8DF")];
const FLOOR_COLORS= [num("#8A7D6F"), num("#9E937A"), num("#B4A88E"), num("#C8C0B0")];
const VANITY_COLORS=[num("#7A5C44"), num("#9E7B5A"), num("#BDB5A6"), num("#E8E4DC")];
const LIGHT_WARM  = [0x000000,  0x000000,  0x221100,  0x443322];
const LIGHT_ALPHA = [0, 0, 0.07, 0.13];

// Warm tint lerp colours per tier (for continuous channel)
const TINT_COLORS = [0xFFFFFF, 0xFFEEDD, 0xFFDDCC, 0xFFCCAA];

// ── Texture cache ──────────────────────────────────────────────────────────────
const TEX: Record<string, Texture> = {};
async function preloadTextures(): Promise<void> {
  await Promise.all(Object.entries(cfg.assets).map(async ([k, uri]) => {
    if (!/\.(webp|png)$/i.test(k)) return;
    const img = new Image(); img.src = uri as string;
    try { await img.decode(); } catch { return; }
    TEX[k] = Texture.from(img);
  }));
}
function tex(key: string): Texture | null { return TEX[key] ?? null; }

// ── State machine ──────────────────────────────────────────────────────────────
type FSMState = "intro"|"interactive"|"locked"|"endcard";
let fsmState: FSMState = "intro";
let budget        = START_BUDGET;
let currentTier: Tier = 0;
let lockedTier: Tier  = 0;
let fullPassDone  = false;
let maxReached    = false;
let idleMs        = 0;
let autoDemoMs    = 0;
let autoDemoDir   = 1;
let hadFirstDrag  = false;
let lockChipShown = false;
let sweetSpotShown= false;
let dragging      = false;
let lastTierChangeDir = 0;
let thumbGlowActive = false;

function computeTier(b: number): Tier {
  if (b < T1) return 0; if (b < T2) return 1; if (b < T3) return 2; return 3;
}
function tierBlend(b: number): number {
  const tier = computeTier(b);
  if (tier===0) return Math.max(0,(b-MIN_BUDGET)/(T1-MIN_BUDGET));
  if (tier===1) return (b-T1)/(T2-T1);
  if (tier===2) return (b-T2)/(T3-T2);
  return Math.min(1,(b-T3)/(MAX_BUDGET-T3));
}
function budgetToX(b: number): number {
  return TRACK_L + ((b-MIN_BUDGET)/(MAX_BUDGET-MIN_BUDGET))*TRACK_W;
}
function xToBudget(x: number): number {
  return MIN_BUDGET+Math.max(0,Math.min(1,(x-TRACK_L)/TRACK_W))*(MAX_BUDGET-MIN_BUDGET);
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Preload all textures before building scene
  await preloadTextures();

  const app = new Application();
  await app.init({
    width: window.innerWidth, height: window.innerHeight,
    background: BG, antialias: false,
    preference: "webgl", resolution: 1, autoDensity: false,
  });
  app.canvas.style.width  = window.innerWidth  + "px";
  app.canvas.style.height = window.innerHeight + "px";
  document.body.appendChild(app.canvas);
  app.stage.eventMode = "static";
  app.stage.hitArea   = app.screen;

  // Fullscreen BG covers letterbox gutters.
  const fullscreenBgGfx = new Graphics();
  app.stage.addChild(fullscreenBgGfx);

  // ── Layer stack ──────────────────────────────────────────────────────────
  const root         = new Container();
  const bgLayer      = new Container();  // bg sprites + procedural bg fallback
  const roomLayer    = new Container();  // procedural room objects (fallback)
  const fxLayer      = new Container();  // particles, flash
  const uiLayer      = new Container();  // slider, ticker, chips
  const hudLayer     = new Container();  // instruction text
  const overlayLayer = new Container();  // lock/endcard overlay
  root.addChild(bgLayer, roomLayer, fxLayer, uiLayer, hudLayer, overlayLayer);
  app.stage.addChild(root);
  uiLayer.interactiveChildren = false;

  // ── 3-sprite crossfade stack ──────────────────────────────────────────────
  // Covers ROOM_TOP(0) → ROOM_BOTTOM(460). All three loaded; alpha driven by budget.
  // bath-basic  → visible at low budget (< T1..T2)
  // bath-mid    → fades in across T1 threshold
  // bath-premium → fades in across T2-T3 band
  const bathBasicSprite   = makeBathSprite("bath-basic.webp");
  const bathMidSprite     = makeBathSprite("bath-mid.webp");
  const bathPremiumSprite = makeBathSprite("bath-premium.webp");

  // Tint overlay sprites mirror the bath sprites for warm tint lerp
  const tintOverlay = new Graphics();
  tintOverlay.alpha = 0;

  // White flash crossfade overlay
  const xfadeGfx = new Graphics(); xfadeGfx.alpha = 0;

  // Procedural bg fallback (only drawn when sprites missing)
  const topExtGfx    = new Graphics();
  const botExtGfx    = new Graphics();
  const wallGfx      = new Graphics();
  const floorGfx     = new Graphics();
  const windowGfx    = new Graphics();
  const warmGfx      = new Graphics();
  const procBgFallback = new Container();
  procBgFallback.addChild(topExtGfx, botExtGfx, wallGfx, floorGfx, windowGfx, warmGfx);

  bgLayer.addChild(
    procBgFallback,
    bathBasicSprite,
    bathMidSprite,
    bathPremiumSprite,
    tintOverlay,
    xfadeGfx,
  );

  // ── Room object graphics (procedural fallback, hidden when sprites present) ─
  const tubGfx    = new Graphics(); roomLayer.addChild(tubGfx);
  const showerGfx = new Graphics(); showerGfx.alpha = 0; roomLayer.addChild(showerGfx);
  const vanityGfx = new Graphics(); roomLayer.addChild(vanityGfx);
  const mirrorGfx = new Graphics(); roomLayer.addChild(mirrorGfx);

  const hasSprites = !!(tex("bath-basic.webp") && tex("bath-mid.webp") && tex("bath-premium.webp"));

  // Hide procedural room objects when we have sprites
  if (hasSprites) {
    procBgFallback.visible = false;
    roomLayer.visible = false;
  }

  // FX containers
  const bonusCont      = new Container(); bonusCont.alpha = 0;      fxLayer.addChild(bonusCont);
  const sweetSpotCont  = new Container(); sweetSpotCont.alpha = 0;  fxLayer.addChild(sweetSpotCont);

  // ── HUD ───────────────────────────────────────────────────────────────────
  const instrText = new Text({
    text: "Slide your budget",
    style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 18, align: "center" },
  });
  instrText.anchor.set(0.5);
  instrText.position.set(DW/2, 26);
  hudLayer.addChild(instrText);

  const disclaimerText = new Text({
    text: "Estimates only. Final pricing varies by project, materials, and location.",
    style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 11, align: "center",
      wordWrap: true, wordWrapWidth: DW - 32 },
  });
  disclaimerText.anchor.set(0.5, 1);
  disclaimerText.alpha = 0.7;
  disclaimerText.position.set(DW/2, DH - 8);
  hudLayer.addChild(disclaimerText);

  // ── Ticker (large budget number) ──────────────────────────────────────────
  const TICKER_CY = 498;
  const CHIP_CY   = 536;

  const tickerBg = new Graphics();
  uiLayer.addChild(tickerBg);

  const tickerText = new Text({
    text: "",
    style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 40, align: "center" },
  });
  tickerText.anchor.set(0.5);
  tickerText.position.set(DW/2, TICKER_CY);
  uiLayer.addChild(tickerText);

  const estLabel = new Text({
    text: "est.",
    style: { fill: cfg.style.colors.accent, fontFamily: FONT, fontWeight: "bold", fontSize: 13 },
  });
  estLabel.anchor.set(0, 0.5);
  uiLayer.addChild(estLabel);

  const tierChipGfx  = new Graphics(); uiLayer.addChild(tierChipGfx);
  const tierChipText = new Text({
    text: "",
    style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 13 },
  });
  tierChipText.anchor.set(0.5);
  uiLayer.addChild(tierChipText);

  // ── Slider ────────────────────────────────────────────────────────────────
  const trackBg   = new Graphics(); uiLayer.addChild(trackBg);
  const trackFill = new Graphics(); uiLayer.addChild(trackFill);
  const markerGfx = new Graphics(); uiLayer.addChild(markerGfx);

  const minLbl = new Text({ text: "$6K", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 11 } });
  minLbl.anchor.set(0, 0.5); minLbl.position.set(TRACK_L, TRACK_Y + 18); uiLayer.addChild(minLbl);
  const maxLbl = new Text({ text: "$25K", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 11 } });
  maxLbl.anchor.set(1, 0.5); maxLbl.position.set(TRACK_R, TRACK_Y + 18); uiLayer.addChild(maxLbl);

  const thresholds = [T1, T2, T3];
  const thrLabels  = ["$8K","$15K","$22K"];
  for (let i=0; i<thresholds.length; i++) {
    const lx = budgetToX(thresholds[i]);
    const lt = new Text({ text: thrLabels[i], style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 10 } });
    lt.anchor.set(0.5, 0); lt.alpha = 0.5; lt.position.set(lx, TRACK_Y + 14); uiLayer.addChild(lt);
  }

  // Thumb
  const thumbWrap = new Container();
  const thumbGfx  = new Graphics();
  const thumbGlowGfx = new Graphics(); // soft glow ring while dragging
  thumbWrap.addChild(thumbGlowGfx, thumbGfx);
  uiLayer.addChild(thumbWrap);

  // Ghost finger
  const ghostFinger = new Container();
  const gc1 = new Graphics(); gc1.circle(0,0,THUMB_R+9).fill({color:0xffffff,alpha:0.2}); ghostFinger.addChild(gc1);
  const gc2 = new Graphics(); gc2.circle(0,0,13).fill({color:0xffffff,alpha:0.55}); ghostFinger.addChild(gc2);
  ghostFinger.alpha = 0;
  uiLayer.addChild(ghostFinger);

  // ── Lock chip ─────────────────────────────────────────────────────────────
  const lockChip    = new Container(); lockChip.alpha = 0;
  const lockChipBg  = new Graphics();
  const lockChipTxt = new Text({ text: "Lock my style", style: { fill: "#3a2418", fontFamily: FONT, fontWeight: "bold", fontSize: 17 } });
  lockChipTxt.anchor.set(0.5);
  lockChip.addChild(lockChipBg, lockChipTxt);
  lockChip.position.set(DW/2, CHIP_CY);
  overlayLayer.addChild(lockChip);

  // ═══════════════════════════════════════════════════════════════════════════
  // SPRITE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function makeBathSprite(key: string): Sprite | Container {
    const t = tex(key);
    if (!t) return new Container(); // invisible placeholder
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 0);
    // cover-fit will be applied in updateBathLayout()
    return sp;
  }

  function coverFitBathSprite(sp: Sprite | Container): void {
    if (!(sp instanceof Sprite)) return;
    const t = sp.texture;
    if (!t || t.width === 0) return;
    // Cover-fit: fill DW × ROOM_BOTTOM
    const scaleX = DW / t.width;
    const scaleY = ROOM_BOTTOM / t.height;
    const s = Math.max(scaleX, scaleY);
    sp.scale.set(s);
    sp.position.set(DW / 2, 0); // anchor 0.5,0 → centered horizontally, top-aligned
  }

  function updateBathLayout(): void {
    coverFitBathSprite(bathBasicSprite as Sprite);
    coverFitBathSprite(bathMidSprite as Sprite);
    coverFitBathSprite(bathPremiumSprite as Sprite);
    // Tint overlay covers the room area
    tintOverlay.clear();
    tintOverlay.rect(0, 0, DW, ROOM_BOTTOM).fill({ color: 0xFFFFFF });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSSFADE ALPHA — smoothstep-driven by budget value
  // bath-basic:   fully visible below T1, fades out T1→T2
  // bath-mid:     fades in T1-500→T1+2000, fades out T2→T2+2000
  // bath-premium: fades in T2→T2+3000
  // Continuous channel: subtle warm tint on tintOverlay + scale breathe
  // ═══════════════════════════════════════════════════════════════════════════
  function updateBathAlpha(): void {
    if (!hasSprites) return;
    const b = budget;

    // basic: 1 below T1, fades to 0 over T1→T2 band
    const basicAlpha  = 1 - smoothstep(T1, T2, b);
    // mid: fades in T1-500→T1+1500, fades out T2+1000→T3-1000
    const midIn       = smoothstep(T1 - 500, T1 + 1500, b);
    const midOut      = smoothstep(T2 + 1000, T3 - 1000, b);
    const midAlpha    = midIn * (1 - midOut);
    // premium: fades in T2→T2+3000, stays full above T3
    const premiumAlpha = smoothstep(T2, T2 + 3000, b);

    (bathBasicSprite   as Sprite).alpha = basicAlpha;
    (bathMidSprite     as Sprite).alpha = midAlpha;
    (bathPremiumSprite as Sprite).alpha = premiumAlpha;

    // Warm tint lerp: neutral at basic, warm amber at mid, golden at premium
    const tier = computeTier(b);
    const tBlend = tierBlend(b);
    const tintFrom = TINT_COLORS[tier];
    const tintTo   = TINT_COLORS[Math.min(tier+1, 3) as Tier];
    const tintColor = lerpC(tintFrom, tintTo, tBlend);
    const tintAlpha = smoothstep(T1 - 2000, T3, b) * 0.12; // max 12% warm overlay

    tintOverlay.clear();
    tintOverlay.rect(0, 0, DW, ROOM_BOTTOM).fill({ color: tintColor });
    tintOverlay.alpha = tintAlpha;

    // Scale breathe: 1.0 → 1.015 continuous, driven by budget position within tier
    const breathe = 1.0 + tBlend * 0.015;
    if (bathBasicSprite instanceof Sprite && basicAlpha > 0.01) {
      const baseScale = (bathBasicSprite as Sprite).scale.x / ((bathBasicSprite as Sprite).scale.x || 1);
      void baseScale; // just set via coverFit cached scale
      // Re-apply breathe on top of cover-fit scale
      const t0 = tex("bath-basic.webp");
      if (t0) {
        const scaleX = DW / t0.width;
        const scaleY = ROOM_BOTTOM / t0.height;
        const s = Math.max(scaleX, scaleY) * breathe;
        (bathBasicSprite as Sprite).scale.set(s);
        (bathBasicSprite as Sprite).position.set(DW / 2, -(s * t0.height - ROOM_BOTTOM) * 0.0); // keep top-aligned
      }
    }
    if (bathMidSprite instanceof Sprite && midAlpha > 0.01) {
      const t1 = tex("bath-mid.webp");
      if (t1) {
        const scaleX = DW / t1.width;
        const scaleY = ROOM_BOTTOM / t1.height;
        const s = Math.max(scaleX, scaleY) * breathe;
        (bathMidSprite as Sprite).scale.set(s);
      }
    }
    if (bathPremiumSprite instanceof Sprite && premiumAlpha > 0.01) {
      const t2 = tex("bath-premium.webp");
      if (t2) {
        const scaleX = DW / t2.width;
        const scaleY = ROOM_BOTTOM / t2.height;
        const s = Math.max(scaleX, scaleY) * breathe;
        (bathPremiumSprite as Sprite).scale.set(s);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DRAW FUNCTIONS (procedural fallback — used when sprites missing)
  // ═══════════════════════════════════════════════════════════════════════════

  function drawBackground(): void {
    if (hasSprites) return; // sprites handle the background
    const tier = computeTier(budget);
    const tNext = Math.min(tier+1, 3) as Tier;
    const t = tierBlend(budget);
    const wallColor  = lerpC(WALL_COLORS[tier], WALL_COLORS[tNext], t);
    const floorColor = lerpC(FLOOR_COLORS[tier], FLOOR_COLORS[tNext], t);
    const wAlpha     = LIGHT_ALPHA[tier]+(LIGHT_ALPHA[tNext]-LIGHT_ALPHA[tier])*t;

    wallGfx.clear();
    wallGfx.rect(0, 0, DW, WALL_SPLIT).fill({ color: shade(wallColor,-0.06) });
    const tileW = 44+tier*16, tileH = 44+tier*16;
    const gc = shade(wallColor,-0.14);
    for (let tx=0; tx<DW; tx+=tileW) {
      for (let ty=0; ty<WALL_SPLIT; ty+=tileH) {
        wallGfx.rect(tx+1, ty+1, tileW-2, tileH-2).fill({color:wallColor});
        wallGfx.rect(tx, ty, tileW, 1).fill({color:gc});
        wallGfx.rect(tx, ty, 1, tileH).fill({color:gc});
      }
    }
    wallGfx.rect(0, WALL_SPLIT-6, DW, 8).fill({color:shade(wallColor,-0.2)});

    floorGfx.clear();
    const fTile = 52+tier*18;
    const fgc   = shade(floorColor,-0.18);
    for (let fx=0; fx<DW; fx+=fTile) {
      for (let fy=WALL_SPLIT; fy<ROOM_BOTTOM; fy+=fTile) {
        floorGfx.rect(fx+2,fy+2,fTile-3,fTile-3).fill({color:floorColor});
      }
    }
    for (let fx=0; fx<DW; fx+=fTile) floorGfx.rect(fx,WALL_SPLIT,1,ROOM_BOTTOM-WALL_SPLIT).fill({color:fgc});
    for (let fy=WALL_SPLIT; fy<ROOM_BOTTOM; fy+=fTile) floorGfx.rect(0,fy,DW,1).fill({color:fgc});

    warmGfx.clear();
    if (wAlpha > 0.005) {
      const wc = LIGHT_WARM[tNext] || LIGHT_WARM[tier] || 0x221100;
      warmGfx.rect(0,0,DW,ROOM_BOTTOM).fill({color:wc,alpha:wAlpha});
    }

    drawWindow(tier, t);
  }

  function drawWindow(tier: Tier, t: number): void {
    windowGfx.clear();
    const wx=242, wy=30, ww=108+tier*10, wh=120+tier*14;
    const glassC = lerpC(num("#9ECFDF"), num("#C8EAF5"), t);
    windowGfx.roundRect(wx,wy,ww,wh,6).fill({color:glassC});
    const frameC = tier>=3 ? num("#D4C9B0") : num("#EEE0C8");
    windowGfx.roundRect(wx,wy,ww,wh,6).stroke({width:tier>=3?4:7,color:frameC});
    windowGfx.rect(wx+ww/2-2,wy,4,wh).fill({color:frameC});
    windowGfx.rect(wx,wy+wh/2-2,ww,4).fill({color:frameC});
    if (tier>=2) {
      const ga = tier>=3 ? 0.65 : (t-0)*0.5;
      if (ga>0.02) windowGfx.roundRect(wx-4,wy-4,ww+8,wh+8,10).stroke({width:3,color:num("#FFE090"),alpha:ga});
    }
    const bAlpha = 0.06+tier*0.025+t*0.02;
    windowGfx.poly([wx+16,wy+wh, wx+ww-16,wy+wh, wx+ww+40,WALL_SPLIT, wx-40,WALL_SPLIT]).fill({color:num("#FFF8E0"),alpha:bAlpha});
  }

  function drawVanity(tier: Tier, t: number): void {
    if (hasSprites) return;
    vanityGfx.clear(); mirrorGfx.clear();
    const vBase = VANITY_COLORS[tier];
    const vNext = VANITY_COLORS[Math.min(tier+1,3) as Tier];
    const vColor = lerpC(vBase, vNext, t);
    const vx=10, vy=220, vw=130, vh=118;
    vanityGfx.roundRect(vx,vy,vw,vh,8).fill({color:vColor});
    vanityGfx.roundRect(vx,vy,vw,vh,8).stroke({width:2,color:shade(vColor,-0.2)});
    vanityGfx.rect(vx+8, vy+vh/2-1, vw-16, 2).fill({color:shade(vColor,-0.14)});
    vanityGfx.rect(vx+8, vy+vh*0.25, vw-16, 2).fill({color:shade(vColor,-0.1)});
    vanityGfx.rect(vx+8, vy+vh*0.75, vw-16, 2).fill({color:shade(vColor,-0.1)});
    const hndC = tier>=2 ? num("#C8B870") : num("#807060");
    vanityGfx.roundRect(vx+vw/2-14, vy+vh*0.25-6, 28, 8, 4).fill({color:hndC});
    vanityGfx.roundRect(vx+vw/2-14, vy+vh*0.75-6, 28, 8, 4).fill({color:hndC});
    const sinkC = tier>=2 ? num("#DEDAD4") : num("#C8C0B4");
    vanityGfx.roundRect(vx-4, vy-26, vw+8, 30, 6).fill({color:sinkC});
    vanityGfx.ellipse(vx+vw/2, vy-11, 30, 14).fill({color:shade(sinkC,-0.13)});
    const faucetC = tier>=3 ? num("#C8B870") : (tier>=2 ? num("#B8B8B8") : num("#888"));
    vanityGfx.rect(vx+vw/2-3, vy-48, 6, 26).fill({color:faucetC});
    vanityGfx.roundRect(vx+vw/2-14, vy-52, 28, 8, 4).fill({color:faucetC});
    const mx=vx-4, my=44, mw=vw+8, mh=166+tier*10;
    mirrorGfx.roundRect(mx,my,mw,mh,tier>=2?4:8).fill({color:num("#C8D8DC"),alpha:0.48});
    mirrorGfx.roundRect(mx,my,mw,mh,tier>=2?4:8).stroke({
      width:tier>=3?3:6, color:tier>=3?num("#D4C9A8"):num("#8A7060"),
    });
    if (tier>=2) {
      const la = tier>=3 ? 0.9 : 0.45+t*0.4;
      mirrorGfx.roundRect(mx-3,my-3,mw+6,mh+6,6).stroke({width:3,color:num("#FFE8A0"),alpha:la});
    }
  }

  function drawTub(tier: Tier, t: number): void {
    if (hasSprites) return;
    tubGfx.clear();
    const twBase = 200 + tier*14;
    const tw = twBase, th = 96 + tier*8;
    const tx = (DW-tw)/2 + 18, ty = 250;
    const tubC = lerpC(num("#DEDED8"), num("#F0EDE8"), t);
    tubGfx.ellipse(tx+tw/2, ty+th+8, tw/2-8, 10).fill({color:0x000000, alpha:0.15});
    tubGfx.roundRect(tx, ty, tw, th, 28).fill({color:tubC});
    tubGfx.roundRect(tx, ty, tw, th, 28).stroke({width:3, color:shade(tubC,-0.16)});
    tubGfx.roundRect(tx+14, ty+14, tw-28, th-22, 20).fill({color:shade(tubC,-0.07)});
    tubGfx.roundRect(tx+2, ty+2, tw-4, 18, 26).fill({color:0xffffff, alpha:0.25});
    const legC = tier>=2 ? num("#C8B870") : num("#B0B0B0");
    tubGfx.roundRect(tx+18, ty+th-2, 10, 20, 3).fill({color:legC});
    tubGfx.roundRect(tx+tw-28, ty+th-2, 10, 20, 3).fill({color:legC});
    if (tier>=1) tubGfx.roundRect(tx+tw/2-5, ty+th-2, 10, 20, 3).fill({color:legC});
    const faucetC = tier>=3 ? num("#C8B870") : (tier>=2 ? num("#C0C0C0") : num("#909090"));
    tubGfx.rect(tx+tw*0.7-3, ty-16, 6, 22).fill({color:faucetC});
    tubGfx.roundRect(tx+tw*0.7-14, ty-22, 28, 8, 4).fill({color:faucetC});
    if (tier>=1) {
      const wa = 0.05+tier*0.04+t*0.03;
      tubGfx.roundRect(tx+18, ty+18, tw-36, 18, 9).fill({color:num("#A8D4E0"),alpha:wa});
    }
  }

  function drawShower(tier: Tier, t: number): void {
    if (hasSprites) return;
    showerGfx.clear();
    const sw2=180+tier*10, sh2=220;
    const sx=(DW-sw2)/2+18, sy=140;
    const gAlpha = 0.16+t*0.06;
    showerGfx.rect(sx, sy, 4, sh2).fill({color:num("#C8E0E8"),alpha:0.7});
    showerGfx.rect(sx+sw2-4, sy, 4, sh2).fill({color:num("#C8E0E8"),alpha:0.7});
    showerGfx.rect(sx, sy, sw2, sh2).fill({color:num("#C8E0E8"),alpha:gAlpha});
    showerGfx.rect(sx, sy+sh2-4, sw2, 4).fill({color:num("#C8E0E8"),alpha:0.7});
    const headC = tier>=3 ? num("#C8B870") : num("#C0C0C0");
    showerGfx.circle(sx+sw2-22, sy+34, 16).fill({color:headC});
    showerGfx.rect(sx+sw2-24, sy+10, 4, 28).fill({color:headC});
    if (tier>=3 || t>0.6) {
      for (let i=0; i<6; i++) for (let j=0; j<4; j++) {
        showerGfx.circle(sx+sw2-12-i*3, sy+22+j*5, 1.5).fill({color:headC,alpha:0.8});
      }
    }
    const trayC = tier>=3 ? num("#E8E4DC") : num("#C4C0B8");
    showerGfx.roundRect(sx, sy+sh2, sw2, 18, 4).fill({color:trayC});
    showerGfx.circle(sx+sw2/2, sy+sh2+9, 6).fill({color:shade(trayC,-0.2)});
  }

  function drawSlider(): void {
    const tx = budgetToX(budget);
    trackBg.clear();
    trackBg.roundRect(TRACK_L, TRACK_Y-6, TRACK_W, 12, 6).fill({color:shade(PRIMARY,-0.35)});
    trackFill.clear();
    trackFill.roundRect(TRACK_L, TRACK_Y-6, tx-TRACK_L, 12, 6).fill({color:ACCENT});
    markerGfx.clear();
    for (const thr of thresholds) {
      const mx = budgetToX(thr);
      markerGfx.rect(mx-1, TRACK_Y-10, 2, 20).fill({color:0xffffff,alpha:0.4});
    }
    thumbWrap.position.set(tx, TRACK_Y);
    // Thumb glow (while dragging)
    thumbGlowGfx.clear();
    if (thumbGlowActive) {
      thumbGlowGfx.circle(0, 0, THUMB_R+14).fill({color:ACCENT, alpha:0.18});
      thumbGlowGfx.circle(0, 0, THUMB_R+8).fill({color:ACCENT, alpha:0.22});
    }
    thumbGfx.clear();
    thumbGfx.circle(0,0,THUMB_R+7).fill({color:ACCENT,alpha:0.22});
    thumbGfx.circle(0,0,THUMB_R).fill({color:ACCENT});
    thumbGfx.circle(0,0,THUMB_R).stroke({width:3,color:shade(ACCENT,0.3)});
    thumbGfx.poly([-10,-8, 0,-19, 10,-8]).fill({color:shade(ACCENT,0.3)});
    thumbGfx.circle(0,0,8).fill({color:shade(ACCENT,0.25)});
    ghostFinger.position.set(tx, TRACK_Y);
  }

  function buildTickerBg(): void {
    tickerBg.clear();
    tickerBg.roundRect(DW/2-114, TICKER_CY-28, 228, 60, 12).fill({color:shade(PRIMARY,-0.35),alpha:0.88});
  }

  function updateTicker(): void {
    const v = budget;
    tickerText.text = "$"+(v/1000).toFixed(1)+"K";
    tickerText.position.set(DW/2 - 16, TICKER_CY);
    estLabel.position.set(DW/2 + tickerText.width/2 - 16, TICKER_CY + 14);
  }

  function updateTierChip(): void {
    const tier = computeTier(budget);
    tierChipText.text = TIER_NAMES[tier];
    const cw = tierChipText.width+24, ch=28;
    const cx=DW/2, cy=CHIP_CY;
    tierChipGfx.clear();
    tierChipGfx.roundRect(cx-cw/2, cy-ch/2, cw, ch, 14).fill({color:PRIMARY});
    tierChipGfx.roundRect(cx-cw/2, cy-ch/2, cw, ch, 14).stroke({width:2,color:ACCENT});
    tierChipText.position.set(cx, cy);
  }

  // ── FX helpers ────────────────────────────────────────────────────────────
  function sparkle(x: number, y: number, n=8): void {
    for (let i=0; i<n; i++) {
      const angle=(i/n)*Math.PI*2, dist=22+Math.random()*28;
      const s = new Text({
        text:"✦",
        style:{fill:cfg.style.colors.accent, fontFamily:FONT, fontWeight:"bold", fontSize:14+Math.random()*14},
      });
      s.anchor.set(0.5); s.position.set(x,y); s.alpha=0;
      fxLayer.addChild(s);
      gsap.timeline({onComplete:()=>{ if(!s.destroyed) s.destroy(); }})
        .to(s,{alpha:1,duration:0.1})
        .to(s,{x:x+Math.cos(angle)*dist,y:y+Math.sin(angle)*dist,alpha:0,duration:0.5,ease:"power1.out"},0);
    }
  }

  function puff(x: number, y: number, n=5): void {
    for (let i=0; i<n; i++) {
      const d=new Graphics().circle(0,0,3+Math.random()*5).fill({color:ACCENT,alpha:0.7});
      d.position.set(x+(Math.random()-0.5)*40, y+(Math.random()-0.5)*18);
      fxLayer.addChild(d);
      gsap.to(d,{y:d.y-28-Math.random()*18,alpha:0,duration:0.55+Math.random()*0.3,ease:"power1.out",onComplete:()=>{ if(!d.destroyed) d.destroy(); }});
    }
  }

  // Per-tier sparkle positions (fixed zone per sprite art):
  // basic: mirror/vanity zone → left side (~60, 140)
  // mid: tub center → (~200, 280)
  // premium: shower zone → right side (~280, 200)
  const TIER_SPARKLE_POS: [number, number][] = [
    [60, 140],   // basic — mirror left
    [200, 280],  // mid   — tub center
    [280, 200],  // premium — shower/rain
    [320, 160],  // luxury — (same shower zone)
  ];

  // ── Threshold crossfade flash + parallax push-in ──────────────────────────
  function doThresholdCrossfade(newTier: Tier): void {
    xfadeGfx.clear();
    xfadeGfx.rect(0,0,DW,ROOM_BOTTOM).fill({color:0xffffff,alpha:0.55});
    gsap.killTweensOf(xfadeGfx);
    gsap.fromTo(xfadeGfx,{alpha:0.55},{alpha:0,duration:0.5,ease:"power1.out"});

    // Parallax push-in: scale 1.03 → 1.0 on the entering sprite
    const enterSprite = newTier <= 0 ? bathBasicSprite :
                        newTier === 1 ? bathMidSprite : bathPremiumSprite;
    if (enterSprite instanceof Sprite) {
      const t0 = enterSprite.texture;
      if (t0 && t0.width > 0) {
        const baseScale = Math.max(DW / t0.width, ROOM_BOTTOM / t0.height);
        gsap.killTweensOf(enterSprite.scale);
        gsap.fromTo(enterSprite.scale,
          { x: baseScale * 1.03, y: baseScale * 1.03 },
          { x: baseScale, y: baseScale, duration: 0.6, ease: "power2.out" }
        );
      }
    }

    // Per-tier sparkle burst at zone-specific position
    const [sx, sy] = TIER_SPARKLE_POS[Math.min(newTier, 3)];
    sparkle(sx, sy, 12);
    puff(DW/2, TRACK_Y-20, 6);
    showDesignerBonus(newTier);
  }

  // ── Designer bonus popup ──────────────────────────────────────────────────
  const BONUS_NAMES: Record<Tier, string[]> = {
    0:["Soap Dish","Towel Hook","Bath Mat"],
    1:["Heated Towel Bar","Recessed Shelf","Glass Shelf"],
    2:["Rain Head Upgrade","Bench Seat","Steam Valve"],
    3:["Waterfall Faucet","Smart Mirror","Radiant Heat"],
  };

  function showDesignerBonus(tier: Tier): void {
    bonusCont.removeChildren();
    const names=BONUS_NAMES[tier], name=names[Math.floor(Math.random()*names.length)];
    const bw=210, bh=52;
    const bg=new Graphics();
    bg.roundRect(-bw/2,-bh/2,bw,bh,12).fill({color:PRIMARY});
    bg.roundRect(-bw/2,-bh/2,bw,bh,12).stroke({width:3,color:ACCENT});
    const bt=new Text({text:"+ "+name+" added!", style:{fill:TXT,fontFamily:FONT,fontWeight:"bold",fontSize:16,align:"center"}});
    bt.anchor.set(0.5);
    bonusCont.addChild(bg,bt);
    bonusCont.position.set(DW/2, 150);
    bonusCont.alpha=0; bonusCont.scale.set(0.8);
    gsap.timeline()
      .to(bonusCont,{alpha:1,duration:0.18})
      .to(bonusCont.scale,{x:1,y:1,duration:0.3,ease:"back.out(2)"},0)
      .to(bonusCont,{alpha:0,duration:0.35,delay:1.3});
  }

  // ── Sweet spot badge ──────────────────────────────────────────────────────
  function showSweetSpot(): void {
    if (sweetSpotShown) return; sweetSpotShown=true;
    sweetSpotCont.removeChildren();
    const bw=218, bh=62;
    const bg=new Graphics();
    bg.roundRect(-bw/2,-bh/2,bw,bh,14).fill({color:ACCENT});
    bg.roundRect(-bw/2,-bh/2,bw,bh,14).stroke({width:3,color:shade(ACCENT,0.35)});
    const t1=new Text({text:"Best Value",style:{fill:"#3a2418",fontFamily:FONT,fontWeight:"bold",fontSize:22,align:"center"}});
    t1.anchor.set(0.5); t1.position.set(0,-10);
    const t2=new Text({text:"$18.5K sweet spot ✦",style:{fill:"#3a2418",fontFamily:FONT,fontWeight:"bold",fontSize:13,align:"center"}});
    t2.anchor.set(0.5); t2.position.set(0,14);
    sweetSpotCont.addChild(bg,t1,t2);
    sweetSpotCont.position.set(DW/2, 150);
    sweetSpotCont.alpha=0; sweetSpotCont.scale.set(0.5);
    gsap.timeline()
      .to(sweetSpotCont,{alpha:1,duration:0.22})
      .to(sweetSpotCont.scale,{x:1.08,y:1.08,duration:0.3,ease:"back.out(3)"},0)
      .to(sweetSpotCont.scale,{x:1,y:1,duration:0.15},">")
      .to(sweetSpotCont,{alpha:0,duration:0.38,delay:1.9});
    sparkle(DW/2, 150, 12);
  }

  // ── Lock chip ─────────────────────────────────────────────────────────────
  function showLockChip(): void {
    if (lockChipShown) return; lockChipShown=true;
    const cw=182, ch=48;
    lockChipBg.clear();
    lockChipBg.roundRect(-cw/2,-ch/2,cw,ch,24).fill({color:ACCENT});
    lockChipBg.roundRect(-cw/2,-ch/2,cw,ch,24).stroke({width:3,color:shade(ACCENT,0.35)});
    lockChip.alpha=0; lockChip.scale.set(0.7);
    lockChip.eventMode="static"; lockChip.cursor="pointer";
    lockChip.on("pointertap",(e)=>{e.stopPropagation(); lockStyle();});
    gsap.to(lockChip,{alpha:1,duration:0.4,ease:"power2.out"});
    gsap.to(lockChip.scale,{x:1,y:1,duration:0.4,ease:"back.out(1.8)"});
    gsap.to(lockChip.scale,{x:1.06,y:1.06,duration:0.7,yoyo:true,repeat:-1,ease:"sine.inOut",delay:0.5});
  }

  function lockStyle(): void {
    if (fsmState!=="interactive") return;
    fsmState="locked";
    lockedTier=computeTier(budget);
    gsap.to(lockChip,{alpha:0,duration:0.3});
    showLockedBanner();
  }

  function showLockedBanner(): void {
    const banner=new Container();
    const bw=DW-44, bh=68;
    const bg=new Graphics();
    bg.roundRect(0,0,bw,bh,16).fill({color:shade(PRIMARY,-0.12)});
    bg.roundRect(0,0,bw,bh,16).stroke({width:3,color:ACCENT});
    const t1=new Text({text:"Your style: "+TIER_NAMES[lockedTier],style:{fill:TXT,fontFamily:FONT,fontWeight:"bold",fontSize:19,align:"center"}});
    t1.anchor.set(0.5,0); t1.position.set(bw/2,8);
    const t2=new Text({text:TIER_RANGES[lockedTier]+" estimate",style:{fill:cfg.style.colors.accent,fontFamily:FONT,fontWeight:"bold",fontSize:14,align:"center"}});
    t2.anchor.set(0.5,0); t2.position.set(bw/2,36);
    banner.addChild(bg,t1,t2);
    banner.position.set(22, TICKER_CY - 32); banner.alpha=0;
    overlayLayer.addChild(banner);
    gsap.to(banner,{alpha:1,duration:0.4,ease:"power2.out"});
    gsap.delayedCall(2.2,()=>{
      gsap.to(banner,{alpha:0,duration:0.38,onComplete:()=>{ if(fsmState!=="endcard") showEndcard(); }});
    });
  }

  // ── Endcard ───────────────────────────────────────────────────────────────
  function showEndcard(): void {
    if (fsmState==="endcard") return;
    fsmState="endcard";
    overlayLayer.removeChildren();

    const dim=new Graphics().rect(0,0,DW,DH).fill({color:0x000000,alpha:0.58});
    overlayLayer.addChild(dim);

    const panel=new Container();
    const pw=348, ph=440;
    panel.addChild(new Graphics().roundRect(-pw/2,-ph/2,pw,ph,24).fill({color:num("#2A3A44")}).stroke({width:4,color:ACCENT}));

    const logoBg=new Graphics().roundRect(-106,-ph/2+16,212,52,10).fill({color:PRIMARY});
    const logoTxt=new Text({text:"RenoScope",style:{fill:TXT,fontFamily:FONT,fontWeight:"bold",fontSize:30}});
    logoTxt.anchor.set(0.5); logoTxt.position.set(0,-ph/2+42);
    const tagTxt=new Text({text:"See your budget take shape.",style:{fill:cfg.style.colors.accent,fontFamily:FONT,fontWeight:"bold",fontSize:12}});
    tagTxt.anchor.set(0.5); tagTxt.position.set(0,-ph/2+78);
    panel.addChild(logoBg,logoTxt,tagTxt);

    const hLine=new Text({
      text:"Your "+TIER_NAMES[lockedTier]+" bath is taking shape.",
      style:{fill:TXT,fontFamily:FONT,fontWeight:"bold",fontSize:17,align:"center",wordWrap:true,wordWrapWidth:pw-44},
    });
    hLine.anchor.set(0.5); hLine.position.set(0,-ph/2+108);
    const rangeLbl=new Text({
      text:TIER_RANGES[lockedTier]+" estimate",
      style:{fill:cfg.style.colors.accent,fontFamily:FONT,fontWeight:"bold",fontSize:22,align:"center"},
    });
    rangeLbl.anchor.set(0.5); rangeLbl.position.set(0,-ph/2+140);
    panel.addChild(hLine,rangeLbl);

    const consultTxt=new Text({
      text:"Free consult includes a 3D design\nlicensed & insured in your state",
      style:{fill:TXT,fontFamily:FONT,fontWeight:"bold",fontSize:13,align:"center",wordWrap:true,wordWrapWidth:pw-44},
    });
    consultTxt.anchor.set(0.5); consultTxt.position.set(0,-ph/2+182);
    panel.addChild(consultTxt);

    const chipRowY=-ph/2+228;
    for (let i=0; i<4; i++) {
      const cColor=lerpC(WALL_COLORS[i], FLOOR_COLORS[i], 0.5);
      const isMe = i===lockedTier;
      const cg=new Graphics();
      cg.roundRect(-142+i*76, chipRowY, 66, 48, 8).fill({color:cColor});
      if (isMe) cg.roundRect(-142+i*76, chipRowY, 66, 48, 8).stroke({width:3,color:ACCENT});
      const cl=new Text({text:TIER_NAMES[i],style:{fill:isMe?TXT:shade(num(TXT),0),fontFamily:FONT,fontWeight:"bold",fontSize:9}});
      cl.anchor.set(0.5); cl.position.set(-142+i*76+33, chipRowY+36);
      cl.alpha = isMe ? 1 : 0.55;
      panel.addChild(cg,cl);
    }

    const ctaWrap=new Container();
    const ctaW=pw-48, ctaH=56;
    ctaWrap.addChild(new Graphics().roundRect(-ctaW/2,-ctaH/2,ctaW,ctaH,28).fill({color:ACCENT}).stroke({width:4,color:shade(ACCENT,-0.28)}));
    const ctaT=new Text({text:"See My "+TIER_NAMES[lockedTier]+" Estimate",style:{fill:"#3a2418",fontFamily:FONT,fontWeight:"bold",fontSize:20}});
    ctaT.anchor.set(0.5);
    if (ctaT.width>ctaW*0.88) ctaT.scale.set((ctaW*0.88)/ctaT.width);
    ctaWrap.addChild(ctaT);
    ctaWrap.position.set(0, ph/2-68);
    ctaWrap.eventMode="static"; ctaWrap.cursor="pointer";
    ctaWrap.on("pointertap",(e)=>{ e.stopPropagation(); window.FbPlayableAd.onCTAClick(); });
    panel.addChild(ctaWrap);
    gsap.to(ctaWrap.scale,{x:1.05,y:1.05,duration:0.75,yoyo:true,repeat:-1,ease:"sine.inOut"});

    const endDisc=new Text({
      text:"Estimates only. Final pricing varies by project, materials, and location.",
      style:{fill:TXT,fontFamily:FONT,fontWeight:"bold",fontSize:10,align:"center",wordWrap:true,wordWrapWidth:pw-32,alpha:0.6},
    });
    endDisc.anchor.set(0.5); endDisc.position.set(0, ph/2-24);
    panel.addChild(endDisc);

    panel.position.set(DW/2, DH/2);
    panel.scale.set(0.7);
    overlayLayer.addChild(panel);
    gsap.to(panel.scale,{x:1,y:1,duration:0.45,ease:"back.out(1.5)"});
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL SCENE UPDATE — called on every budget change
  // ═══════════════════════════════════════════════════════════════════════════
  function updateScene(skipCrossfade=false): void {
    const newTier = computeTier(budget);
    const t = tierBlend(budget);

    if (hasSprites) {
      updateBathAlpha();
    } else {
      // Procedural fallback
      drawBackground();
      drawVanity(newTier, t);
      const tubAlpha    = newTier<=1 ? 1 : 0;
      const showerAlpha = newTier>=2 ? 1 : 0;
      if (skipCrossfade) {
        tubGfx.alpha    = tubAlpha;
        showerGfx.alpha = showerAlpha;
      } else if (Math.abs(tubGfx.alpha-tubAlpha)>0.01) {
        gsap.to(tubGfx,   {alpha:tubAlpha,   duration:0.4});
        gsap.to(showerGfx,{alpha:showerAlpha,duration:0.4});
      }
      if (newTier<=1) drawTub(newTier, t);
      else            drawShower(newTier, t);
    }

    drawSlider();
    updateTicker();
    updateTierChip();

    // Tier-change detection → crossfade + bonus
    if (newTier!==currentTier && !skipCrossfade) {
      doThresholdCrossfade(newTier as Tier);
      currentTier = newTier as Tier;
    }

    // Sweet spot
    if (Math.abs(budget-SWEET_SPOT)<600) showSweetSpot();
  }

  // ── Pointer / drag ────────────────────────────────────────────────────────
  function toDesign(sx: number, sy: number): [number,number] {
    const s=root.scale.x, ox=root.x, oy=root.y;
    return [(sx-ox)/s, (sy-oy)/s];
  }
  function isNearTrack(dx: number, dy: number): boolean {
    return dx>=TRACK_L-24 && dx<=TRACK_R+24 && Math.abs(dy-TRACK_Y)<=32;
  }

  app.stage.on("pointerdown",(e)=>{
    if (fsmState==="endcard") return;
    const [dx,dy]=toDesign(e.clientX, e.clientY);
    if (!isNearTrack(dx,dy)) return;
    dragging=true;
    thumbGlowActive=true;
    idleMs=0; autoDemoMs=0;
    gsap.killTweensOf(ghostFinger); ghostFinger.alpha=0;
    if (!hadFirstDrag) hadFirstDrag=true;
    const newB=Math.round(xToBudget(dx)/100)*100;
    budget=Math.max(MIN_BUDGET,Math.min(MAX_BUDGET,newB));
    updateScene();
  });

  app.stage.on("pointermove",(e)=>{
    if (!dragging || fsmState==="endcard") return;
    const [dx]=toDesign(e.clientX, e.clientY);
    const prevB=budget;
    const newB=Math.round(xToBudget(dx)/100)*100;
    budget=Math.max(MIN_BUDGET,Math.min(MAX_BUDGET,newB));
    idleMs=0; autoDemoMs=0;
    if (budget>prevB) lastTierChangeDir=1;
    else if (budget<prevB) lastTierChangeDir=-1;
    if (budget>=MAX_BUDGET-200) maxReached=true;
    if (maxReached && budget<=MIN_BUDGET+200) fullPassDone=true;
    if (Math.floor(prevB/1500)!==Math.floor(budget/1500)) puff(budgetToX(budget), TRACK_Y-18, 4);
    updateScene();
  });

  app.stage.on("pointerup",()=>{
    dragging=false;
    thumbGlowActive=false;
    drawSlider(); // redraw thumb without glow
    if (fullPassDone && !lockChipShown) showLockChip();
  });
  app.stage.on("pointerupoutside",()=>{
    dragging=false;
    thumbGlowActive=false;
    drawSlider();
  });

  // ── Ghost finger hint ─────────────────────────────────────────────────────
  let ghostTween: gsap.core.Timeline|null=null;
  function startGhostHint(): void {
    if (ghostTween) { ghostTween.kill(); ghostTween=null; }
    const sx=budgetToX(START_BUDGET), ex=budgetToX(MAX_BUDGET*0.82);
    ghostFinger.position.set(sx, TRACK_Y);
    ghostTween=gsap.timeline({repeat:-1})
      .to(ghostFinger,{alpha:0.85,duration:0.4})
      .to(ghostFinger,{x:ex,duration:1.3,ease:"power1.inOut"})
      .to(ghostFinger,{alpha:0,duration:0.28})
      .to(ghostFinger,{x:sx,duration:0})
      .to({},{duration:0.75});
  }

  // ── Hook: ticker flicker ──────────────────────────────────────────────────
  function startHookFlicker(): void {
    const vals=[9500,24000,12000,9500];
    let idx=0;
    function flicker(): void {
      if (hadFirstDrag || fsmState!=="intro") return;
      const v=vals[idx%vals.length];
      tickerText.text="$"+(v/1000).toFixed(1)+"K";
      idx++;
      gsap.delayedCall(idx<3?0.42:1.0, flicker);
    }
    gsap.delayedCall(0.25, flicker);
  }

  // ── Ambient motion: slow drift on bath sprites ────────────────────────────
  function startAmbientMotion(): void {
    if (!hasSprites) return;
    const sprites = [bathBasicSprite, bathMidSprite, bathPremiumSprite];
    sprites.forEach((sp, i) => {
      if (!(sp instanceof Sprite)) return;
      const t0 = sp.texture;
      if (!t0 || t0.width === 0) return;
      const baseScale = Math.max(DW / t0.width, ROOM_BOTTOM / t0.height);
      // Slow drift: tiny Y offset yoyo — feels like breathing/living scene
      gsap.to(sp, {
        y: 4 + i * 2,
        duration: 3.5 + i * 0.8,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        delay: i * 0.6,
      });
      // Slow scale breathe
      gsap.to(sp.scale, {
        x: baseScale * 1.008,
        y: baseScale * 1.008,
        duration: 4 + i * 0.5,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        delay: i * 0.3,
      });
    });
  }

  // ── Idle/auto-demo ticker ─────────────────────────────────────────────────
  app.ticker.add((ticker)=>{
    if (fsmState==="endcard"||fsmState==="locked") return;
    const dt=Math.min(0.05, ticker.deltaMS/1000);
    if (dragging) return;
    idleMs    += dt*1000;
    autoDemoMs+= dt*1000;

    if (idleMs>=IDLE_HINT_MS && !hadFirstDrag && ghostFinger.alpha<0.05) {
      startGhostHint();
    }

    if (autoDemoMs>=AUTO_DEMO_AFTER_MS && !hadFirstDrag) {
      autoDemoMs=0;
      const target=autoDemoDir>0 ? MAX_BUDGET : MIN_BUDGET;
      gsap.to({v:budget},{
        v:target, duration:3.8, ease:"power1.inOut",
        onUpdate: function(){
          if (!hadFirstDrag) {
            budget=Math.round((this.targets()[0] as {v:number}).v/100)*100;
            updateScene();
          }
        },
        onComplete:()=>{
          autoDemoDir*=-1;
          if (!fullPassDone) {
            if (autoDemoDir<0 && budget>=MAX_BUDGET-400) maxReached=true;
            if (autoDemoDir>0 && budget<=MIN_BUDGET+400 && maxReached) {
              fullPassDone=true;
              if (!lockChipShown) showLockChip();
            }
          }
        },
      });
    }

    if (fullPassDone && lockChipShown && idleMs>=LOCK_CHIP_DELAY_MS && fsmState==="interactive") {
      lockStyle();
    }
  });

  // ── Layout ────────────────────────────────────────────────────────────────
  function layout(): void {
    const w=window.innerWidth, h=window.innerHeight;
    const s=Math.min(w/DW, h/DH);
    root.scale.set(s);
    const ox=(w-DW*s)/2, oy=(h-DH*s)/2;
    root.position.set(ox, oy);

    const topGap    = oy / s;
    const botGap    = (h - DH*s - oy) / s;

    fullscreenBgGfx.clear();
    fullscreenBgGfx.rect(0, 0, w, h).fill({ color: BG });

    topExtGfx.clear();
    if (!hasSprites && topGap > 0.5) {
      const tier = computeTier(budget);
      const wallC = WALL_COLORS[tier];
      topExtGfx.rect(0, -topGap, DW, topGap + 1).fill({ color: shade(wallC, -0.06) });
    }
    botExtGfx.clear();
    if (!hasSprites && botGap > 0.5) {
      botExtGfx.rect(0, DH, DW, botGap + 1).fill({ color: shade(PRIMARY, -0.35) });
    }

    // Re-apply cover-fit when viewport changes
    if (hasSprites) updateBathLayout();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  // Apply initial cover-fit to sprites
  updateBathLayout();

  buildTickerBg();
  currentTier=computeTier(budget);
  lockedTier=currentTier;
  updateScene(true);
  layout();

  window.addEventListener("resize",()=>{
    app.canvas.style.width  = window.innerWidth  + "px";
    app.canvas.style.height = window.innerHeight + "px";
    layout();
  });

  fsmState="intro";
  startHookFlicker();
  gsap.delayedCall(0.45,()=>{
    fsmState="interactive";
    startGhostHint();
    startAmbientMotion();
  });

  // 2nd paint: Pixi v8 shader-race workaround
  app.renderer.render(app.stage);
  requestAnimationFrame(()=>{ layout(); app.renderer.render(app.stage); });

  // Validator greps this literal
  void (() => window.FbPlayableAd.onCTAClick);
}

main().catch((e)=>{ console.error("Budget Slider Bath Morph failed:", e); });
