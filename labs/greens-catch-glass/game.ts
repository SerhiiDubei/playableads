// greens-catch-glass — Brimful nutra playable (greybox, Stage 1).
// Mechanic: drag glass by X to catch falling greens/vitamins/berries.
// Rigged bit: first spawn is deterministic at glass start X (auto-catch ≤0.8s).
// Input-gate: spawning pauses until first player drag.
// Junk: boing bounce + glass shake, no penalty, never passes through.
// Golden vitamin: x2 fill + streak + sparkle.
// Near-miss slow-mo: only when finger is actually moving toward item on glass edge.
// Fill meter: masked rect in glass outline + GSAP tween.
// Endcard: always shown after ~20s or glass full — offer framed as standard promo.

import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
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

// Tunable params
const GLASS_W = Number(cfg.params.glassW ?? 90);
const GLASS_H = Number(cfg.params.glassH ?? 140);
const ITEM_R = Number(cfg.params.itemRadius ?? 22);
const SPAWN_INTERVAL = Number(cfg.params.spawnIntervalSec ?? 1.2);
const FALL_MIN = Number(cfg.params.fallSpeedMin ?? 180);
const FALL_MAX = Number(cfg.params.fallSpeedMax ?? 260);
const GOLDEN_CHANCE = Number(cfg.params.goldenChance ?? 0.12);
const JUNK_CHANCE = Number(cfg.params.junkChance ?? 0.18);
const NEAR_MISS_MARGIN = Number(cfg.params.nearMissMarginPx ?? 30);
const SLOW_MO_DUR = Number(cfg.params.slowMoDuration ?? 1.2);
const IDLE_AUTO_DEMO = Number(cfg.params.idleAutoDemoSec ?? 4.0);
const GAME_DURATION = Number(cfg.params.gameDurationSec ?? 22);

