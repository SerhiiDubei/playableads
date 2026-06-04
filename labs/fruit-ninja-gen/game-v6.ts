import { Application, Container, Graphics, Sprite, Texture, Assets, Text, Point } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";
import { makeArc, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

declare global {
  interface Window {
    FbPlayableAd: { onCTAClick: () => void };
  }
}

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }

const FONT = `${cfg.style.font.family}, 'Arial Black', system-ui, sans-serif`;
const COL_TEXT = cfg.style.colors.text;
const COL_ACCENT = num(cfg.style.colors.accent);

const FRUIT_KEYS = ["fruit1.webp", "fruit2.webp", "fruit3.webp", "fruit4.webp", "fruit5.webp", "fruit6.webp"];
const FRUIT_COLORS: Record<string, number> = {
  "fruit1.webp": 0xff4d4d,
  "fruit2.webp": 0xff9c2a,
  "fruit3.webp": 0xffe24d,
  "fruit4.webp": 0x4dd24d,
  "fruit5.webp": 0x9b4dff,
  "fruit6.webp": 0xff3aa5,
};
type Special = "frenzy" | "freeze" | "double" | "pomegranate";
const SPECIAL_GLOW: Record<Special, number> = {
  frenzy: 0xff8a1e,
  freeze: 0x4dc3ff,
  double: 0xffd24d,
  pomegranate: 0xc23a8a,
};

interface Fruit {
  node: Container;
  sp: Sprite;
  proj: ReturnType<typeof makeArc>;
  r: number;
  kind: "fruit" | "bomb";
  special: Special | null;
  color: number;
  texKey: string;
  scale: number;
  sliced: boolean;
}

function sfx(k: string): void {
  if (!cfg.assets[k]) return;
  try {
    const a = new Audio(cfg.assets[k]);
    a.volume = 0.5;
    void a.play().catch(() => {});
  } catch { /* ignore */ }
}

