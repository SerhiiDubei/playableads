import { Application, Container, Graphics, Sprite, Texture, Assets, Text } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";
import { makeArc, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

declare global {
  interface Window { FbPlayableAd: { onCTAClick: () => void }; }
}

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }

const FONT = `${cfg.style.font.family}, 'Arial Black', system-ui, sans-serif`;
const COL_TEXT = cfg.style.colors.text;
const COL_PRIMARY = num(cfg.style.colors.primary);
const COL_ACCENT = num(cfg.style.colors.accent);

const FRUIT_KEYS = ["fruit1.webp", "fruit2.webp", "fruit3.webp", "fruit4.webp", "fruit5.webp", "fruit6.webp"];
const SPLAT_KEYS = ["splat1.webp", "splat2.webp", "splat3.webp", "splat4.webp"];
const FRUIT_COLORS: Record<string, number> = {
  "fruit1.webp": 0xff4d4d,
  "fruit2.webp": 0xff9c2a,
  "fruit3.webp": 0xffe24d,
  "fruit4.webp": 0x4dd24d,
  "fruit5.webp": 0x9b4dff,
  "fruit6.webp": 0xff3aa5,
};

type Special = "frenzy" | "freeze" | "double" | "pomegranate" | null;
const SPECIAL_GLOW: Record<string, number> = {
  frenzy: 0xff8a1e,
  freeze: 0x4dc3ff,
  double: 0xffd24d,
  pomegranate: 0xc23a8a,
};
const SPECIAL_LABEL: Record<string, string> = {
  frenzy: "FRENZY!",
  freeze: "FREEZE!",
  double: "DOUBLE!",
  pomegranate: "POMEGRANATE!",
};

let rngI = 0;
function rnd(): number { rngI++; return Math.random(); }

function sfx(k: string): void {
  try {
    const src = cfg.assets[k];
    if (!src) return;
    const a = new Audio(src);
    a.volume = 0.5;
    a.play().catch(() => {});
  } catch (_e) { /* ignore */ }
}

interface Fruit {
  node: Container;
  sp: Sprite;
  glow: Graphics | null;
  proj: ReturnType<typeof makeArc>;
  r: number;
  key: string;
  color: number;
  big: boolean;
  isBomb: boolean;
  special: Special;
  pomHits: number;
  dead: boolean;
}

interface Half {
  node: Container;
  vx: number;
  vy: number;
  vr: number;
  g: number;
  life: number;
  dead: boolean;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  max: number;
  dead: boolean;
}