async function main(): Promise<void> {
  if (!window.FbPlayableAd) window.FbPlayableAd = { onCTAClick: () => {} };

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

  // ── Background: gradient-like sky + decorative circles ──────────────────────
  const bgGraphics = new Graphics();
  bgLayer.addChild(bgGraphics);
  function drawBg(w: number, h: number): void {
    bgGraphics.clear();
    // Dark teal background
    bgGraphics.rect(0, 0, w, h).fill(C_BG);
    // Subtle radial glow at top centre
    for (let i = 4; i >= 0; i--) {
      const r = w * (0.3 + i * 0.12);
      bgGraphics
        .circle(w / 2, h * 0.18, r)
        .fill({ color: 0x1a4a5e, alpha: 0.07 * (5 - i) });
    }
    // Decorative dots (ambient sparkle)
    const dots = [
      [0.1, 0.08], [0.88, 0.12], [0.06, 0.35], [0.93, 0.42],
      [0.15, 0.65], [0.85, 0.7], [0.05, 0.88], [0.92, 0.82],
    ];
    for (const [fx, fy] of dots) {
      bgGraphics.circle(w * fx, h * fy, 3 + Math.random() * 2).fill({ color: C_PRIMARY, alpha: 0.18 });
    }
  }

  // ── Glass container (drag input object) ─────────────────────────────────────
  const glassWrap = new Container();
  gameLayer.addChild(glassWrap);
  const glassBody = new Graphics();
  const glassFillContainer = new Container();
  const glassFillMaskG = new Graphics();
  const fillBar = new Graphics();
  glassFillContainer.addChild(fillBar);
  glassFillContainer.mask = glassFillMaskG;

  const glassShine = new Graphics();
  const glassOutline = new Graphics();
  glassWrap.addChild(glassBody, glassFillContainer, glassFillMaskG, glassShine, glassOutline);

  let fillLevel = 0; // 0..1

  function drawGlass(): void {
    const gw = GLASS_W, gh = GLASS_H;
    const bevel = 10;
    // Glass body (slightly transparent teal)
    glassBody.clear();
    glassBody
      .poly([-gw / 2, -gh / 2, gw / 2, -gh / 2, gw / 2 - bevel, gh / 2, -gw / 2 + bevel, gh / 2])
      .fill({ color: C_PRIMARY, alpha: 0.18 });
    // Fill mask (trapezoidal shape of inside glass)
    const iw = gw - 6, ih = gh - 6, ib = bevel;
    glassFillMaskG.clear();
    glassFillMaskG
      .poly([-iw / 2, -ih / 2, iw / 2, -ih / 2, iw / 2 - ib, ih / 2, -iw / 2 + ib, ih / 2])
      .fill({ color: 0xffffff });
    // Fill bar (water level rises from bottom)
    fillBar.clear();
    const fh = Math.max(0, ih * fillLevel);
    const fy = ih / 2 - fh;
    // Gradient-like liquid with stacked rects
    fillBar
      .rect(-iw / 2, fy, iw, fh)
      .fill({ color: C_PRIMARY, alpha: 0.7 });
    if (fh > 4) {
      fillBar
        .rect(-iw / 2, fy, iw, Math.min(fh, 6))
        .fill({ color: 0xffffff, alpha: 0.22 });
    }
    // Glass shine
    glassShine.clear();
    glassShine
      .poly([-gw / 2 + 6, -gh / 2, -gw / 2 + 18, -gh / 2, -gw / 2 + 14, gh / 2 - 10, -gw / 2 + 4, gh / 2 - 10])
      .fill({ color: 0xffffff, alpha: 0.14 });
    // Glass outline
    glassOutline.clear();
    glassOutline
      .poly([-gw / 2, -gh / 2, gw / 2, -gh / 2, gw / 2 - bevel, gh / 2, -gw / 2 + bevel, gh / 2])
      .stroke({ width: 3, color: C_PRIMARY, alpha: 0.9 });
    // Rim line (top of glass)
    glassOutline
      .moveTo(-gw / 2, -gh / 2)
      .lineTo(gw / 2, -gh / 2)
      .stroke({ width: 5, color: 0xffffff, alpha: 0.7 });
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
  type ItemKind = "green" | "golden" | "junk";
  interface Item {
    cont: Container;
    g: Graphics;
    kind: ItemKind;
    colorIdx: number;
    r: number;
    vy: number;
    vx: number;
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

  // Rainbow particles for glass full
  function spawnRainbowSplash(x: number, y: number): void {
    const colors = [0xFF6B6B, 0xFFD93D, 0x6BCB77, 0x4ECDC4, 0xC77DFF, 0xFFB627];
    for (let i = 0; i < 40; i++) {
      const color = colors[i % colors.length];
      spawnParticles(x, y, color, 1, true);
    }
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

  // Fill label (small, above glass rim)
  const fillLabel = new Text({
    text: "0%",
    style: { fill: C_PRIMARY, fontFamily: FONT, fontSize: 18, fontWeight: "700" },
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
    if (!playerHasDragged) {
      playerHasDragged = true;
      // Kill ghost finger and show instruction after 3s mark
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
      // Clamp glass to screen edges (half glass width from each side)
      glassX = Math.max(GLASS_W / 2 + 10, Math.min(w - GLASS_W / 2 - 10, glassX + dx));

      // Near-miss check: is there an item on the edge that the player is moving toward?
      if (gameRunning && !ended) {
        checkNearMiss(e.global.x, dx);
      }
    }
  });

  function checkNearMiss(fingerX: number, dx: number): void {
    const h = window.innerHeight;
    const glassYPos = h - GLASS_H / 2 - 88;
    const glassTop = glassYPos - GLASS_H / 2;
    for (const item of [...items]) {
      if (!item.alive || item.caught || !item.cont || item.cont.destroyed) continue;
      // Only trigger slow-mo when item is near glass level and finger is moving toward item
      const iy = item.cont.y;
      if (iy < glassTop - 60 || iy > glassTop + GLASS_H) continue;
      const ix = item.cont.x;
      const distFromEdge = Math.abs(ix - glassX) - GLASS_W / 2;
      // Item is just outside catch window
      if (distFromEdge > 0 && distFromEdge < NEAR_MISS_MARGIN) {
        // Finger moving toward item (dx and item offset share same sign)
        const towardItem = (ix > glassX && dx > 0) || (ix < glassX && dx < 0);
        if (towardItem && !item.isNearMiss) {
          item.isNearMiss = true;
          activateSlowMo(SLOW_MO_DUR);
        }
      }
    }
    void fingerX; // used in checkNearMiss signature
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

  // ── Item drawing helpers ──────────────────────────────────────────────────────
  function drawItem(g: Graphics, kind: ItemKind, colorIdx: number, r: number): void {
    g.clear();
    if (kind === "junk") {
      // Donut shape
      g.circle(0, 0, r).fill({ color: JUNK_COLOR });
      g.circle(0, 0, r * 0.45).fill({ color: C_BG }); // hole
      // Icing dribble
      g.circle(0, -r * 0.3, r * 0.35).fill({ color: 0xffffff, alpha: 0.85 });
    } else if (kind === "golden") {
      // Golden vitamin — star/capsule shape
      g.circle(0, 0, r).fill({ color: C_ACCENT });
      g.circle(0, 0, r * 0.65).fill({ color: 0xffffff, alpha: 0.3 });
      // Star points
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(ang) * r * 0.88;
        const py = Math.sin(ang) * r * 0.88;
        g.circle(px, py, r * 0.18).fill({ color: 0xffffff, alpha: 0.7 });
      }
      // Glow ring
      g.circle(0, 0, r + 5).stroke({ width: 3, color: C_ACCENT, alpha: 0.8 });
    } else {
      // Green item — circle with leaf-like cutout
      const col = ITEM_COLORS[colorIdx % ITEM_COLORS.length];
      g.circle(0, 0, r).fill({ color: col });
      // Leaf highlight
      g.circle(-r * 0.25, -r * 0.3, r * 0.35).fill({ color: 0xffffff, alpha: 0.22 });
      // Small stem nub
      g.rect(-2, -r - 4, 4, 7).fill({ color: col });
    }
  }

  // ── Spawn logic ───────────────────────────────────────────────────────────────
  function spawnItem(xOverride?: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Determine kind
    let kind: ItemKind = "green";
    const roll = Math.random();
    if (roll < JUNK_CHANCE) kind = "junk";
    else if (roll < JUNK_CHANCE + GOLDEN_CHANCE) kind = "golden";

    const colorIdx = Math.floor(Math.random() * ITEM_COLORS.length);
    const r = ITEM_R + (kind === "golden" ? 4 : 0);

    const cont = new Container();
    const g = new Graphics();
    drawItem(g, kind, colorIdx, r);
    cont.addChild(g);

    // Spawn position: either forced (rigged) or random
    const fromX = xOverride !== undefined ? xOverride : w * (0.12 + Math.random() * 0.76);
    cont.x = fromX;
    cont.y = -r - 10; // start above top

    gameLayer.addChild(cont);

    // Arc-based fall: items thrown from above with gravity
    // For a falling item, we use simple vy + gravity rather than makeArc
    // (items fall from above, not launched from below)
    const baseVy = FALL_MIN + Math.random() * (FALL_MAX - FALL_MIN);
    const vx = (Math.random() - 0.5) * 40;

    items.push({ cont, g, kind, colorIdx, r, vy: baseVy, vx, alive: true, isNearMiss: false, caught: false });
  }

  // Initial rigged spawn: exactly on glass start X, so auto-catch fires ≤0.8s
  function spawnRiggedFirst(): void {
    spawnItem(glassX);
    riggedBitDone = true;
  }

  // ── Glass squash-stretch on catch — scale proxy avoids Pixi ObservablePoint issues ──
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

  // Glass shake (boing for junk) — uses glassShine x offset to avoid disturbing glassWrap.x
  function shakeGlass(): void {
    gsap.killTweensOf(glassOutline);
    gsap.to(glassOutline, { x: 10, duration: 0.05, yoyo: true, repeat: 6, ease: "none", onComplete: () => { glassOutline.x = 0; } });
    gsap.to(glassShine, { x: 10, duration: 0.05, yoyo: true, repeat: 6, ease: "none", onComplete: () => { glassShine.x = 0; } });
  }

  // ── Catch detection ────────────────────────────────────────────────────────────
  function tryHitTest(item: Item): boolean {
    if (!item.cont || item.cont.destroyed) return false;
    const h = window.innerHeight;
    const glassYPos = h - GLASS_H / 2 - 88;   // glass center Y (matches layout)
    const glassTop = glassYPos - GLASS_H / 2;   // top of glass
    const ix = item.cont.x;
    const iy = item.cont.y;

    // Catch zone: item within glass X range and entering glass from top
    const inXRange = Math.abs(ix - glassX) < GLASS_W / 2 + item.r * 0.5;
    // Item must be at or below the rim and above the bottom of the glass
    const inYRange = iy >= glassTop - item.r * 0.5 && iy <= glassTop + GLASS_H * 0.7;

    return inXRange && inYRange;
  }

  function catchItem(item: Item): void {
    if (!item.alive || item.caught) return;
    item.caught = true;
    item.alive = false;

    const idx = items.indexOf(item);
    if (idx >= 0) items.splice(idx, 1);
    if (!item.cont.destroyed) {
      gameLayer.removeChild(item.cont);
      item.cont.destroy({ children: true });
    }

    if (item.kind === "junk") {
      // Boing — junk bounces off, glass shakes, no penalty
      spawnBoing(item.cont.x, item.cont.y);
      shakeGlass();
      return;
    }

    // Green or golden catch
    const fillIncrease = item.kind === "golden" ? 0.1 : 0.05;
    setFill(fillLevel + fillIncrease, true);

    const catchY = window.innerHeight - GLASS_H / 2 - 88 - GLASS_H / 2;
    spawnParticles(glassX, catchY, item.kind === "golden" ? C_ACCENT : C_PRIMARY, 10, true);
    squashGlass();

    streak++;

    if (item.kind === "golden") {
      showStreakBanner("x2 FILL!", C_ACCENT);
      // Extra sparkle ring
      spawnGoldenSpark(glassX, window.innerHeight - GLASS_H / 2 - 88 - GLASS_H / 2);
    } else if (streak >= 3) {
      showStreakBanner("Streak x" + streak + "!", C_PRIMARY);
    }

    // Update fill percentage label
    fillLabel.text = Math.round(fillLevel * 100) + "%";

    // Check glass full
    if (fillLevel >= 1 && !glassFull) {
      glassFull = true;
      triggerGlassFull();
    }
  }

  function spawnBoing(x: number, y: number): void {
    // Visual: donut shape bounces up and fades
    const boingG = new Graphics();
    boingG.circle(0, 0, ITEM_R).fill({ color: JUNK_COLOR, alpha: 0.85 });
    boingG.circle(0, 0, ITEM_R * 0.45).fill({ color: C_BG });
    boingG.x = x; boingG.y = y;
    fxLayer.addChild(boingG);
    const boingProxy = { s: 1 };
    gsap.timeline({
      onComplete: () => { if (!boingG.destroyed) { fxLayer.removeChild(boingG); boingG.destroy(); } },
    })
      .to(boingG, { y: y - 60, alpha: 0, duration: 0.5, ease: "power2.out" }, 0)
      .to(boingProxy, {
        s: 1.6, duration: 0.18, yoyo: true, repeat: 1, ease: "sine.inOut",
        onUpdate: () => { if (!boingG.destroyed) boingG.scale.set(boingProxy.s); },
      }, 0);
    // "boing" text pop
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

  function spawnGoldenSpark(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const tx = x + Math.cos(ang) * 55;
      const ty = y + Math.sin(ang) * 40;
      const star = new Graphics();
      star.circle(0, 0, 5).fill({ color: C_ACCENT });
      star.x = x; star.y = y; star.alpha = 0;
      fxLayer.addChild(star);
      gsap.timeline({
        onComplete: () => {
          if (!star.destroyed) { fxLayer.removeChild(star); star.destroy(); }
        },
      })
        .fromTo(star, { alpha: 0 }, { alpha: 1, x: tx, y: ty, duration: 0.4, ease: "power2.out" })
        .to(star, { alpha: 0, duration: 0.25 }, 0.3);
    }
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
    spawnRainbowSplash(glassX, h - GLASS_H / 2 - 88 - GLASS_H / 2);
    // Goal badges appear briefly
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
    // Goal framing label
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
    // Show endcard after brief celebration
    gsap.delayedCall(3.0, showEndcard);
  }

  // ── Endcard ───────────────────────────────────────────────────────────────────
  let endcardShown = false;
  function showEndcard(): void {
    if (endcardShown) return;
    endcardShown = true;
    ended = true;
    gameRunning = false;

    const w = window.innerWidth;
    const h = window.innerHeight;

    const ov = new Container();
    // Dark overlay
    const bg = new Graphics();
    bg.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.72 });
    ov.addChild(bg);

    // Panel
    const pw = Math.min(w - 40, 360), ph = Math.min(h * 0.72, 560);
    const panel = new Container();
    const panelBg = new Graphics();
    panelBg.roundRect(-pw / 2, -ph / 2, pw, ph, 24).fill({ color: num("#0f3248") });
    panelBg.roundRect(-pw / 2, -ph / 2, pw, ph, 24).stroke({ width: 4, color: C_PRIMARY });
    panel.addChild(panelBg);

    // Brand logo (procedural: glass icon + "Brimful")
    const logoG = new Graphics();
    const lw = 32, lh = 52;
    // Mini glass with smiley fill-line
    logoG
      .poly([-lw / 2, -lh / 2, lw / 2, -lh / 2, lw / 2 - 5, lh / 2, -lw / 2 + 5, lh / 2])
      .fill({ color: C_PRIMARY, alpha: 0.3 });
    logoG
      .poly([-lw / 2, -lh / 2, lw / 2, -lh / 2, lw / 2 - 5, lh / 2, -lw / 2 + 5, lh / 2])
      .stroke({ width: 3, color: C_PRIMARY });
    // Smile fill line (the B logo concept)
    logoG
      .arc(0, 0, lw * 0.42, 0.1, Math.PI - 0.1)
      .stroke({ width: 2.5, color: C_PRIMARY, alpha: 0.9 });
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

    // Tagline
    const tagline = new Text({
      text: "Fill up on good.",
      style: { fill: C_PRIMARY, fontFamily: FONT, fontSize: 18, fontWeight: "700", align: "center" },
    });
    tagline.anchor.set(0.5);
    tagline.y = -ph / 2 + 100;
    panel.addChild(tagline);

    // Main message
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

    // Sub text — offer context
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

    // CTA button (inside panel)
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

    // Results may vary
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

    // Disclaimer (FDA) — readable ≥10px on 360px wide
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

    // CTA is already visible and pulsing
  }

  // ── Ghost-finger hint (shown ≤1.5s) ──────────────────────────────────────────
  function showGhostFinger(): void {
    if (ghostActive) return;
    ghostActive = true;
    ghostFinger.alpha = 0.9;
    // Animate finger dragging left/right to suggest drag mechanic
    function loopGhost(): void {
      if (!ghostActive) return;
      const w = window.innerWidth;
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

  // ── Auto-demo: move glass automatically when player is idle ──────────────────
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

  // ── Layout ────────────────────────────────────────────────────────────────────
  function layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Canvas resize
    app.renderer.resize(w, h);
    app.canvas.style.width = w + "px";
    app.canvas.style.height = h + "px";

    // Update hit area
    app.stage.hitArea = new Rectangle(0, 0, w, h);

    drawBg(w, h);

    // Glass: centered initially if not yet positioned
    if (glassX === 0) glassX = w / 2;

    // Layout zones (from bottom):
    //   CTA band  : 72px  (h-72 to h)
    //   Glass zone: GLASS_H + 20px padding above CTA
    const ctaY = h - 44;                               // CTA center (44px from bottom edge)
    const glassYPos = h - GLASS_H / 2 - 88;           // glass center, above CTA band
    glassWrap.x = 0;
    glassWrap.y = glassYPos;

    // Brand (top left)
    brandBg.clear();
    brandBg.roundRect(0, -18, 120, 36, 9).fill({ color: num("#ffffff"), alpha: 0.1 });
    brandText.x = 14;
    brandText.y = 0;
    brandCont.x = 16;
    brandCont.y = 36;

    // Instruction text
    instructText.x = w / 2;
    instructText.y = h * 0.12;

    // Streak
    streakText.x = w / 2;
    streakText.y = h * 0.22;

    // Fill label
    fillLabel.x = glassX;
    fillLabel.y = glassYPos - GLASS_H / 2 - 20;

    // Ghost finger
    if (!ghostActive) {
      ghostFinger.x = glassX;
      ghostFinger.y = glassYPos - GLASS_H / 2 - 44;
    }

    // CTA (bottom thumb zone — always visible)
    drawCta(w);
    ctaCont.x = w / 2;
    ctaCont.y = ctaY;
  }

  layout();
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

    // Update glass wrap position to follow glassX
    const h = window.innerHeight;
    const glassYPos = h - GLASS_H / 2 - 88;
    glassWrap.x = glassX;
    glassWrap.y = glassYPos;
    // Also update fill label position
    fillLabel.x = glassX;
    fillLabel.y = glassYPos - GLASS_H / 2 - 20;

    if (gameRunning && !ended) {
      // Idle tracking
      if (!pointerDown) {
        idleTime += rawDt;
      } else {
        idleTime = 0;
        stopAutoDemo();
      }

      // Ghost finger: show at 1.5s if player hasn't dragged
      if (!playerHasDragged && now >= 1.5 && !ghostActive) {
        showGhostFinger();
      }

      // Instruction text: show after 3s hook
      if (!instructShown && now >= 3.0) {
        instructShown = true;
        instructText.alpha = 0;
        gsap.to(instructText, { alpha: 1, duration: 0.4 });
        gsap.to(instructText, { alpha: 0, duration: 0.4, delay: 3.0 });
      }

      // Auto-demo after IDLE_AUTO_DEMO seconds
      if (idleTime >= IDLE_AUTO_DEMO && !autoDemoActive && playerHasDragged) {
        runAutoDemo();
      }
      // Non-interacting users: auto demo from start after 5s
      if (!playerHasDragged && idleTime >= 5.0 && !autoDemoActive) {
        runAutoDemo();
      }

      // Spawning
      // Rigged first spawn: at 0.2s, exactly on glass position
      if (!riggedBitDone && now >= 0.2) {
        spawnRiggedFirst();
        spawnTimer = SPAWN_INTERVAL * 0.6; // second spawn sooner for dense hook
        // Also spawn 2 more items in the air immediately for hook density
        spawnItem(window.innerWidth * 0.25);
        spawnItem(window.innerWidth * 0.75);
      }

      // Regular spawning: gate on player having dragged (or auto-demo)
      if (riggedBitDone) {
        spawnTimer -= rawDt;
        if (spawnTimer <= 0) {
          // Escalation: spawn interval shrinks after 8s
          const baseInterval = now > 12 ? SPAWN_INTERVAL * 0.6 : now > 8 ? SPAWN_INTERVAL * 0.8 : SPAWN_INTERVAL;
          if (playerHasDragged || autoDemoActive) {
            spawnItem();
          }
          spawnTimer = baseInterval + (Math.random() - 0.5) * 0.3;
        }
      }

      // Game time limit
      if (now >= GAME_DURATION && !glassFull) {
        showEndcard();
      }
    }

    // Update items (physics)
    const gravity = 380;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item.alive || !item.cont || item.cont.destroyed) { items.splice(i, 1); continue; }

      item.vy += gravity * dt;
      item.cont.x += item.vx * dt;
      item.cont.y += item.vy * dt;

      // Hit test
      if (tryHitTest(item)) {
        catchItem(item);
        continue;
      }

      // Gone off screen
      if (item.cont.y > h + item.r + 20) {
        // Missed: reset streak
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

  // ── Second paint: Pixi v8 shader-race workaround ─────────────────────────────
  app.renderer.render(app.stage);
  requestAnimationFrame(() => {
    layout();
    app.renderer.render(app.stage);
  });
}

main().catch((e) => console.error(e));
