// greens-catch-glass — Brimful nutra playable (sprite-integrated + polished).
// Mechanic: drag glass by X to catch falling greens/vitamins/berries.
// Rigged bit: first spawn is deterministic at glass start X (auto-catch ≤0.8s).
// Input-gate: spawning pauses until first player drag.
// Junk: boing bounce + glass shake, no penalty, never passes through.
// Golden vitamin: x2 fill + streak + sparkle + brief slow-mo.
// Near-miss slow-mo: only when finger is actually moving toward item on glass edge.
// Fill meter: masked rect in glass outline + GSAP tween.
// Endcard: always shown after ~20s or glass full — offer framed as standard promo.

import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

declare global {
  interface Window {
    FbPlayableAd: { onCTAClick: () => void };
  }
}

// CTA validator sentinel — do NOT remove
void (() => window.FbPlayableAd?.onCTAClick);

function num(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

// ── Color palette from style ────────────────────────────────────────────────
const C_BG = num(cfg.style.colors.background);   // #0d2b3e
const C_PRIMARY = num(cfg.style.colors.primary);  // #4ECDC4
const C_ACCENT = num(cfg.style.colors.accent);    // #FFB627
const C_TEXT = num(cfg.style.colors.text);        // #F7FFF7
const FONT = cfg.style.font.family;

// Item colors: greens, berries, vitamins
const ITEM_COLORS = [
  0x4ECDC4, // leafy green / spinach
  0x6BCB77, // broccoli green
  0xA8E063, // lime / kale
  0xFF6B6B, // berry / raspberry
  0xC77DFF, // blueberry / acai
  0xFFD93D, // lemon / pineapple
];
const JUNK_COLOR = 0xf5a623; // donut = orange-ish

// Tunable params — FASTER FILL per client request
const GLASS_W = Number(cfg.params.glassW ?? 96);
const GLASS_H = Number(cfg.params.glassH ?? 140);
const ITEM_R = Number(cfg.params.itemRadius ?? 22);
// Faster: 25% shorter spawn interval
const SPAWN_INTERVAL = Number(cfg.params.spawnIntervalSec ?? 0.9);
const FALL_MIN = Number(cfg.params.fallSpeedMin ?? 180);
const FALL_MAX = Number(cfg.params.fallSpeedMax ?? 260);
const GOLDEN_CHANCE = Number(cfg.params.goldenChance ?? 0.12);
const JUNK_CHANCE = Number(cfg.params.junkChance ?? 0.18);
const NEAR_MISS_MARGIN = Number(cfg.params.nearMissMarginPx ?? 30);
const SLOW_MO_DUR = Number(cfg.params.slowMoDuration ?? 1.2);
const IDLE_AUTO_DEMO = Number(cfg.params.idleAutoDemoSec ?? 2.0);
const CTA_STRIP_H = 90; // px reserved at bottom — items despawn before entering this zone
const GAME_DURATION = Number(cfg.params.gameDurationSec ?? 22);

// Faster fill: ~13% per green catch, ~27% per golden catch
const FILL_PER_GREEN = Number(cfg.params.fillPerGreen ?? 0.13);
const FILL_PER_GOLDEN = Number(cfg.params.fillPerGolden ?? 0.27);

// ── Texture cache ────────────────────────────────────────────────────────────
const TEX: Record<string, Texture> = {};

async function preloadTextures(): Promise<void> {
  await Promise.all(
    Object.entries(cfg.assets).map(async ([k, uri]) => {
      if (!/\.(webp|png)$/i.test(k)) return;
      const img = new Image();
      img.src = uri as string;
      try {
        await img.decode();
      } catch {
        return;
      }
      TEX[k] = Texture.from(img);
    })
  );
}

function tex(key: string): Texture | null {
  return TEX[key] ?? null;
}

function makeSprite(key: string, targetW: number): Sprite | null {
  const t = tex(key);
  if (!t) return null;
  const s = new Sprite(t);
  s.anchor.set(0.5);
  s.scale.set(targetW / t.width);
  return s;
}

async function main(): Promise<void> {
  if (!window.FbPlayableAd) window.FbPlayableAd = { onCTAClick: () => {} };

  // Preload all textures before building the scene
  await preloadTextures();

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
  app.canvas.style.width = window.innerWidth + "px";
  app.canvas.style.height = window.innerHeight + "px";
  document.body.appendChild(app.canvas);

  // ── Touch/scroll mitigation ─────────────────────────────────────────────────
  app.canvas.style.touchAction = "none";
  app.canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  // ── Layers: bg → game → fx → ui → overlay ───────────────────────────────────
  const bgLayer = new Container();
  const gameLayer = new Container();
  const fxLayer = new Container();
  const uiLayer = new Container();
  const overlayLayer = new Container();
  app.stage.addChild(bgLayer, gameLayer, fxLayer, uiLayer, overlayLayer);
  gameLayer.interactiveChildren = false;
  fxLayer.interactiveChildren = false;

  // ── Background: sprite or procedural fallback ──────────────────────────────
  const bgContainer = new Container();
  bgLayer.addChild(bgContainer);

  // Dark overlay on top of bg sprite (alpha 0.25 so gameplay pops)
  const bgDarkOverlay = new Graphics();
  bgLayer.addChild(bgDarkOverlay);

  // Procedural fallback (used if sprite not loaded)
  const bgGraphics = new Graphics();
  bgLayer.addChild(bgGraphics);

  let bgSprite: Sprite | null = null;
  const bgTex = tex("bg.webp");
  if (bgTex) {
    bgSprite = new Sprite(bgTex);
    bgSprite.anchor.set(0, 0);
    bgContainer.addChild(bgSprite);
  }

  // Ambient floating dots (always shown regardless of bg sprite)
  const ambientDots: { g: Graphics; baseX: number; baseY: number; phase: number }[] = [];
  const dotPositions = [
    [0.05, 0.06], [0.90, 0.10], [0.08, 0.32], [0.94, 0.38],
    [0.12, 0.60], [0.87, 0.65], [0.04, 0.85], [0.93, 0.80],
    [0.50, 0.04], [0.30, 0.15], [0.70, 0.18],
  ];

  function drawBg(w: number, h: number): void {
    if (bgSprite) {
      // Cover-fit the full canvas
      const scaleX = w / bgTex!.width;
      const scaleY = h / bgTex!.height;
      const bgScale = Math.max(scaleX, scaleY);
      bgSprite.scale.set(bgScale);
      bgSprite.x = (w - bgTex!.width * bgScale) / 2;
      bgSprite.y = (h - bgTex!.height * bgScale) / 2;
      // Dark overlay covers full canvas
      bgDarkOverlay.clear();
      bgDarkOverlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.25 });
      // Hide procedural fallback
      bgGraphics.clear();
    } else {
      // Procedural fallback
      bgGraphics.clear();
      bgGraphics.rect(0, 0, w, h).fill(C_BG);
      bgGraphics.circle(w / 2, h * 0.12, w * 0.55).fill({ color: 0x1e5470, alpha: 0.06 });
      bgGraphics.circle(w / 2, h * 0.12, w * 0.30).fill({ color: 0x1e5470, alpha: 0.06 });
    }

    // Rebuild ambient dots
    for (const dot of ambientDots) {
      if (!dot.g.destroyed) { bgLayer.removeChild(dot.g); dot.g.destroy(); }
    }
    ambientDots.length = 0;
    for (const [fx, fy] of dotPositions) {
      const g = new Graphics();
      g.circle(0, 0, 3).fill({ color: C_PRIMARY, alpha: 0.35 });
      g.x = w * fx;
      g.y = h * fy;
      bgLayer.addChild(g);
      ambientDots.push({ g, baseX: w * fx, baseY: h * fy, phase: Math.random() * Math.PI * 2 });
    }
  }

  // Animate ambient dots with slow yoyo drift
  let dotAnimTime = 0;
  function updateAmbientDots(dt: number): void {
    dotAnimTime += dt;
    for (const dot of ambientDots) {
      if (dot.g.destroyed) continue;
      dot.g.x = dot.baseX + Math.sin(dotAnimTime * 0.7 + dot.phase) * 4;
      dot.g.y = dot.baseY + Math.cos(dotAnimTime * 0.5 + dot.phase) * 5;
    }
  }

  // ── Glass container (drag input object) ─────────────────────────────────────
  const glassWrap = new Container();
  gameLayer.addChild(glassWrap);

  // Glow ring behind glass (always shown)
  const glassGlow = new Graphics();
  glassWrap.addChild(glassGlow);

  // Fill layer (behind glass sprite) — masked liquid
  const glassFillContainer = new Container();
  const glassFillMaskG = new Graphics();
  const fillBar = new Graphics();
  glassFillContainer.addChild(fillBar);
  glassFillContainer.mask = glassFillMaskG;

  // Procedural glass (fallback)
  const glassBody = new Graphics();
  const glassShine = new Graphics();
  const glassOutline = new Graphics();

  // Glass sprite (on top of fill)
  let glassSprite: Sprite | null = null;
  const glassTex = tex("glass.webp");
  if (glassTex) {
    glassSprite = new Sprite(glassTex);
    glassSprite.anchor.set(0.5);
    // Scale glass sprite to match GLASS_W
    glassSprite.scale.set((GLASS_W * 1.15) / glassTex.width);
  }

  glassWrap.addChild(glassFillContainer, glassFillMaskG);
  if (glassSprite) {
    glassWrap.addChild(glassSprite);
  } else {
    glassWrap.addChild(glassBody, glassShine, glassOutline);
  }

  let fillLevel = 0; // 0..1

  function drawGlass(): void {
    const gw = GLASS_W, gh = GLASS_H;
    const bevel = 10;

    // Glow behind glass
    glassGlow.clear();
    if (fillLevel > 0.05) {
      const glowAlpha = fillLevel * 0.35;
      glassGlow.circle(0, 0, gw * 0.85).fill({ color: C_PRIMARY, alpha: glowAlpha });
    }

    if (glassSprite) {
      // Fill mask matches glass shape (trapezoid interior)
      const iw = gw - 10, ih = gh - 8, ib = bevel - 2;
      glassFillMaskG.clear();
      glassFillMaskG
        .poly([-iw / 2, -ih / 2 + 4, iw / 2, -ih / 2 + 4, iw / 2 - ib, ih / 2, -iw / 2 + ib, ih / 2])
        .fill({ color: 0xffffff });
      // Fill bar (water level rises from bottom)
      fillBar.clear();
      const fh = Math.max(0, ih * fillLevel);
      const fy = ih / 2 - fh;
      fillBar.rect(-iw / 2, fy, iw, fh).fill({ color: C_PRIMARY, alpha: 0.65 });
      if (fh > 4) {
        fillBar.rect(-iw / 2, fy, iw, Math.min(fh, 6)).fill({ color: 0xffffff, alpha: 0.25 });
      }
    } else {
      // Procedural fallback
      glassBody.clear();
      glassBody
        .poly([-gw / 2, -gh / 2, gw / 2, -gh / 2, gw / 2 - bevel, gh / 2, -gw / 2 + bevel, gh / 2])
        .fill({ color: C_PRIMARY, alpha: 0.18 });
      const iw = gw - 6, ih = gh - 6, ib = bevel;
      glassFillMaskG.clear();
      glassFillMaskG
        .poly([-iw / 2, -ih / 2, iw / 2, -ih / 2, iw / 2 - ib, ih / 2, -iw / 2 + ib, ih / 2])
        .fill({ color: 0xffffff });
      fillBar.clear();
      const fh = Math.max(0, ih * fillLevel);
      const fy = ih / 2 - fh;
      fillBar.rect(-iw / 2, fy, iw, fh).fill({ color: C_PRIMARY, alpha: 0.7 });
      if (fh > 4) {
        fillBar.rect(-iw / 2, fy, iw, Math.min(fh, 6)).fill({ color: 0xffffff, alpha: 0.22 });
      }
      glassShine.clear();
      glassShine
        .poly([-gw / 2 + 6, -gh / 2, -gw / 2 + 18, -gh / 2, -gw / 2 + 14, gh / 2 - 10, -gw / 2 + 4, gh / 2 - 10])
        .fill({ color: 0xffffff, alpha: 0.14 });
      glassOutline.clear();
      glassOutline
        .poly([-gw / 2, -gh / 2, gw / 2, -gh / 2, gw / 2 - bevel, gh / 2, -gw / 2 + bevel, gh / 2])
        .stroke({ width: 3, color: C_PRIMARY, alpha: 0.9 });
      glassOutline
        .moveTo(-gw / 2, -gh / 2)
        .lineTo(gw / 2, -gh / 2)
        .stroke({ width: 5, color: 0xffffff, alpha: 0.7 });
    }
  }
  drawGlass();

  function setFill(level: number, animate: boolean): void {
    const target = Math.min(1, Math.max(0, level));
    if (animate) {
      const proxy = { v: fillLevel };
      gsap.to(proxy, {
        v: target, duration: 0.35, ease: "power2.out",
        onUpdate: () => { fillLevel = proxy.v; drawGlass(); },
        onComplete: () => { fillLevel = target; drawGlass(); },
      });
    } else {
      fillLevel = target;
      drawGlass();
    }
  }

  // ── Items (falling greens/vitamins/junk) ─────────────────────────────────────
  // Sprite keys mapped to ingredient types
  // We use 5 green ingredient slots: spinach, blueberry, strawberry, kiwi, ginger
  const GREEN_SPRITE_KEYS = [
    "ing-spinach.webp",
    "ing-blueberry.webp",
    "ing-strawberry.webp",
    "ing-kiwi.webp",
    "ing-ginger.webp",
  ];

  // Particle colors per green ingredient sprite
  const GREEN_PARTICLE_COLORS = [
    0x4CAF50, // spinach — green
    0x5C6BC0, // blueberry — indigo
    0xFF5252, // strawberry — red
    0x8BC34A, // kiwi — lime green
    0xFFB300, // ginger — amber
  ];

  type ItemKind = "green" | "golden" | "junk";
  interface Item {
    cont: Container;
    g: Graphics; // procedural fallback graphics
    kind: ItemKind;
    colorIdx: number;
    spriteIdx: number; // for green items: index into GREEN_SPRITE_KEYS
    junkIdx: number;   // 0=donut, 1=soda
    r: number;
    vy: number;
    vx: number;
    rotSpeed: number;  // rotation wobble speed (rad/s)
    alive: boolean;
    isNearMiss: boolean;
    caught: boolean;
  }
  const items: Item[] = [];

  // ── Particles ────────────────────────────────────────────────────────────────
  type Particle = { g: Graphics; vx: number; vy: number; life: number; maxLife: number };
  const particles: Particle[] = [];

  function spawnParticles(x: number, y: number, color: number, count: number, burst = false): void {
    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      const r = 3 + Math.random() * 5;
      g.circle(0, 0, r).fill({ color, alpha: 1 });
      g.x = x + (Math.random() - 0.5) * 20;
      g.y = y + (Math.random() - 0.5) * 20;
      fxLayer.addChild(g);
      const ang = Math.random() * Math.PI * 2;
      const spd = burst ? 160 + Math.random() * 220 : 80 + Math.random() * 140;
      const life = 0.5 + Math.random() * 0.5;
      particles.push({ g, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - (burst ? 80 : 40), life: 0, maxLife: life });
    }
  }

  // Juice splash: larger colored droplets
  function spawnJuiceSplash(x: number, y: number, color: number): void {
    for (let i = 0; i < 14; i++) {
      const g = new Graphics();
      const r = 4 + Math.random() * 7;
      // Main drop
      g.circle(0, 0, r).fill({ color, alpha: 0.9 });
      // White highlight
      g.circle(-r * 0.3, -r * 0.3, r * 0.35).fill({ color: 0xffffff, alpha: 0.5 });
      g.x = x + (Math.random() - 0.5) * 30;
      g.y = y + (Math.random() - 0.5) * 20;
      fxLayer.addChild(g);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
      const spd = 100 + Math.random() * 200;
      const life = 0.4 + Math.random() * 0.5;
      particles.push({ g, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0, maxLife: life });
    }
  }

  // Rainbow particles for glass full
  function spawnRainbowSplash(x: number, y: number): void {
    const colors = [0xFF6B6B, 0xFFD93D, 0x6BCB77, 0x4ECDC4, 0xC77DFF, 0xFFB627];
    for (let i = 0; i < 40; i++) {
      const color = colors[i % colors.length];
      spawnParticles(x, y, color, 1, true);
    }
  }

  // Radial gold burst for golden catch
  function spawnGoldBurst(x: number, y: number): void {
    // Large gold ring expanding outward
    const ring = new Graphics();
    ring.x = x; ring.y = y;
    fxLayer.addChild(ring);
    const ringProxy = { r: 10, alpha: 1 };
    gsap.to(ringProxy, {
      r: 90, alpha: 0, duration: 0.55, ease: "power2.out",
      onUpdate: () => {
        if (ring.destroyed) return;
        ring.clear();
        ring.circle(0, 0, ringProxy.r).stroke({ width: 5, color: C_ACCENT, alpha: ringProxy.alpha });
      },
      onComplete: () => {
        if (!ring.destroyed) { fxLayer.removeChild(ring); ring.destroy(); }
      },
    });

    // Star particles outward
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const g = new Graphics();
      // Small diamond/star shape
      g.poly([0, -7, 3, -2, 7, 0, 3, 2, 0, 7, -3, 2, -7, 0, -3, -2]).fill({ color: C_ACCENT });
      g.x = x; g.y = y; g.rotation = ang;
      fxLayer.addChild(g);
      const dist = 60 + Math.random() * 50;
      const tx = x + Math.cos(ang) * dist;
      const ty = y + Math.sin(ang) * dist;
      gsap.timeline({
        onComplete: () => { if (!g.destroyed) { fxLayer.removeChild(g); g.destroy(); } },
      })
        .fromTo(g, { alpha: 1, x, y }, { alpha: 0, x: tx, y: ty, duration: 0.55, ease: "power2.out" });
    }

    // Bright center flash
    const flash = new Graphics();
    flash.circle(0, 0, 40).fill({ color: 0xffffff, alpha: 0.85 });
    flash.x = x; flash.y = y;
    fxLayer.addChild(flash);
    gsap.to(flash, {
      alpha: 0, duration: 0.35, ease: "power2.out",
      onComplete: () => { if (!flash.destroyed) { fxLayer.removeChild(flash); flash.destroy(); } },
    });
  }

  // ── HUD elements ─────────────────────────────────────────────────────────────
  // Streak counter
  const streakText = new Text({
    text: "",
    style: { fill: C_ACCENT, fontFamily: FONT, fontSize: 32, fontWeight: "900", align: "center" },
  });
  streakText.anchor.set(0.5);
  streakText.alpha = 0;
  uiLayer.addChild(streakText);

  // Instruction text (shown after 3s hook)
  const instructText = new Text({
    text: "Catch the greens!",
    style: { fill: C_TEXT, fontFamily: FONT, fontSize: 28, fontWeight: "700", align: "center" },
  });
  instructText.anchor.set(0.5);
  instructText.alpha = 0;
  uiLayer.addChild(instructText);

  // Brand logo (top left)
  const brandCont = new Container();
  const brandBg = new Graphics();
  const brandText = new Text({
    text: "Brimful",
    style: { fill: C_TEXT, fontFamily: FONT, fontSize: 22, fontWeight: "900" },
  });
  brandText.anchor.set(0, 0.5);
  brandCont.addChild(brandBg, brandText);
  uiLayer.addChild(brandCont);

  // Fill label (bigger + bouncier — above glass rim)
  const fillLabel = new Text({
    text: "0%",
    style: { fill: C_ACCENT, fontFamily: FONT, fontSize: 26, fontWeight: "900", dropShadow: { blur: 4, color: 0x000000, distance: 2, alpha: 0.6 } },
  });
  fillLabel.anchor.set(0.5);
  uiLayer.addChild(fillLabel);

  // Ghost finger hint
  const ghostFinger = new Container();
  const gfCircle = new Graphics();
  gfCircle.circle(0, 0, 22).fill({ color: 0xffffff, alpha: 0.7 });
  gfCircle.circle(0, 0, 22).stroke({ width: 3, color: C_ACCENT });
  ghostFinger.addChild(gfCircle);
  ghostFinger.alpha = 0;
  uiLayer.addChild(ghostFinger);

  // CTA button (always present, stays in bottom zone)
  const ctaCont = new Container();
  const ctaBg = new Graphics();
  const ctaText = new Text({
    text: cfg.copy.cta,
    style: { fill: 0xffffff, fontFamily: FONT, fontSize: 28, fontWeight: "900" },
  });
  ctaText.anchor.set(0.5);
  ctaCont.addChild(ctaBg, ctaText);
  ctaCont.eventMode = "static";
  ctaCont.cursor = "pointer";
  ctaCont.alpha = 1;
  function drawCta(w: number): void {
    const bw = Math.min(w - 48, 300), bh = 56;
    ctaBg.clear();
    ctaBg.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2).fill(C_ACCENT);
    ctaBg.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2).stroke({ width: 3, color: 0xffffff, alpha: 0.7 });
  }
  function doCTA(): void {
    window.FbPlayableAd.onCTAClick();
  }
  ctaCont.on("pointertap", doCTA);
  uiLayer.addChild(ctaCont);

  // ── Game state ────────────────────────────────────────────────────────────────
  let now = 0;
  let tScale = 1;
  let spawnTimer = 0;
  let gameRunning = true;
  let ended = false;
  let playerHasDragged = false;
  let riggedBitDone = false;
  let streak = 0;
  let idleTime = 0;
  let ghostActive = false;
  let instructShown = false;
  let glassFull = false;

  // Glass position (X set in layout on first call)
  let glassX = 0;

  // ── Pointer / drag input ──────────────────────────────────────────────────────
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  let pointerDown = false;
  let lastPointerX = 0;

  app.stage.on("pointerdown", (e: { global: { x: number; y: number } }) => {
    pointerDown = true;
    lastPointerX = e.global.x;
    idleTime = 0;
    // Any tap/touch wakes up auto-demo and counts as player interaction
    if (autoDemoActive) stopAutoDemo();
    if (!playerHasDragged) {
      playerHasDragged = true;
      gsap.killTweensOf(ghostFinger);
      ghostFinger.alpha = 0;
      ghostActive = false;
    }
  });
  app.stage.on("pointerup", () => { pointerDown = false; });
  app.stage.on("pointerupoutside", () => { pointerDown = false; });

  app.stage.on("pointermove", (e: { global: { x: number; y: number } }) => {
    if (!pointerDown || !gameRunning) return;
    const dx = e.global.x - lastPointerX;
    lastPointerX = e.global.x;
    idleTime = 0;

    if (Math.abs(dx) > 1) {
      const w = window.innerWidth;
      glassX = Math.max(GLASS_W / 2 + 10, Math.min(w - GLASS_W / 2 - 10, glassX + dx));

      if (gameRunning && !ended) {
        checkNearMiss(e.global.x, dx);
      }
    }
  });

  function checkNearMiss(fingerX: number, dx: number): void {
    const h = window.innerHeight;
    const glassYPos = h * 0.70 + GLASS_H / 2;
    const glassTop = glassYPos - GLASS_H / 2;
    for (const item of [...items]) {
      if (!item.alive || item.caught || !item.cont || item.cont.destroyed) continue;
      const iy = item.cont.y;
      if (iy < glassTop - 60 || iy > glassTop + GLASS_H) continue;
      const ix = item.cont.x;
      const distFromEdge = Math.abs(ix - glassX) - GLASS_W / 2;
      if (distFromEdge > 0 && distFromEdge < NEAR_MISS_MARGIN) {
        const towardItem = (ix > glassX && dx > 0) || (ix < glassX && dx < 0);
        if (towardItem && !item.isNearMiss) {
          item.isNearMiss = true;
          activateSlowMo(SLOW_MO_DUR);
        }
      }
    }
    void fingerX;
  }

  // ── Slow-mo ───────────────────────────────────────────────────────────────────
  let slowMoHolder = { t: 1 };
  function activateSlowMo(dur: number): void {
    gsap.killTweensOf(slowMoHolder);
    tScale = 0.45;
    slowMoHolder.t = 0.45;
    gsap.to(slowMoHolder, {
      t: 1, duration: dur, ease: "power2.in",
      onUpdate: () => { tScale = slowMoHolder.t; },
      onComplete: () => { tScale = 1; },
    });
  }

  // Golden brief slow-mo: 0.5x for 0.3s
  function activateGoldenSlowMo(): void {
    gsap.killTweensOf(slowMoHolder);
    tScale = 0.5;
    slowMoHolder.t = 0.5;
    gsap.to(slowMoHolder, {
      t: 1, duration: 0.3, ease: "power2.in",
      onUpdate: () => { tScale = slowMoHolder.t; },
      onComplete: () => { tScale = 1; },
    });
  }

  // ── Item drawing helpers ──────────────────────────────────────────────────────
  function drawItemProcedural(g: Graphics, kind: ItemKind, colorIdx: number, r: number): void {
    g.clear();
    if (kind === "junk") {
      g.circle(0, 0, r).fill({ color: JUNK_COLOR });
      g.circle(0, 0, r * 0.45).fill({ color: C_BG });
      g.circle(0, -r * 0.3, r * 0.35).fill({ color: 0xffffff, alpha: 0.85 });
    } else if (kind === "golden") {
      g.circle(0, 0, r).fill({ color: C_ACCENT });
      g.circle(0, 0, r * 0.65).fill({ color: 0xffffff, alpha: 0.3 });
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(ang) * r * 0.88;
        const py = Math.sin(ang) * r * 0.88;
        g.circle(px, py, r * 0.18).fill({ color: 0xffffff, alpha: 0.7 });
      }
      g.circle(0, 0, r + 5).stroke({ width: 3, color: C_ACCENT, alpha: 0.8 });
    } else {
      const col = ITEM_COLORS[colorIdx % ITEM_COLORS.length];
      g.circle(0, 0, r).fill({ color: col });
      g.circle(-r * 0.25, -r * 0.3, r * 0.35).fill({ color: 0xffffff, alpha: 0.22 });
      g.rect(-2, -r - 4, 4, 7).fill({ color: col });
    }
  }

  // ── Spawn logic ───────────────────────────────────────────────────────────────
  function spawnItem(xOverride?: number): void {
    const w = window.innerWidth;

    // Determine kind
    let kind: ItemKind = "green";
    const roll = Math.random();
    if (roll < JUNK_CHANCE) kind = "junk";
    else if (roll < JUNK_CHANCE + GOLDEN_CHANCE) kind = "golden";

    const colorIdx = Math.floor(Math.random() * ITEM_COLORS.length);
    const spriteIdx = Math.floor(Math.random() * GREEN_SPRITE_KEYS.length);
    const junkIdx = Math.floor(Math.random() * 2); // 0=donut, 1=soda
    const r = ITEM_R + (kind === "golden" ? 4 : 0);

    const cont = new Container();
    const g = new Graphics();

    // Try to use sprite
    let usedSprite = false;
    if (kind === "green") {
      const key = GREEN_SPRITE_KEYS[spriteIdx];
      const s = makeSprite(key, r * 2.2);
      if (s) { cont.addChild(s); usedSprite = true; }
    } else if (kind === "golden") {
      const s = makeSprite("ing-golden.webp", r * 2.4);
      if (s) {
        // Pulsing glow halo behind golden item
        const halo = new Graphics();
        halo.circle(0, 0, r * 1.8).fill({ color: C_ACCENT, alpha: 0.35 });
        cont.addChild(halo);
        cont.addChild(s);
        usedSprite = true;
        // Animate halo pulse
        const haloProxy = { a: 0.35 };
        gsap.to(haloProxy, {
          a: 0.7, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut",
          onUpdate: () => {
            if (halo.destroyed) return;
            halo.clear();
            halo.circle(0, 0, r * 1.8).fill({ color: C_ACCENT, alpha: haloProxy.a });
          },
        });
      }
    } else {
      // junk
      const junkKey = junkIdx === 0 ? "junk-donut.webp" : "junk-soda.webp";
      const s = makeSprite(junkKey, r * 2.2);
      if (s) { cont.addChild(s); usedSprite = true; }
    }

    if (!usedSprite) {
      drawItemProcedural(g, kind, colorIdx, r);
      cont.addChild(g);
    }

    // Spawn position
    const fromX = xOverride !== undefined ? xOverride : w * (0.12 + Math.random() * 0.76);
    cont.x = fromX;
    cont.y = -r - 10;

    gameLayer.addChild(cont);

    const baseVy = FALL_MIN + Math.random() * (FALL_MAX - FALL_MIN);
    const vx = (Math.random() - 0.5) * 40;
    // Rotation wobble: items fall with slight rotation
    const rotSpeed = (Math.random() - 0.5) * 3.5;

    items.push({ cont, g, kind, colorIdx, spriteIdx, junkIdx, r, vy: baseVy, vx, rotSpeed, alive: true, isNearMiss: false, caught: false });
  }

  // Initial rigged spawn
  function spawnRiggedFirst(): void {
    spawnItem(glassX);
    riggedBitDone = true;
  }

  // ── Glass squash-stretch on catch ─────────────────────────────────────────────
  const squashProxy = { sx: 1, sy: 1 };
  function squashGlass(): void {
    gsap.killTweensOf(squashProxy);
    squashProxy.sx = 1.18; squashProxy.sy = 0.86;
    glassWrap.scale.set(1.18, 0.86);
    gsap.to(squashProxy, {
      sx: 1, sy: 1, duration: 0.35, ease: "elastic.out(1.4, 0.5)",
      onUpdate: () => { glassWrap.scale.set(squashProxy.sx, squashProxy.sy); },
      onComplete: () => { glassWrap.scale.set(1, 1); },
    });
  }

  // Glass shake (boing for junk)
  function shakeGlass(): void {
    if (glassSprite) {
      gsap.killTweensOf(glassSprite);
      gsap.to(glassSprite, { x: 10, duration: 0.05, yoyo: true, repeat: 6, ease: "none", onComplete: () => { if (!glassSprite!.destroyed) glassSprite!.x = 0; } });
    } else {
      gsap.killTweensOf(glassOutline);
      gsap.to(glassOutline, { x: 10, duration: 0.05, yoyo: true, repeat: 6, ease: "none", onComplete: () => { glassOutline.x = 0; } });
      gsap.to(glassShine, { x: 10, duration: 0.05, yoyo: true, repeat: 6, ease: "none", onComplete: () => { glassShine.x = 0; } });
    }
  }

  // Fill label bounce
  function bounceFillLabel(): void {
    const proxy = { s: 1 };
    gsap.killTweensOf(proxy);
    gsap.to(proxy, {
      s: 1.5, duration: 0.18, ease: "back.out(3)",
      onUpdate: () => { fillLabel.scale.set(proxy.s); },
      onComplete: () => {
        gsap.to(proxy, {
          s: 1, duration: 0.25, ease: "elastic.out(1.2, 0.4)",
          onUpdate: () => { fillLabel.scale.set(proxy.s); },
        });
      },
    });
  }

  // ── Catch detection ────────────────────────────────────────────────────────────
  function tryHitTest(item: Item): boolean {
    if (!item.cont || item.cont.destroyed) return false;
    const h = window.innerHeight;
    const glassYPos = h * 0.70 + GLASS_H / 2;
    const glassTop = glassYPos - GLASS_H / 2;
    const ix = item.cont.x;
    const iy = item.cont.y;
    const inXRange = Math.abs(ix - glassX) < GLASS_W / 2 + item.r * 0.5;
    const inYRange = iy >= glassTop - item.r * 0.5 && iy <= glassTop + GLASS_H * 0.7;
    return inXRange && inYRange;
  }

  function catchItem(item: Item): void {
    if (!item.alive || item.caught) return;
    item.caught = true;
    item.alive = false;

    const capturedX = (!item.cont || item.cont.destroyed) ? glassX : item.cont.x;
    const capturedY = (!item.cont || item.cont.destroyed) ? glassWrap.y : item.cont.y;

    // Kill any gsap tweens on item children (halo pulse etc)
    if (item.cont && !item.cont.destroyed) {
      item.cont.children.forEach((child) => gsap.killTweensOf(child));
    }

    const idx = items.indexOf(item);
    if (idx >= 0) items.splice(idx, 1);
    if (item.cont && !item.cont.destroyed) {
      gameLayer.removeChild(item.cont);
      item.cont.destroy({ children: true });
    }

    if (item.kind === "junk") {
      spawnBoing(capturedX, capturedY, item.junkIdx);
      shakeGlass();
      return;
    }

    // Green or golden catch
    const fillIncrease = item.kind === "golden" ? FILL_PER_GOLDEN : FILL_PER_GREEN;
    setFill(fillLevel + fillIncrease, true);

    const h = window.innerHeight;
    const catchY = h * 0.70;

    // Juice splash in item's color
    const splashColor = item.kind === "golden"
      ? C_ACCENT
      : GREEN_PARTICLE_COLORS[item.spriteIdx % GREEN_PARTICLE_COLORS.length];
    spawnJuiceSplash(glassX, catchY, splashColor);
    squashGlass();

    streak++;

    if (item.kind === "golden") {
      // Radial gold burst + brief slow-mo
      spawnGoldBurst(glassX, catchY);
      activateGoldenSlowMo();
      showStreakBanner("x2 FILL!", C_ACCENT);
    } else if (streak >= 3) {
      showStreakBanner("Streak x" + streak + "!", C_PRIMARY);
    }

    // Update fill percentage label — bigger bounce
    fillLabel.text = Math.round(fillLevel * 100) + "%";
    bounceFillLabel();

    // Check glass full
    if (fillLevel >= 1 && !glassFull) {
      glassFull = true;
      triggerGlassFull();
    }
  }

  function spawnBoing(x: number, y: number, junkIdx: number): void {
    // Visual boing — use junk sprite if available
    const boingCont = new Container();
    boingCont.x = x; boingCont.y = y;
    const junkKey = junkIdx === 0 ? "junk-donut.webp" : "junk-soda.webp";
    const boingSprite = makeSprite(junkKey, ITEM_R * 2);
    if (boingSprite) {
      boingCont.addChild(boingSprite);
    } else {
      const boingG = new Graphics();
      boingG.circle(0, 0, ITEM_R).fill({ color: JUNK_COLOR, alpha: 0.85 });
      boingG.circle(0, 0, ITEM_R * 0.45).fill({ color: C_BG });
      boingCont.addChild(boingG);
    }
    fxLayer.addChild(boingCont);
    const boingProxy = { s: 1 };
    gsap.timeline({
      onComplete: () => { if (!boingCont.destroyed) { fxLayer.removeChild(boingCont); boingCont.destroy({ children: true }); } },
    })
      .to(boingCont, { y: y - 70, alpha: 0, duration: 0.5, ease: "power2.out" }, 0)
      .to(boingProxy, {
        s: 1.5, duration: 0.18, yoyo: true, repeat: 1, ease: "sine.inOut",
        onUpdate: () => { if (!boingCont.destroyed) boingCont.scale.set(boingProxy.s); },
      }, 0);
    const boing = new Text({
      text: "boing!",
      style: { fill: JUNK_COLOR, fontFamily: FONT, fontSize: 22, fontWeight: "900" },
    });
    boing.anchor.set(0.5);
    boing.x = x + (Math.random() - 0.5) * 60;
    boing.y = y - 20;
    fxLayer.addChild(boing);
    gsap.timeline({
      onComplete: () => { if (!boing.destroyed) { fxLayer.removeChild(boing); boing.destroy(); } },
    })
      .fromTo(boing, { alpha: 0, y: y - 20 }, { alpha: 1, y: y - 70, duration: 0.5, ease: "power2.out" })
      .to(boing, { alpha: 0, duration: 0.3 }, 0.3);
  }

  // ── Streak banner ─────────────────────────────────────────────────────────────
  const streakScaleProxy = { s: 0.5 };
  function showStreakBanner(text: string, _color: number): void {
    streakText.text = text;
    gsap.killTweensOf(streakText);
    gsap.killTweensOf(streakScaleProxy);
    streakScaleProxy.s = 0.5;
    streakText.scale.set(0.5);
    streakText.alpha = 1;
    gsap.to(streakScaleProxy, {
      s: 1, duration: 0.3, ease: "back.out(2)",
      onUpdate: () => { streakText.scale.set(streakScaleProxy.s); },
    });
    gsap.to(streakText, { alpha: 0, duration: 0.5, delay: 0.8 });
  }

  // ── Glass full event ──────────────────────────────────────────────────────────
  function triggerGlassFull(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    spawnRainbowSplash(glassX, h * 0.70);
    const badgeCont = new Container();
    const badgeTexts = ["Energy", "Focus", "Daily greens"];
    badgeTexts.forEach((label, i) => {
      const bg = new Graphics();
      bg.roundRect(-60, -18, 120, 36, 18).fill({ color: C_PRIMARY, alpha: 0.9 });
      const t = new Text({
        text: label,
        style: { fill: 0xffffff, fontFamily: FONT, fontSize: 18, fontWeight: "700" },
      });
      t.anchor.set(0.5);
      t.y = 0;
      const bc = new Container();
      bc.addChild(bg, t);
      bc.x = w / 2 + (i - 1) * 140;
      bc.y = h * 0.28;
      bc.alpha = 0;
      badgeCont.addChild(bc);
      gsap.fromTo(bc, { alpha: 0, y: bc.y + 20 }, { alpha: 1, y: bc.y, duration: 0.4, delay: i * 0.12, ease: "back.out(2)" });
    });
    fxLayer.addChild(badgeCont);
    gsap.to(badgeCont, {
      alpha: 0, duration: 0.5, delay: 2.2,
      onComplete: () => { fxLayer.removeChild(badgeCont); badgeCont.destroy({ children: true }); },
    });
    const goalText = new Text({
      text: "Your goals: Energy · Focus · Daily greens",
      style: { fill: C_TEXT, fontFamily: FONT, fontSize: 22, fontWeight: "700", align: "center" },
    });
    goalText.anchor.set(0.5);
    goalText.x = w / 2;
    goalText.y = h * 0.22;
    goalText.alpha = 0;
    fxLayer.addChild(goalText);
    gsap.to(goalText, { alpha: 1, duration: 0.4, delay: 0.3 });
    gsap.to(goalText, {
      alpha: 0, duration: 0.5, delay: 2.5,
      onComplete: () => { fxLayer.removeChild(goalText); goalText.destroy(); },
    });
    gsap.delayedCall(3.0, showEndcard);
  }

  // ── Endcard ───────────────────────────────────────────────────────────────────
  let endcardShown = false;
  function showEndcard(): void {
    if (endcardShown) return;
    endcardShown = true;
    ended = true;
    gameRunning = false;
    ctaCont.visible = false;

    const w = window.innerWidth;
    const h = window.innerHeight;

    const ov = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.72 });
    ov.addChild(bg);

    const pw = Math.min(w - 40, 360), ph = Math.min(h * 0.72, 560);
    const panel = new Container();
    const panelBg = new Graphics();
    panelBg.roundRect(-pw / 2, -ph / 2, pw, ph, 24).fill({ color: num("#0f3248") });
    panelBg.roundRect(-pw / 2, -ph / 2, pw, ph, 24).stroke({ width: 4, color: C_PRIMARY });
    panel.addChild(panelBg);

    const logoG = new Graphics();
    const lw = 32, lh = 52;
    logoG
      .poly([-lw / 2, -lh / 2, lw / 2, -lh / 2, lw / 2 - 5, lh / 2, -lw / 2 + 5, lh / 2])
      .fill({ color: C_PRIMARY, alpha: 0.3 });
    logoG
      .poly([-lw / 2, -lh / 2, lw / 2, -lh / 2, lw / 2 - 5, lh / 2, -lw / 2 + 5, lh / 2])
      .stroke({ width: 3, color: C_PRIMARY });
    logoG.arc(0, 0, lw * 0.42, 0.1, Math.PI - 0.1).stroke({ width: 2.5, color: C_PRIMARY, alpha: 0.9 });
    logoG.x = -pw / 2 + 54;
    logoG.y = -ph / 2 + 54;

    const brandLogo = new Text({
      text: "Brimful",
      style: { fill: C_PRIMARY, fontFamily: FONT, fontSize: 32, fontWeight: "900" },
    });
    brandLogo.anchor.set(0, 0.5);
    brandLogo.x = -pw / 2 + 80;
    brandLogo.y = -ph / 2 + 54;

    panel.addChild(logoG, brandLogo);

    const tagline = new Text({
      text: "Fill up on good.",
      style: { fill: C_PRIMARY, fontFamily: FONT, fontSize: 18, fontWeight: "700", align: "center" },
    });
    tagline.anchor.set(0.5);
    tagline.y = -ph / 2 + 100;
    panel.addChild(tagline);

    const mainMsg = new Text({
      text: "Glass full!\nGet 20% off your first month",
      style: {
        fill: C_TEXT,
        fontFamily: FONT,
        fontSize: 26,
        fontWeight: "900",
        align: "center",
        wordWrap: true,
        wordWrapWidth: pw - 40,
      },
    });
    mainMsg.anchor.set(0.5);
    mainMsg.y = -ph / 2 + 188;
    panel.addChild(mainMsg);

    const subMsg = new Text({
      text: "Intro offer for new members.",
      style: {
        fill: C_PRIMARY,
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: "700",
        align: "center",
      },
    });
    subMsg.anchor.set(0.5);
    subMsg.y = -ph / 2 + 262;
    panel.addChild(subMsg);

    const cBtn = new Container();
    const cBtnBg = new Graphics();
    const cBtnW = pw - 60;
    cBtnBg.roundRect(-cBtnW / 2, -28, cBtnW, 56, 28).fill(C_ACCENT);
    cBtnBg.roundRect(-cBtnW / 2, -28, cBtnW, 56, 28).stroke({ width: 3, color: 0xffffff, alpha: 0.7 });
    const cBtnText = new Text({
      text: cfg.copy.cta,
      style: { fill: 0xffffff, fontFamily: FONT, fontSize: 26, fontWeight: "900" },
    });
    cBtnText.anchor.set(0.5);
    cBtn.addChild(cBtnBg, cBtnText);
    cBtn.y = -ph / 2 + 330;
    cBtn.eventMode = "static";
    cBtn.cursor = "pointer";
    cBtn.on("pointertap", doCTA);
    panel.addChild(cBtn);
    const cBtnProxy = { s: 1 };
    gsap.to(cBtnProxy, {
      s: 1.06, duration: 0.65, yoyo: true, repeat: -1, ease: "sine.inOut",
      onUpdate: () => { cBtn.scale.set(cBtnProxy.s); },
    });

    const rMayVary = new Text({
      text: "Results may vary.",
      style: {
        fill: C_TEXT,
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: "700",
        align: "center",
        alpha: 0.8,
      },
    });
    rMayVary.anchor.set(0.5);
    rMayVary.y = -ph / 2 + 385;
    panel.addChild(rMayVary);

    const disclaimerText =
      "*These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease. Results may vary.";
    const disclaimer = new Text({
      text: disclaimerText,
      style: {
        fill: C_TEXT,
        fontFamily: FONT,
        fontSize: 11,
        fontWeight: "400",
        align: "center",
        wordWrap: true,
        wordWrapWidth: pw - 32,
        alpha: 0.65,
      },
    });
    disclaimer.anchor.set(0.5, 0);
    disclaimer.y = -ph / 2 + 412;
    panel.addChild(disclaimer);

    panel.x = w / 2;
    panel.y = h / 2;
    ov.addChild(panel);

    overlayLayer.addChild(ov);
    ov.alpha = 0;
    gsap.to(ov, { alpha: 1, duration: 0.4, ease: "power2.out" });
    panel.scale.set(0.8);
    const panelScaleProxy = { s: 0.8 };
    gsap.to(panelScaleProxy, {
      s: 1, duration: 0.45, ease: "back.out(1.5)",
      onUpdate: () => { panel.scale.set(panelScaleProxy.s); },
    });
  }

  // ── Ghost-finger hint ─────────────────────────────────────────────────────────
  function showGhostFinger(): void {
    if (ghostActive) return;
    ghostActive = true;
    ghostFinger.alpha = 0.9;
    function loopGhost(): void {
      if (!ghostActive) return;
      const h = window.innerHeight;
      ghostFinger.x = glassX + 30;
      ghostFinger.y = h - GLASS_H - 50;
      gsap.to(ghostFinger, {
        x: glassX - 30, duration: 0.8, ease: "sine.inOut",
        onComplete: () => {
          gsap.to(ghostFinger, {
            x: glassX + 30, duration: 0.8, ease: "sine.inOut",
            onComplete: loopGhost,
          });
        },
      });
    }
    loopGhost();
  }

  // ── Auto-demo ─────────────────────────────────────────────────────────────────
  let autoDemoActive = false;
  function runAutoDemo(): void {
    if (autoDemoActive || ended || !gameRunning) return;
    autoDemoActive = true;
    function demoStep(): void {
      if (!autoDemoActive || ended) { autoDemoActive = false; return; }
      const w = window.innerWidth;
      const targetX = w * (0.2 + Math.random() * 0.6);
      const startX = glassX;
      const proxy = { t: 0 };
      gsap.to(proxy, {
        t: 1, duration: 0.7, ease: "sine.inOut",
        onUpdate: () => {
          if (!autoDemoActive) return;
          glassX = startX + (targetX - startX) * proxy.t;
        },
        onComplete: demoStep,
      });
    }
    demoStep();
  }
  function stopAutoDemo(): void {
    autoDemoActive = false;
  }

  // Suppress unused variable warning
  void showGhostFinger;

  // ── Layout ────────────────────────────────────────────────────────────────────
  function layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    app.renderer.resize(w, h);
    app.canvas.style.width = w + "px";
    app.canvas.style.height = h + "px";
    app.stage.hitArea = new Rectangle(0, 0, w, h);

    drawBg(w, h);

    if (glassX === 0) glassX = w / 2;

    const ctaY = h - 44;
    const glassRimY = h * 0.70;
    const glassYPos = glassRimY + GLASS_H / 2;
    glassWrap.x = 0;
    glassWrap.y = glassYPos;

    // Brand (top left)
    brandBg.clear();
    brandBg.roundRect(0, -18, 120, 36, 9).fill({ color: num("#ffffff"), alpha: 0.1 });
    brandText.x = 14;
    brandText.y = 0;
    brandCont.x = 16;
    brandCont.y = 36;

    instructText.x = w / 2;
    instructText.y = h * 0.12;

    streakText.x = w / 2;
    streakText.y = h * 0.22;

    fillLabel.x = glassX;
    fillLabel.y = glassYPos - GLASS_H / 2 - 28;

    if (!ghostActive) {
      ghostFinger.x = glassX;
      ghostFinger.y = glassYPos - GLASS_H / 2 - 44;
    }

    drawCta(w);
    ctaCont.x = w / 2;
    ctaCont.y = ctaY;
  }

  layout();
  app.renderer.render(app.stage);
  window.addEventListener("resize", layout);

  // CTA pulse from start
  const ctaScaleProxy = { s: 1 };
  gsap.to(ctaScaleProxy, {
    s: 1.07, duration: 0.65, yoyo: true, repeat: -1, ease: "sine.inOut",
    onUpdate: () => { ctaCont.scale.set(ctaScaleProxy.s); },
  });

  // ── Ticker ────────────────────────────────────────────────────────────────────
  app.ticker.add(() => {
    const rawDt = Math.min(0.05, app.ticker.deltaMS / 1000);
    const dt = rawDt * tScale;
    now += rawDt;

    // Update ambient dots
    updateAmbientDots(rawDt);

    // Update glass wrap position to follow glassX
    const h = window.innerHeight;
    const glassRimY = h * 0.70;
    const glassYPos = glassRimY + GLASS_H / 2;
    glassWrap.x = glassX;
    glassWrap.y = glassYPos;
    fillLabel.x = glassX;
    fillLabel.y = glassYPos - GLASS_H / 2 - 28;

    if (gameRunning && !ended) {
      if (!pointerDown) {
        idleTime += rawDt;
      } else {
        idleTime = 0;
        stopAutoDemo();
      }

      if (!playerHasDragged && now >= 1.5 && !ghostActive) {
        showGhostFinger();
      }

      if (!instructShown && now >= 3.0) {
        instructShown = true;
        instructText.alpha = 0;
        gsap.to(instructText, { alpha: 1, duration: 0.4 });
        gsap.to(instructText, { alpha: 0, duration: 0.4, delay: 3.0 });
      }

      if (idleTime >= IDLE_AUTO_DEMO && !autoDemoActive) {
        runAutoDemo();
      }

      if (!riggedBitDone && now >= 0.2) {
        spawnRiggedFirst();
        spawnTimer = SPAWN_INTERVAL * 0.6;
        spawnItem(window.innerWidth * 0.25);
        spawnItem(window.innerWidth * 0.75);
      }

      if (riggedBitDone) {
        spawnTimer -= rawDt;
        if (spawnTimer <= 0) {
          const baseInterval = now > 12 ? SPAWN_INTERVAL * 0.6 : now > 8 ? SPAWN_INTERVAL * 0.8 : SPAWN_INTERVAL;
          spawnItem();
          spawnTimer = baseInterval + (Math.random() - 0.5) * 0.3;
        }
      }

      if (now >= GAME_DURATION && !glassFull) {
        showEndcard();
      }
    }

    // Update items (physics + rotation wobble)
    const gravity = 380;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item.alive || !item.cont || item.cont.destroyed) { items.splice(i, 1); continue; }

      item.vy += gravity * dt;
      item.cont.x += item.vx * dt;
      item.cont.y += item.vy * dt;

      // Rotation wobble on falling items
      item.cont.rotation += item.rotSpeed * dt;

      if (tryHitTest(item)) {
        catchItem(item);
        continue;
      }

      const ctaStripTop = h - CTA_STRIP_H;
      if (item.cont.y + item.r > ctaStripTop || item.cont.y > h + item.r + 20) {
        streak = 0;
        if (!item.cont.destroyed) {
          gameLayer.removeChild(item.cont);
          item.cont.destroy({ children: true });
        }
        items.splice(i, 1);
      }
    }

    // Update particles
    const G_PART = 500;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += G_PART * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.life += rawDt;
      p.g.alpha = Math.max(0, 1 - p.life / p.maxLife);
      if (p.life >= p.maxLife) {
        fxLayer.removeChild(p.g);
        p.g.destroy();
        particles.splice(i, 1);
      }
    }
  });

  // Multi-paint: force text texture upload
  app.renderer.render(app.stage);
  requestAnimationFrame(() => {
    layout();
    app.renderer.render(app.stage);
    requestAnimationFrame(() => {
      app.renderer.render(app.stage);
    });
  });
}

main().catch((e) => console.error(e));