function segPointDist(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);

  // ── Preload textures ──────────────────────────────────────────────────────
  const tex: Record<string, Texture> = {};
  for (const k of [...FRUIT_KEYS, "bomb.webp", "bg.webp"]) {
    if (cfg.assets[k]) {
      try { tex[k] = await Assets.load({ src: cfg.assets[k], format: "webp" }); } catch { /* ignore */ }
    }
  }

  // ── Layers ───────────────────────────────────────────────────────────────
  const world = new Container();        // bg + stains + game (zoomable)
  const bgSprite = new Sprite(tex["bg.webp"]);
  const bgFallback = new Graphics();
  const stainLayer = new Container();   // accumulating juice stains
  const gameLayer = new Container();    // fruits, halves, particles
  world.addChild(bgFallback, bgSprite, stainLayer, gameLayer);
  const trailLayer = new Container();   // blade trail (screen space)
  const uiLayer = new Container();      // HUD + sticky CTA + endcard
  app.stage.addChild(world, trailLayer, uiLayer);

  world.interactiveChildren = false;
  stainLayer.interactiveChildren = false;
  gameLayer.interactiveChildren = false;
  trailLayer.interactiveChildren = false;
  bgSprite.anchor.set(0.5);
  if (!tex["bg.webp"]) bgSprite.visible = false;

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // ── State ──────────────────────────────────────────────────────────────────
  const diff = new DifficultyController();
  const fruits: Fruit[] = [];
  const timeScale = { v: 1 };
  let gameTime = 0;
  let spawnTimer = 0.4;
  let frenzyTimer = 0;
  let doubleTimer = 0;
  let comboCount = 0;
  let comboTimer = 0;
  let swipeSlices = 0;
  let score = 0;
  let lives = Number(cfg.params.lives ?? 3);
  let firstSliceDone = false;
  let finished = false;
  const GAME_DURATION = Number(cfg.params.durationSec ?? 27);

  // ── HUD ──────────────────────────────────────────────────────────────────
  const scoreText = new Text({
    text: "0",
    style: { fill: COL_TEXT, fontFamily: FONT, fontWeight: "900", fontSize: 40,
      dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.6, angle: Math.PI / 2 } },
  });
  scoreText.anchor.set(1, 0);
  uiLayer.addChild(scoreText);

  const scoreLabel = new Text({
    text: "SCORE", style: { fill: COL_TEXT, fontFamily: FONT, fontSize: 13, letterSpacing: 2, fontWeight: "700" },
  });
  scoreLabel.anchor.set(1, 0);
  scoreLabel.alpha = 0.7;
  uiLayer.addChild(scoreLabel);

  const titleText = new Text({
    text: cfg.copy.title,
    style: { fill: COL_ACCENT, fontFamily: FONT, fontWeight: "900", fontSize: 22, letterSpacing: 1, align: "center" },
  });
  titleText.anchor.set(0.5, 0);
  uiLayer.addChild(titleText);

  // Lives (hearts)
  const heartsBox = new Container();
  uiLayer.addChild(heartsBox);
  const hearts: Graphics[] = [];
  function drawHeart(g: Graphics, s: number, color: number): void {
    g.moveTo(0, s * 0.35)
      .bezierCurveTo(-s, -s * 0.35, -s * 0.55, -s, 0, -s * 0.25)
      .bezierCurveTo(s * 0.55, -s, s, -s * 0.35, 0, s * 0.35)
      .fill({ color });
  }
  for (let i = 0; i < 3; i++) {
    const g = new Graphics();
    drawHeart(g, 13, 0xff3a5a);
    g.x = i * 34;
    heartsBox.addChild(g);
    hearts.push(g);
  }
  function refreshHearts(): void {
    for (let i = 0; i < hearts.length; i++) hearts[i].alpha = i < lives ? 1 : 0.18;
  }
  refreshHearts();

  // Banner (combo / special callouts)
  const bannerText = new Text({
    text: "", style: { fill: 0xffe24d, fontFamily: FONT, fontWeight: "900", fontSize: 44, letterSpacing: 1,
      dropShadow: { color: 0x000000, blur: 6, distance: 2, alpha: 0.7, angle: Math.PI / 2 } },
  });
  bannerText.anchor.set(0.5);
  bannerText.alpha = 0;
  uiLayer.addChild(bannerText);
  function showBanner(text: string, color: number): void {
    bannerText.text = text;
    bannerText.style.fill = color;
    gsap.killTweensOf(bannerText);
    gsap.killTweensOf(bannerText.scale);
    bannerText.alpha = 1;
    bannerText.scale.set(0.5);
    gsap.to(bannerText.scale, { x: 1, y: 1, duration: 0.3, ease: "back.out(2.5)" });
    gsap.to(bannerText, { alpha: 0, duration: 0.5, delay: 0.7, ease: "power2.in" });
  }

  // First-action hint
  const hint = new Container();
  const hintHand = new Graphics();
  hintHand.circle(0, 0, 16).fill({ color: 0xffffff, alpha: 0.95 });
  hintHand.roundRect(-5, -2, 10, 26, 5).fill({ color: 0xffffff, alpha: 0.95 });
  const hintText = new Text({
    text: "Swipe to slice!", style: { fill: COL_TEXT, fontFamily: FONT, fontWeight: "900", fontSize: 26 },
  });
  hintText.anchor.set(0.5);
  hint.addChild(hintText, hintHand);
  uiLayer.addChild(hint);
  function layoutHint(): void {
    const W = app.screen.width, H = app.screen.height;
    hintText.position.set(0, -40);
    hint.position.set(W / 2, H * 0.5);
    gsap.killTweensOf(hintHand);
    hintHand.position.set(-70, 0);
    gsap.to(hintHand, { x: 70, duration: 0.9, repeat: -1, yoyo: true, ease: "sine.inOut" });
  }
  function hideHint(): void {
    if (!hint.visible) return;
    gsap.killTweensOf(hintHand);
    gsap.to(hint, { alpha: 0, duration: 0.3, onComplete: () => { hint.visible = false; } });
  }

  // Sticky CTA
  function onCTA(): void {
    try { window.FbPlayableAd.onCTAClick(); } catch { /* ignore */ }
  }
  const ctaBtn = new Container();
  const ctaBg = new Graphics();
  const ctaLabel = new Text({
    text: cfg.copy.cta, style: { fill: 0xffffff, fontFamily: FONT, fontWeight: "900", fontSize: 24, letterSpacing: 1 },
  });
  ctaLabel.anchor.set(0.5);
  ctaBtn.addChild(ctaBg, ctaLabel);
  ctaBtn.eventMode = "static";
  ctaBtn.cursor = "pointer";
  ctaBtn.on("pointertap", onCTA);
  uiLayer.addChild(ctaBtn);
  gsap.to(ctaBtn.scale, { x: 1.05, y: 1.05, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" });

  // Blade trail
  const trailG = new Graphics();
  trailLayer.addChild(trailG);
  const trail: { x: number; y: number; t: number }[] = [];

  // ── FX helpers ─────────────────────────────────────────────────────────────
  function flashOverlay(color: number, alpha: number): void {
    const g = new Graphics().rect(0, 0, app.screen.width, app.screen.height).fill({ color, alpha });
    uiLayer.addChildAt(g, 0);
    gsap.to(g, { alpha: 0, duration: 0.4, onComplete: () => { uiLayer.removeChild(g); g.destroy(); } });
  }
  function shake(intensity: number, dur: number): void {
    const bx = app.screen.width / 2, by = app.screen.height / 2;
    const tl = gsap.timeline({ onComplete: () => world.position.set(bx, by) });
    for (let i = 0; i < 6; i++) {
      tl.to(world.position, { x: bx + (Math.random() - 0.5) * intensity * 2, y: by + (Math.random() - 0.5) * intensity * 2, duration: dur / 7, ease: "none" });
    }
    tl.to(world.position, { x: bx, y: by, duration: dur / 7, ease: "none" });
  }
  function slowMo(zoomOut: boolean): void {
    gsap.killTweensOf(timeScale);
    gsap.to(timeScale, { v: 0.35, duration: 0.1 });
    gsap.to(timeScale, { v: 1, duration: 0.5, delay: 0.4 });
    const s = zoomOut ? 0.93 : 1.05;
    gsap.to(world.scale, { x: s, y: s, duration: 0.15 });
    gsap.to(world.scale, { x: 1, y: 1, duration: 0.5, delay: 0.4 });
  }
  function juice(x: number, y: number, color: number): void {
    for (let i = 0; i < 10; i++) {
      const d = new Graphics().circle(0, 0, 3 + Math.random() * 4).fill({ color });
      d.position.set(x, y);
      gameLayer.addChild(d);
      const ang = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 70;
      gsap.to(d, { x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist + 50, alpha: 0,
        duration: 0.5 + Math.random() * 0.3, ease: "power2.out",
        onComplete: () => { gameLayer.removeChild(d); d.destroy(); } });
    }
  }
  const stains: Graphics[] = [];
  function stain(x: number, y: number, color: number): void {
    const g = new Graphics();
    for (let i = 0; i < 5; i++) {
      const ox = (Math.random() - 0.5) * 55, oy = (Math.random() - 0.5) * 55, rr = 8 + Math.random() * 16;
      g.circle(ox, oy, rr).fill({ color, alpha: 0.5 });
    }
    g.position.set(x, y);
    g.alpha = 0.45;
    stainLayer.addChild(g);
    stains.push(g);
    gsap.to(g, { alpha: 0.18, duration: 8, ease: "power1.out" });
    if (stains.length > 50) {
      const old = stains.shift();
      if (old) { gsap.killTweensOf(old); stainLayer.removeChild(old); old.destroy(); }
    }
  }
  function spawnHalves(texture: Texture | undefined, x: number, y: number, cutAngle: number, scale: number): void {
    if (!texture) return;
    const cont = new Container();
    cont.position.set(x, y);
    cont.rotation = cutAngle;
    gameLayer.addChild(cont);
    const big = 600;
    for (const side of [-1, 1]) {
      const wrap = new Container();
      const sp = new Sprite(texture);
      sp.anchor.set(0.5);
      sp.scale.set(scale);
      const mask = new Graphics();
      if (side < 0) mask.rect(-big, -big, big * 2, big).fill({ color: 0xffffff });
      else mask.rect(-big, 0, big * 2, big).fill({ color: 0xffffff });
      sp.mask = mask;
      wrap.addChild(sp, mask);
      cont.addChild(wrap);
      const sep = (22 + Math.random() * 22) * side;
      gsap.to(wrap, { y: sep, x: (Math.random() - 0.5) * 24, rotation: (Math.random() - 0.5) * 0.7, duration: 0.7, ease: "power1.out" });
      gsap.to(wrap, { alpha: 0, duration: 0.5, delay: 0.45 });
    }
    gsap.to(cont, { y: y + 240, duration: 0.9, ease: "power1.in",
      onComplete: () => { gameLayer.removeChild(cont); cont.destroy({ children: true }); } });
  }
  function bombExplode(x: number, y: number): void {
    flashOverlay(0xff2a2a, 0.55);
    shake(16, 0.45);
    sfx("bomb.wav");
    for (let i = 0; i < 20; i++) {
      const c = i % 2 ? 0xff7e2e : 0x222222;
      const g = new Graphics().circle(0, 0, 4 + Math.random() * 7).fill({ color: c });
      g.position.set(x, y);
      gameLayer.addChild(g);
      const ang = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 130;
      gsap.to(g, { x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist, alpha: 0, duration: 0.6, ease: "power2.out",
        onComplete: () => { gameLayer.removeChild(g); g.destroy(); } });
    }
    if (lives > 0) { lives--; refreshHearts(); }
    score = Math.max(0, score - 20);
    scoreText.text = String(score);
    floatText(x, y, "-20", 0xff3a5a, 22);
    comboCount = 0; comboTimer = 0;
  }
  function floatText(x: number, y: number, text: string, color: number, size: number): void {
    const t = new Text({ text, style: { fill: color, fontFamily: FONT, fontWeight: "900", fontSize: size,
      dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.6, angle: Math.PI / 2 } } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    uiLayer.addChild(t);
    gsap.to(t, { y: y - 60, alpha: 0, duration: 0.9, ease: "power2.out", onComplete: () => { uiLayer.removeChild(t); t.destroy(); } });
    gsap.fromTo(t.scale, { x: 0.5, y: 0.5 }, { x: 1.2, y: 1.2, duration: 0.25, ease: "back.out(2)" });
  }
  function scorePop(): void {
    gsap.killTweensOf(scoreText.scale);
    gsap.fromTo(scoreText.scale, { x: 1, y: 1 }, { x: 1.3, y: 1.3, duration: 0.12, ease: "back.out(2.4)",
      onComplete: () => gsap.to(scoreText.scale, { x: 1, y: 1, duration: 0.25, ease: "elastic.out(1,0.5)" }) });
  }
  function addScore(n: number, x: number | null, y: number | null, showFloat = true): void {
    score += n;
    scoreText.text = String(score);
    scorePop();
    if (showFloat && x != null && y != null) floatText(x, y, "+" + n, 0xffe24d, 22);
  }

  // ── Combo + specials ───────────────────────────────────────────────────────
  function onComboHit(x: number, y: number): void {
    comboCount++; comboTimer = 1.0; swipeSlices++;
    const comboMult = comboCount >= 6 ? 3 : (comboCount >= 3 ? 2 : 1);
    const dbl = doubleTimer > 0 ? 2 : 1;
    addScore(10 * comboMult * dbl, x, y);
    if (comboCount >= 3) { showBanner("Combo x" + comboCount + "!", 0xffe24d); sfx("combo.wav"); }
    if (swipeSlices === 3) { slowMo(false); showBanner("COMBO x" + swipeSlices + "!", 0xff8a1e); sfx("combo.wav"); }
  }
  function removeFlyingBombs(): void {
    for (let i = fruits.length - 1; i >= 0; i--) {
      const f = fruits[i];
      if (f.kind === "bomb") {
        juice(f.node.x, f.node.y, 0x888888);
        gameLayer.removeChild(f.node); f.node.destroy({ children: true });
        fruits.splice(i, 1);
      }
    }
  }
  function pomegranateBurst(x: number, y: number): void {
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2, dist = 20 + Math.random() * 120;
      floatText(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, "+20", 0xff3aa5, 18);
    }
    juice(x, y, 0xc23a8a); juice(x, y, 0xff3aa5);
    addScore(280, x, y - 80, false);
    slowMo(true);
  }
  function applySpecial(s: Special, x: number, y: number): void {
    if (s === "frenzy") { frenzyTimer = 5; removeFlyingBombs(); showBanner("FRENZY!", 0xff8a1e); }
    else if (s === "freeze") {
      gsap.killTweensOf(timeScale);
      gsap.to(timeScale, { v: 0.4, duration: 0.2 });
      gsap.to(timeScale, { v: 1, duration: 0.5, delay: 3 });
      showBanner("FREEZE!", 0x4dc3ff);
    } else if (s === "double") { doubleTimer = 5; showBanner("DOUBLE!", 0xffd24d); }
    else if (s === "pomegranate") { pomegranateBurst(x, y); showBanner("POMEGRANATE!", 0xc23a8a); }
  }

  // ── Slicing ────────────────────────────────────────────────────────────────
  function removeFruit(f: Fruit): void {
    const i = fruits.indexOf(f);
    if (i >= 0) fruits.splice(i, 1);
    gameLayer.removeChild(f.node);
    f.node.destroy({ children: true });
  }
  function sliceFruit(f: Fruit, cutAngle: number): void {
    f.sliced = true;
    const x = f.node.x, y = f.node.y;
    removeFruit(f);
    if (f.special !== "pomegranate") spawnHalves(tex[f.texKey], x, y, cutAngle, f.scale);
    juice(x, y, f.color);
    stain(x, y, f.color);
    sfx("slice.wav");
    diff.recordHit();
    if (!firstSliceDone) { firstSliceDone = true; hideHint(); }
    onComboHit(x, y);
    if (f.special) applySpecial(f.special, x, y);
  }
  function sliceBomb(f: Fruit): void {
    f.sliced = true;
    const x = f.node.x, y = f.node.y;
    removeFruit(f);
    bombExplode(x, y);
    diff.recordBombHit();
  }
  function sliceSegment(x0: number, y0: number, x1: number, y1: number): void {
    const ang = Math.atan2(y1 - y0, x1 - x0);
    for (let i = fruits.length - 1; i >= 0; i--) {
      const f = fruits[i];
      if (f.sliced) continue;
      if (segPointDist(x0, y0, x1, y1, f.node.x, f.node.y) <= f.r * 1.1) {
        if (f.kind === "bomb") sliceBomb(f); else sliceFruit(f, ang);
      }
    }
  }

  // ── Spawning ─────────────────────────────────────────────────────────────
  function spawnOne(): void {
    if (fruits.length > 16) return;
    const W = app.screen.width, H = app.screen.height;
    const fromX = W * 0.15 + Math.random() * W * 0.7;
    const fromY = H + 60;
    let kind: "fruit" | "bomb" = "fruit";
    let special: Special | null = null;
    const allowBomb = frenzyTimer <= 0 && firstSliceDone && gameTime > 3;
    if (allowBomb && Math.random() < diff.bombProbability() * 0.55) {
      kind = "bomb";
    } else if (Math.random() < 0.07) {
      const types: Special[] = ["frenzy", "freeze", "double", "pomegranate"];
      special = types[Math.floor(Math.random() * types.length)];
    }

    let texKey: string, r: number, color: number;
    if (kind === "bomb") { texKey = "bomb.webp"; r = 46; color = 0x333333; }
    else if (special === "pomegranate") { texKey = "fruit6.webp"; r = 62; color = FRUIT_COLORS[texKey]; }
    else { texKey = FRUIT_KEYS[Math.floor(Math.random() * FRUIT_KEYS.length)]; r = 46; color = FRUIT_COLORS[texKey]; }

    const texture = tex[texKey];
    const node = new Container();
    node.position.set(fromX, fromY);

    if (special) {
      const glow = new Graphics().circle(0, 0, r * 1.18).stroke({ color: SPECIAL_GLOW[special], width: 5, alpha: 0.9 });
      node.addChild(glow);
      gsap.to(glow, { alpha: 0.3, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
      gsap.to(glow.scale, { x: 1.12, y: 1.12, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }

    const sp = new Sprite(texture);
    sp.anchor.set(0.5);
    let scale = 1;
    if (texture) {
      scale = (r * 2) / Math.max(texture.width, texture.height);
      sp.scale.set(scale);
    } else {
      // procedural fallback so the game still works without assets
      const g = new Graphics().circle(0, 0, r).fill({ color: kind === "bomb" ? 0x1a1a22 : color });
      node.addChild(g);
    }
    node.addChild(sp);
    gameLayer.addChild(node);

    const angMag = Math.abs(randomLaunchAngle(Math.random()));
    const angleDeg = fromX < W / 2 ? angMag : -angMag;
    const proj = makeArc({
      fromX, fromY, screenH: H,
      timeAloftSec: 2.2 + Math.random() * 0.4,
      apexFraction: 0.66 + Math.random() * 0.12,
      angleDeg,
      spinRadPerSec: (Math.random() - 0.5) * 3,
    });

    fruits.push({ node, sp, proj, r, kind, special, color, texKey, scale, sliced: false });
    sfx("throw.wav");
  }
  function spawnWave(): void {
    const count = frenzyTimer > 0 ? 3 + Math.floor(Math.random() * 3) : Math.max(1, diff.parallelCount());
    for (let i = 0; i < count; i++) spawnOne();
    spawnTimer = frenzyTimer > 0 ? 0.35 : diff.spawnWaitSec();
  }

  // ── Endcard ────────────────────────────────────────────────────────────────
  let endcard: Container | null = null;
  function finish(): void {
    if (finished) return;
    finished = true;
    const W = app.screen.width, H = app.screen.height;
    const ec = new Container();
    const dim = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.62 });
    ec.addChild(dim);
    const big = new Text({ text: "TIME'S UP!", style: { fill: COL_ACCENT, fontFamily: FONT, fontWeight: "900", fontSize: 46, align: "center" } });
    big.anchor.set(0.5);
    big.position.set(W / 2, H * 0.32);
    const sc = new Text({ text: "Score " + score, style: { fill: COL_TEXT, fontFamily: FONT, fontWeight: "900", fontSize: 34, align: "center" } });
    sc.anchor.set(0.5);
    sc.position.set(W / 2, H * 0.44);
    ec.addChild(big, sc);
    uiLayer.addChild(ec);
    endcard = ec;
    ec.alpha = 0;
    gsap.to(ec, { alpha: 1, duration: 0.4 });
    gsap.fromTo(big.scale, { x: 0.5, y: 0.5 }, { x: 1, y: 1, duration: 0.5, ease: "back.out(2)" });
    layout();
  }

  // ── Pointer (only stage listens; manual hit-test) ───────────────────────────
  let slicing = false;
  let lastPt: { x: number; y: number } | null = null;
  app.stage.on("pointerdown", (e) => {
    const p: Point = e.global;
    slicing = true; swipeSlices = 0;
    trail.length = 0;
    lastPt = { x: p.x, y: p.y };
    trail.push({ x: p.x, y: p.y, t: gameTime });
  });
  app.stage.on("pointermove", (e) => {
    if (!slicing) return;
    const p: Point = e.global;
    const x = p.x, y = p.y;
    trail.push({ x, y, t: gameTime });
    if (trail.length > 40) trail.shift();
    if (lastPt) sliceSegment(lastPt.x, lastPt.y, x, y);
    lastPt = { x, y };
  });
  const endSwipe = (): void => { slicing = false; lastPt = null; };
  app.stage.on("pointerup", endSwipe);
  app.stage.on("pointerupoutside", endSwipe);

  // ── Trail draw ──────────────────────────────────────────────────────────────
  function drawTrail(): void {
    trailG.clear();
    while (trail.length && gameTime - trail[0].t > 0.2) trail.shift();
    if (trail.length < 2) return;
    for (let i = 1; i < trail.length; i++) {
      const a = i / trail.length, p0 = trail[i - 1], p1 = trail[i];
      trailG.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ color: 0xffffff, width: 2 + a * 14, alpha: a * 0.5, cap: "round" });
    }
    for (let i = 1; i < trail.length; i++) {
      const a = i / trail.length, p0 = trail[i - 1], p1 = trail[i];
      trailG.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ color: 0xffffff, width: 1 + a * 6, alpha: a * 0.9, cap: "round" });
    }
  }

  // ── Main tick ───────────────────────────────────────────────────────────────
  app.ticker.add((t) => {
    const dt = t.deltaMS / 1000;
    const sdt = dt * timeScale.v;
    gameTime += dt;

    if (!finished && gameTime >= GAME_DURATION) finish();

    if (frenzyTimer > 0) frenzyTimer -= dt;
    if (doubleTimer > 0) doubleTimer -= dt;
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) comboCount = 0; }

    if (!finished) {
      spawnTimer -= sdt;
      if (spawnTimer <= 0) spawnWave();
    }

    for (let i = fruits.length - 1; i >= 0; i--) {
      const f = fruits[i];
      f.proj.update(sdt);
      f.node.x = f.proj.x;
      f.node.y = f.proj.y;
      f.sp.rotation = f.proj.rotation;
      if (f.proj.done) {
        if (f.kind === "fruit" && !f.sliced) diff.recordMiss();
        gameLayer.removeChild(f.node);
        f.node.destroy({ children: true });
        fruits.splice(i, 1);
      }
    }

    drawTrail();
  });

  // ── Layout ──────────────────────────────────────────────────────────────────
  function layout(): void {
    const W = app.screen.width, H = app.screen.height;
    app.stage.hitArea = app.screen;

    world.pivot.set(W / 2, H / 2);
    world.position.set(W / 2, H / 2);

    if (tex["bg.webp"]) {
      const tw = bgSprite.texture.width, th = bgSprite.texture.height;
      const s = Math.max(W / tw, H / th);
      bgSprite.scale.set(s);
      bgSprite.position.set(W / 2, H / 2);
    } else {
      bgFallback.clear();
      bgFallback.rect(0, 0, W, H).fill({ color: num(cfg.style.colors.background) });
      for (let i = 0; i < 40; i++) {
        bgFallback.rect(0, (H * i) / 40, W, H / 40 + 1).fill({ color: 0x000000, alpha: i / 40 * 0.25 });
      }
    }

    scoreText.position.set(W - 20, 24);
    scoreLabel.position.set(W - 22, 12);
    heartsBox.position.set(28, 28);
    titleText.position.set(W / 2, 18);
    bannerText.position.set(W / 2, H * 0.32);

    const cw = Math.min(W * 0.7, 320);
    ctaBg.clear();
    ctaBg.roundRect(-cw / 2, -32, cw, 64, 20).fill({ color: COL_ACCENT });
    ctaBg.roundRect(-cw / 2 + 6, -28, cw - 12, 18, 12).fill({ color: 0xffffff, alpha: 0.28 });
    ctaBtn.position.set(W / 2, H - 56);

    layoutHint();

    if (endcard) {
      const dim = endcard.children[0] as Graphics;
      dim.clear();
      dim.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.62 });
      (endcard.children[1] as Text).position.set(W / 2, H * 0.32);
      (endcard.children[2] as Text).position.set(W / 2, H * 0.44);
    }
  }
  layout();
  window.addEventListener("resize", layout);
}

void main();