interface Splat {
  sp: Sprite;
  dead: boolean;
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);

  // ── preload textures ──
  const tex: Record<string, Texture> = {};
  const keys = [...FRUIT_KEYS, "bomb.webp", "bg.webp", ...SPLAT_KEYS];
  for (const k of keys) {
    try { tex[k] = await Assets.load({ src: cfg.assets[k], format: "webp" }); }
    catch (_e) { tex[k] = Texture.WHITE; }
  }

  // ── layers ──
  const world = new Container();          // shaken + zoomed
  app.stage.addChild(world);

  const bgLayer = new Container();
  const splatLayer = new Container();
  const fruitLayer = new Container();
  const halvesLayer = new Container();
  const particleLayer = new Container();
  const bladeLayer = new Container();
  const uiLayer = new Container();        // sticky UI (not shaken)
  const overlayLayer = new Container();   // endcard / flashes
  world.addChild(bgLayer, splatLayer, fruitLayer, halvesLayer, particleLayer, bladeLayer);
  app.stage.addChild(uiLayer, overlayLayer);

  // game layers are NON-interactive (critical for stability)
  for (const l of [bgLayer, splatLayer, fruitLayer, halvesLayer, particleLayer, bladeLayer, overlayLayer]) {
    l.interactiveChildren = false;
    l.eventMode = "none";
  }

  // ── background (cover) ──
  const bg = new Sprite(tex["bg.webp"]);
  bg.anchor.set(0.5);
  bgLayer.addChild(bg);

  // ── flash overlay (bomb) ──
  const flash = new Graphics();
  flash.alpha = 0;
  overlayLayer.addChild(flash);

  // ── UI ──
  const scoreText = new Text({
    text: "0",
    style: { fontFamily: FONT, fontSize: 64, fontWeight: "900", fill: COL_TEXT, stroke: { color: 0x000000, width: 6 } },
  });
  scoreText.anchor.set(0, 0);
  uiLayer.addChild(scoreText);

  const livesText = new Text({
    text: "",
    style: { fontFamily: FONT, fontSize: 40, fontWeight: "900", fill: 0xff4d4d, stroke: { color: 0x000000, width: 5 } },
  });
  livesText.anchor.set(1, 0);
  uiLayer.addChild(livesText);

  const timerText = new Text({
    text: "",
    style: { fontFamily: FONT, fontSize: 34, fontWeight: "900", fill: COL_TEXT, stroke: { color: 0x000000, width: 5 } },
  });
  timerText.anchor.set(0.5, 0);
  uiLayer.addChild(timerText);

  // combo banner
  const comboText = new Text({
    text: "",
    style: { fontFamily: FONT, fontSize: 72, fontWeight: "900", fill: COL_ACCENT, stroke: { color: 0x000000, width: 8 } },
  });
  comboText.anchor.set(0.5);
  comboText.alpha = 0;
  uiLayer.addChild(comboText);

  // special banner
  const specialText = new Text({
    text: "",
    style: { fontFamily: FONT, fontSize: 60, fontWeight: "900", fill: 0xffffff, stroke: { color: 0x000000, width: 8 } },
  });
  specialText.anchor.set(0.5);
  specialText.alpha = 0;
  uiLayer.addChild(specialText);

  // ── sticky CTA (always visible, always works) ──
  const cta = new Container();
  cta.eventMode = "static";
  cta.cursor = "pointer";
  const ctaBg = new Graphics();
  const ctaLabel = new Text({
    text: cfg.copy.cta || "PLAY NOW",
    style: { fontFamily: FONT, fontSize: 38, fontWeight: "900", fill: 0xffffff },
  });
  ctaLabel.anchor.set(0.5);
  cta.addChild(ctaBg, ctaLabel);
  uiLayer.addChild(cta);
  function drawCta(w: number): void {
    ctaBg.clear();
    ctaBg.roundRect(-w / 2, -34, w, 68, 34).fill(COL_PRIMARY);
    ctaBg.roundRect(-w / 2, -34, w, 68, 34).stroke({ color: 0xffffff, width: 3, alpha: 0.85 });
  }
  function fireCTA(): void { window.FbPlayableAd.onCTAClick(); }
  cta.on("pointertap", fireCTA);
  gsap.to(cta.scale, { x: 1.06, y: 1.06, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });

  // ── tutorial hand ──
  const hand = new Container();
  const handG = new Graphics();
  handG.circle(0, 0, 26).fill({ color: 0xffffff, alpha: 0.9 });
  handG.circle(0, 0, 26).stroke({ color: 0x000000, width: 3 });
  const handHint = new Text({
    text: "Swipe to slice!",
    style: { fontFamily: FONT, fontSize: 40, fontWeight: "900", fill: 0xffffff, stroke: { color: 0x000000, width: 6 } },
  });
  handHint.anchor.set(0.5);
  hand.addChild(handG);
  uiLayer.addChild(handHint, hand);

  // ── state ──
  let W = app.screen.width, H = app.screen.height;
  const fruits: Fruit[] = [];
  const halves: Half[] = [];
  const particles: Particle[] = [];
  const splats: Splat[] = [];

  let score = 0;
  let lives = 3;
  let tScale = 1;          // slow-mo multiplier
  let gameTime = 0;
  const DURATION = 28;
  let running = true;
  let started = false;     // first swipe done

  // combo
  let comboCount = 0;
  let comboTimer = 0;
  const COMBO_WINDOW = 1.0;

  // per-swipe slice tracking (multi-cut in one stroke)
  let swipeSlices = 0;

  // timed modifiers
  let frenzyT = 0;
  let doubleT = 0;
  let freezeT = 0;

  // blade trail points
  interface TP { x: number; y: number; t: number; }
  const trail: TP[] = [];
  const bladeG = new Graphics();
  bladeLayer.addChild(bladeG);
  let pointerDown = false;
  let lastX = 0, lastY = 0, lastAngle = 0;

  const diff = new DifficultyController({ waitMax: 1.4, waitMin: 0.4, parallelMin: 2, parallelMax: 5, bombMin: 0.06, bombMax: 0.18 });
  let spawnTimer = 0.6;

  // ── pointer (ONLY stage listens) ──
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  function pointerStart(gx: number, gy: number): void {
    pointerDown = true;
    swipeSlices = 0;
    lastX = gx; lastY = gy;
    trail.length = 0;
    trail.push({ x: gx, y: gy, t: 0 });
  }
  function pointerMove(gx: number, gy: number): void {
    if (!pointerDown) return;
    const dx = gx - lastX, dy = gy - lastY;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.5) lastAngle = Math.atan2(dy, dx);
    trail.push({ x: gx, y: gy, t: 0 });
    if (trail.length > 24) trail.shift();
    if (!started && dist > 8) { started = true; hideHint(); }
    // manual hit-test along segment
    sliceSegment(lastX, lastY, gx, gy);
    lastX = gx; lastY = gy;
  }
  function pointerEnd(): void {
    pointerDown = false;
    swipeSlices = 0;
  }

  app.stage.on("pointerdown", (e) => { pointerStart(e.global.x, e.global.y); });
  app.stage.on("pointermove", (e) => { pointerMove(e.global.x, e.global.y); });
  app.stage.on("pointerup", pointerEnd);
  app.stage.on("pointerupoutside", pointerEnd);

  function hideHint(): void {
    gsap.to([hand, handHint], { alpha: 0, duration: 0.3, onComplete: () => { hand.visible = false; handHint.visible = false; } });
  }

  // distance from point P to segment AB
  function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + abx * t, cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
  }

  function sliceSegment(ax: number, ay: number, bx: number, by: number): void {
    for (let i = fruits.length - 1; i >= 0; i--) {
      const f = fruits[i];
      if (f.dead) continue;
      const wx = f.node.x, wy = f.node.y;
      const sc = world.scale.x || 1;
      const gxA = (ax - world.x) / sc, gyA = (ay - world.y) / sc;
      const gxB = (bx - world.x) / sc, gyB = (by - world.y) / sc;
      const d = distSeg(wx, wy, gxA, gyA, gxB, gyB);
      if (d < f.r * 0.95) {
        if (f.isBomb) { hitBomb(f); }
        else if (f.special === "pomegranate") { hitPom(f); }
        else { sliceFruit(f); }
      }
    }
  }

  // ── spawning ──
  function spawnWave(): void {
    const n = Math.max(1, diff.parallelCount());
    const cluster = gameTime < 3.2; // early: clustered easy combo
    const count = cluster ? Math.max(3, n) : n;
    const baseX = W * (0.25 + rnd() * 0.5);
    for (let i = 0; i < count; i++) {
      let isBomb = false;
      const bombsAllowed = gameTime > 7.5 && frenzyT <= 0;
      if (bombsAllowed && rnd() < diff.bombProbability()) isBomb = true;

      let special: Special = null;
      if (!isBomb && started && rnd() < 0.07) {
        const r = rnd();
        special = r < 0.3 ? "frenzy" : r < 0.55 ? "freeze" : r < 0.8 ? "double" : "pomegranate";
      }
      const fx = cluster
        ? baseX + (i - count / 2) * (W * 0.09)
        : W * (0.12 + rnd() * 0.76);
      spawnOne(fx, isBomb, special);
    }
    sfx("throw.wav");
  }

  function spawnOne(fromX: number, isBomb: boolean, special: Special): void {
    const node = new Container();
    let key = FRUIT_KEYS[Math.floor(rnd() * FRUIT_KEYS.length)];
    if (special === "pomegranate") key = "fruit6.webp";
    const texKey = isBomb ? "bomb.webp" : key;
    const color = isBomb ? 0x222222 : FRUIT_COLORS[key];

    const big = !isBomb && special !== "pomegranate" && rnd() < 0.22;
    const baseR = Math.min(W, H) * (isBomb ? 0.075 : 0.085);
    const r = baseR * (big ? 1.45 : special === "pomegranate" ? 1.5 : 1);

    let glow: Graphics | null = null;
    if (special) {
      glow = new Graphics();
      const gc = SPECIAL_GLOW[special];
      glow.circle(0, 0, r * 1.25).stroke({ color: gc, width: 6, alpha: 0.9 });
      glow.circle(0, 0, r * 1.45).stroke({ color: gc, width: 3, alpha: 0.5 });
      node.addChild(glow);
      gsap.to(glow.scale, { x: 1.12, y: 1.12, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }

    const sp = new Sprite(tex[texKey]);
    sp.anchor.set(0.5);
    const tw = sp.texture.width || 1;
    sp.scale.set((r * 2) / tw);
    node.addChild(sp);

    const clampX = Math.max(W * 0.12, Math.min(W * 0.88, fromX));
    node.x = clampX;
    node.y = H + r;

    const aloft = 2.4 + rnd() * 0.5;
    const apex = 0.62 + rnd() * 0.12;
    const proj = makeArc({
      fromX: clampX,
      fromY: H + r,
      screenH: H,
      timeAloftSec: aloft,
      apexFraction: apex,
      angleDeg: randomLaunchAngle(rnd()),
      spinRadPerSec: (rnd() - 0.5) * 3.5,
    });

    fruitLayer.addChild(node);
    fruits.push({ node, sp, glow, proj, r, key, color, big, isBomb, special, pomHits: 0, dead: false });
  }

  // ── slicing fruit (halves via mask along swipe angle) ──
  function sliceFruit(f: Fruit): void {
    if (f.dead) return;
    f.dead = true;

    const angle = lastAngle;
    const x = f.node.x, y = f.node.y;
    const baseRot = f.sp.rotation;
    makeHalves(f.key, x, y, f.r, angle, baseRot, f.big);
    spawnParticles(x, y, f.color, f.big ? 22 : 14);
    addSplat(x, y, f.color);
    sfx("slice.wav");

    // scoring + combo
    swipeSlices++;
    comboCount++;
    comboTimer = COMBO_WINDOW;
    diff.recordHit();

    let mult = 1;
    if (comboCount >= 3) mult = comboCount >= 6 ? 3 : 2;
    if (doubleT > 0) mult *= 2;
    const pts = (f.big ? 20 : 10) * mult;
    score += pts;
    bumpScore();

    if (swipeSlices >= 3 || comboCount >= 3) {
      showCombo(Math.max(swipeSlices, comboCount), mult);
      sfx("combo.wav");
    }
    // slow-mo on big combo or big fruit
    if (swipeSlices >= 3 || f.big) triggerSlowMo();

    handleSpecial(f.special);
  }

  function hitPom(f: Fruit): void {
    if (f.dead) return;
    f.pomHits++;
    score += 15;
    bumpScore();
    spawnParticles(f.node.x, f.node.y, f.color, 10);
    addSplat(f.node.x, f.node.y, f.color);
    sfx("slice.wav");
    gsap.fromTo(f.node.scale, { x: f.node.scale.x * 1.18, y: f.node.scale.y * 1.18 }, { x: f.node.scale.x, y: f.node.scale.y, duration: 0.18 });
    if (f.pomHits >= 6) {
      f.dead = true;
      makeHalves(f.key, f.node.x, f.node.y, f.r, lastAngle, f.sp.rotation, true);
      spawnParticles(f.node.x, f.node.y, f.color, 30);
      showSpecial("POMEGRANATE!", SPECIAL_GLOW.pomegranate);
      triggerSlowMo(true);
      sfx("combo.wav");
    }
  }

  function handleSpecial(s: Special): void {
    if (!s) return;
    showSpecial(SPECIAL_LABEL[s], SPECIAL_GLOW[s]);
    if (s === "frenzy") {
      frenzyT = 5;
      // clear flying bombs
      for (let i = fruits.length - 1; i >= 0; i--) {
        if (fruits[i].isBomb && !fruits[i].dead) { removeFruit(fruits[i]); }
      }
    } else if (s === "freeze") {
      freezeT = 3;
    } else if (s === "double") {
      doubleT = 5;
    }
  }

  function makeHalves(key: string, x: number, y: number, r: number, angle: number, baseRot: number, big: boolean): void {
    const t = tex[key];
    const scale = (r * 2) / (t.width || 1);
    const sep = r * 0.12;
    for (const side of [1, -1]) {
      const node = new Container();
      node.x = x + Math.cos(angle + Math.PI / 2) * sep * side;
      node.y = y + Math.sin(angle + Math.PI / 2) * sep * side;
      node.rotation = angle;

      const sp = new Sprite(t);
      sp.anchor.set(0.5);
      sp.scale.set(scale);
      sp.rotation = baseRot - angle; // keep original look

      const mask = new Graphics();
      if (side === 1) mask.rect(-r * 1.6, 0, r * 3.2, r * 1.8).fill(0xffffff);
      else mask.rect(-r * 1.6, -r * 1.8, r * 3.2, r * 1.8).fill(0xffffff);
      node.addChild(sp, mask);
      sp.mask = mask;

      halvesLayer.addChild(node);
      const perp = angle + Math.PI / 2;
      const sp2 = (160 + rnd() * 120) * (big ? 1.2 : 1);
      halves.push({
        node,
        vx: Math.cos(perp) * sp2 * side + Math.cos(angle) * (rnd() - 0.5) * 60,
        vy: Math.sin(perp) * sp2 * side - 120,
        vr: (rnd() - 0.5) * 4,
        g: 900,
        life: 1.3,
        dead: false,
      });
    }
  }

  function spawnParticles(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const g = new Graphics();
      const rr = 3 + rnd() * 6;
      g.circle(0, 0, rr).fill({ color, alpha: 0.95 });
      g.x = x; g.y = y;
      particleLayer.addChild(g);
      const a = rnd() * Math.PI * 2;
      const sp = 120 + rnd() * 320;
      particles.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: 0, max: 0.5 + rnd() * 0.4, dead: false });
    }
  }

  function addSplat(x: number, y: number, color: number): void {
    const k = SPLAT_KEYS[Math.floor(rnd() * SPLAT_KEYS.length)];
    const sp = new Sprite(tex[k]);
    sp.anchor.set(0.5);
    sp.x = x; sp.y = y;
    sp.rotation = rnd() * Math.PI * 2;
    const sc = 0.4 + rnd() * 0.5;
    sp.scale.set(((Math.min(W, H) * 0.28) / (sp.texture.width || 1)) * sc);
    sp.tint = color;
    sp.alpha = 0.45;
    splatLayer.addChild(sp);
    splats.push({ sp, dead: false });
    if (splats.length > 45) {
      const old = splats.shift();
      if (old) { splatLayer.removeChild(old.sp); old.sp.destroy(); }
    }
  }

  // ── bomb (soft penalty, never ends game) ──
  function hitBomb(f: Fruit): void {
    if (f.dead) return;
    f.dead = true;
    const bx = f.node.x, by = f.node.y;
    removeFruit(f);
    sfx("bomb.wav");
    spawnParticles(bx, by, 0xff5522, 26);
    score = Math.max(0, score - 15);
    bumpScore();
    if (lives > 0) lives--;
    diff.recordBombHit();
    comboCount = 0;
    comboTimer = 0;
    // shake + red flash
    shake(18, 0.4);
    flash.clear();
    flash.rect(0, 0, W, H).fill({ color: 0xff2020 });
    flash.alpha = 0;
    gsap.to(flash, { alpha: 0.5, duration: 0.06, yoyo: true, repeat: 1 });
    updLives();
  }

  function shake(amount: number, dur: number): void {
    const obj = { v: amount };
    gsap.to(obj, {
      v: 0, duration: dur, ease: "power2.out",
      onUpdate: () => { world.x = (rnd() - 0.5) * obj.v * 2; world.y = (rnd() - 0.5) * obj.v * 2; },
      onComplete: () => { world.x = 0; world.y = 0; },
    });
  }

  const slowObj = { s: 1 };
  function triggerSlowMo(strong = false): void {
    tScale = strong ? 0.3 : 0.35;
    gsap.killTweensOf(slowObj);
    slowObj.s = tScale;
    gsap.to(slowObj, { s: 1, duration: strong ? 0.7 : 0.45, ease: "power2.in", onUpdate: () => { tScale = slowObj.s; } });
    gsap.to(world.scale, { x: 1.05, y: 1.05, duration: 0.18, yoyo: true, repeat: 1, ease: "sine.inOut" });
  }

  // ── UI helpers ──
  function bumpScore(): void {
    scoreText.text = String(score);
    gsap.fromTo(scoreText.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.25, ease: "back.out(3)" });
  }
  function updLives(): void {
    livesText.text = "❤".repeat(Math.max(0, lives)) + "·".repeat(Math.max(0, 3 - lives));
  }
  function showCombo(n: number, mult: number): void {
    comboText.text = `Combo x${n}!  ×${mult}`;
    comboText.x = W / 2; comboText.y = H * 0.34;
    gsap.killTweensOf(comboText);
    gsap.killTweensOf(comboText.scale);
    comboText.alpha = 1;
    gsap.fromTo(comboText.scale, { x: 0.5, y: 0.5 }, { x: 1, y: 1, duration: 0.3, ease: "back.out(3)" });
    gsap.to(comboText, { alpha: 0, duration: 0.5, delay: 0.7 });
  }
  function showSpecial(label: string, color: number): void {
    specialText.text = label;
    specialText.style.fill = color;
    specialText.x = W / 2; specialText.y = H * 0.5;
    gsap.killTweensOf(specialText);
    gsap.killTweensOf(specialText.scale);
    specialText.alpha = 1;
    gsap.fromTo(specialText.scale, { x: 0.4, y: 0.4 }, { x: 1.1, y: 1.1, duration: 0.35, ease: "back.out(3)" });
    gsap.to(specialText, { alpha: 0, duration: 0.5, delay: 0.9 });
  }

  // ── removal ──
  function removeFruit(f: Fruit): void {
    const idx = fruits.indexOf(f);
    if (idx >= 0) fruits.splice(idx, 1);
    if (f.glow) gsap.killTweensOf(f.glow.scale);
    fruitLayer.removeChild(f.node);
    f.node.destroy({ children: true });
  }

  // ── blade trail render ──
  function drawBlade(): void {
    bladeG.clear();
    if (trail.length < 2) return;
    const ox = world.x, oy = world.y;
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      const tt = i / trail.length;
      const w = 2 + tt * 16;
      bladeG.moveTo(a.x - ox, a.y - oy).lineTo(b.x - ox, b.y - oy)
        .stroke({ color: 0xffffff, width: w, alpha: 0.15 + tt * 0.6, cap: "round" });
    }
    // bright core
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      const tt = i / trail.length;
      bladeG.moveTo(a.x - ox, a.y - oy).lineTo(b.x - ox, b.y - oy)
        .stroke({ color: 0xeaf6ff, width: 1 + tt * 5, alpha: 0.2 + tt * 0.7, cap: "round" });
    }
  }

  // ── endcard ──
  function finish(): void {
    if (!running) return;
    running = false;
    sfx("combo.wav");
    const ov = new Container();
    const dim = new Graphics();
    dim.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.72 });
    ov.addChild(dim);

    const title = new Text({
      text: cfg.copy.title || "Fruit Ninja",
      style: { fontFamily: FONT, fontSize: 64, fontWeight: "900", fill: COL_TEXT, stroke: { color: 0x000000, width: 6 }, align: "center" },
    });
    title.anchor.set(0.5);
    title.x = W / 2; title.y = H * 0.32;
    ov.addChild(title);

    const sc = new Text({
      text: `SCORE\n${score}`,
      style: { fontFamily: FONT, fontSize: 56, fontWeight: "900", fill: COL_ACCENT, stroke: { color: 0x000000, width: 6 }, align: "center" },
    });
    sc.anchor.set(0.5);
    sc.x = W / 2; sc.y = H * 0.5;
    ov.addChild(sc);

    overlayLayer.addChild(ov);
    gsap.fromTo(ov, { alpha: 0 }, { alpha: 1, duration: 0.4 });
    gsap.fromTo(sc.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.5, ease: "back.out(2.5)", delay: 0.2 });
    // bring CTA to very front + grow
    uiLayer.removeChild(cta);
    overlayLayer.addChild(cta);
    gsap.killTweensOf(cta.scale);
    gsap.to(cta.scale, { x: 1.18, y: 1.18, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // ── layout ──
  function layout(): void {
    W = app.screen.width; H = app.screen.height;
    app.stage.hitArea = app.screen;

    // bg cover
    const bw = bg.texture.width || 1, bh = bg.texture.height || 1;
    const s = Math.max(W / bw, H / bh);
    bg.scale.set(s);
    bg.x = W / 2; bg.y = H / 2;

    scoreText.x = 24; scoreText.y = 20;
    livesText.x = W - 24; livesText.y = 24;
    timerText.x = W / 2; timerText.y = 26;

    drawCta(Math.min(W * 0.8, 420));
    cta.x = W / 2; cta.y = H - 56;

    handHint.x = W / 2; handHint.y = H * 0.62;
    comboText.x = W / 2; specialText.x = W / 2;

    flash.clear();
  }
  layout();
  window.addEventListener("resize", layout);
  updLives();

  // start hint animation (hand swipe demo)
  function runHint(): void {
    if (started) return;
    hand.visible = true; handHint.visible = true;
    hand.alpha = 1; handHint.alpha = 1;
    gsap.killTweensOf(hand);
    hand.x = W * 0.35; hand.y = H * 0.55;
    gsap.to(hand, {
      x: W * 0.65, y: H * 0.45, duration: 0.9, ease: "sine.inOut", repeat: -1, yoyo: true,
    });
  }
  runHint();

  function fadeTrail(dt: number): void {
    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].t += dt;
      if (trail[i].t > 0.2) trail.splice(i, 1);
    }
  }

  // ── main ticker ──
  app.ticker.add(() => {
    const rawDt = Math.min(app.ticker.deltaMS / 1000, 0.05);
    if (!running) { fadeTrail(rawDt); drawBlade(); return; }

    let dt = rawDt * tScale;
    if (freezeT > 0) { dt *= 0.45; freezeT -= rawDt; }

    gameTime += rawDt;
    const remain = Math.max(0, DURATION - gameTime);
    timerText.text = Math.ceil(remain) + "s";
    if (gameTime >= DURATION) { finish(); return; }

    // timed modifiers
    if (frenzyT > 0) frenzyT -= rawDt;
    if (doubleT > 0) doubleT -= rawDt;

    // combo decay
    if (comboTimer > 0) { comboTimer -= rawDt; if (comboTimer <= 0) comboCount = 0; }

    // spawning
    spawnTimer -= rawDt;
    if (spawnTimer <= 0) {
      spawnWave();
      let wait = diff.spawnWaitSec();
      if (frenzyT > 0) wait *= 0.3;
      if (gameTime < 3) wait = 1.0;
      spawnTimer = Math.max(0.25, wait);
    }

    // fruits
    for (let i = fruits.length - 1; i >= 0; i--) {
      const f = fruits[i];
      if (f.dead) { removeFruit(f); continue; }
      f.proj.update(dt);
      f.node.x = f.proj.x;
      f.node.y = f.proj.y;
      f.sp.rotation = f.proj.rotation;
      if (f.proj.done || f.node.y > H + f.r * 2.5) {
        if (!f.isBomb && f.special !== "pomegranate") diff.recordMiss();
        removeFruit(f);
      }
    }

    // halves
    for (let i = halves.length - 1; i >= 0; i--) {
      const h = halves[i];
      h.vy += h.g * dt;
      h.node.x += h.vx * dt;
      h.node.y += h.vy * dt;
      h.node.rotation += h.vr * dt;
      h.life -= rawDt;
      if (h.life < 0.4) h.node.alpha = Math.max(0, h.life / 0.4);
      if (h.life <= 0 || h.node.y > H + 200) {
        halvesLayer.removeChild(h.node);
        h.node.destroy({ children: true });
        halves.splice(i, 1);
      }
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 700 * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.life += rawDt;
      p.g.alpha = Math.max(0, 1 - p.life / p.max);
      if (p.life >= p.max) {
        particleLayer.removeChild(p.g);
        p.g.destroy();
        particles.splice(i, 1);
      }
    }

    // splats slowly fade (persist, don't vanish)
    for (let i = splats.length - 1; i >= 0; i--) {
      const s = splats[i];
      if (s.sp.alpha > 0.12) s.sp.alpha -= 0.01 * rawDt;
    }

    fadeTrail(rawDt);
    drawBlade();
  });
}
void main();
