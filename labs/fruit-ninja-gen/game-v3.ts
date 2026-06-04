import { Application, Container, Graphics, Text } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";
import { makeArc, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

declare global {
  interface Window { FbPlayableAd: { onCTAClick: () => void } }
}

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }
function pnum(k: string, d: number): number {
  const v = cfg.params[k];
  return typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : d;
}

function sfx(k: string): void {
  const src = cfg.assets[k];
  if (!src) return;
  const a = new Audio(src);
  a.volume = 0.5;
  a.play().catch(() => {});
}

// ── Fruit palette (drawn in code) ──
interface FruitDef { color: number; flesh: number; r: number; special?: "frenzy" }
const FRUITS: FruitDef[] = [
  { color: num(cfg.style.colors.accent), flesh: 0xfff1a8, r: 46 }, // generic
  { color: 0xe23b3b, flesh: 0xffe0e0, r: 40 }, // apple/strawberry
  { color: 0xff9a1f, flesh: 0xffd98a, r: 42 }, // orange
  { color: 0x53c24a, flesh: 0xd6ffcf, r: 60 }, // watermelon (big)
  { color: num(cfg.style.colors.primary), flesh: 0xffffff, r: 44 },
];
const FRENZY: FruitDef = { color: 0xffe14d, flesh: 0xfff7c2, r: 50, special: "frenzy" };

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);

  const FONT = cfg.style.font.family;
  const TEXTCOL = num(cfg.style.colors.text);

  // shake-able world
  const world = new Container();
  app.stage.addChild(world);
  const bgLayer = new Container();
  const fruitLayer = new Container();
  const fxLayer = new Container();
  const bladeLayer = new Container();
  world.addChild(bgLayer, fruitLayer, fxLayer, bladeLayer);
  const uiLayer = new Container();
  app.stage.addChild(uiLayer);

  // dojo-ish background stripes
  const bg = new Graphics();
  bgLayer.addChild(bg);

  // ── State ──
  const DURATION = pnum("gameDurationSec", 20);
  const SCORE_TARGET = pnum("scoreTarget", 30);
  const COMBO_WINDOW = pnum("comboWindowMs", 1000) / 1000;
  const diff = new DifficultyController();

  let score = 0;
  let elapsed = 0;
  let spawnTimer = 0;
  let comboCount = 0;
  let comboTimer = 0;
  let frenzyTimer = 0;
  let slowTimer = 0;
  let started = false;
  let over = false;
  let won = false;

  interface Fruit {
    g: Container;
    body: Graphics;
    def: FruitDef;
    p: ReturnType<typeof makeArc>;
    bomb: boolean;
    sliced: boolean;
  }
  const fruits: Fruit[] = [];

  interface Particle { g: Graphics; vx: number; vy: number; life: number; max: number }
  const particles: Particle[] = [];

  interface Half { g: Graphics; vx: number; vy: number; spin: number; life: number }
  const halves: Half[] = [];

  // ── UI ──
  const scoreText = new Text({
    text: "0",
    style: { fill: TEXTCOL, fontFamily: FONT, fontWeight: "900", fontSize: 56 },
  });
  scoreText.anchor.set(0, 0);
  const titleText = new Text({
    text: cfg.copy.title,
    style: { fill: TEXTCOL, fontFamily: FONT, fontWeight: "800", fontSize: 30 },
  });
  titleText.anchor.set(0.5, 0);
  const comboBanner = new Text({
    text: "",
    style: { fill: 0xffe14d, fontFamily: FONT, fontWeight: "900", fontSize: 64, stroke: { color: 0x000000, width: 6 } },
  });
  comboBanner.anchor.set(0.5);
  comboBanner.alpha = 0;
  uiLayer.addChild(scoreText, titleText, comboBanner);

  // hint
  const hintText = new Text({
    text: "Swipe to slice!",
    style: { fill: TEXTCOL, fontFamily: FONT, fontWeight: "800", fontSize: 34 },
  });
  hintText.anchor.set(0.5);
  const hand = new Graphics();
  hand.circle(0, 0, 16).fill(0xffffff).circle(0, 0, 16).stroke({ color: 0x000000, width: 3 });
  const hintGroup = new Container();
  hintGroup.addChild(hand);
  uiLayer.addChild(hintText, hintGroup);

  // red flash overlay
  const flash = new Graphics();
  flash.alpha = 0;
  uiLayer.addChild(flash);

  // ── Drawing helpers ──
  function drawBody(g: Graphics, def: FruitDef, bomb: boolean): void {
    g.clear();
    if (bomb) {
      g.circle(0, 0, 40).fill(0x222228);
      g.circle(-12, -12, 12).fill(0x44444c);
      g.moveTo(0, -40).lineTo(6, -56).stroke({ color: 0x8a5a2a, width: 6 });
      g.circle(8, -58, 5).fill(0xff7a1f);
      return;
    }
    g.circle(0, 0, def.r).fill(def.color);
    g.circle(-def.r * 0.3, -def.r * 0.3, def.r * 0.28).fill({ color: 0xffffff, alpha: 0.35 });
    if (def.special) {
      g.moveTo(0, -def.r).lineTo(0, def.r).stroke({ color: 0xffffff, width: 4, alpha: 0.6 });
    }
  }

  function makeHalf(def: FruitDef, dir: number): Graphics {
    const g = new Graphics();
    const r = def.r;
    g.moveTo(0, -r).arc(0, 0, r, -Math.PI / 2, Math.PI / 2).lineTo(0, -r).fill(def.color);
    g.moveTo(0, -r).lineTo(0, r).stroke({ color: def.flesh, width: 8 });
    g.ellipse(r * 0.25, 0, r * 0.18, r * 0.55).fill(def.flesh);
    g.scale.x = dir;
    return g;
  }

  function spawnJuice(x: number, y: number, color: number): void {
    for (let i = 0; i < 12; i++) {
      const g = new Graphics();
      g.circle(0, 0, 3 + Math.random() * 4).fill(color);
      g.x = x; g.y = y;
      fxLayer.addChild(g);
      const ang = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 260;
      particles.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 80, life: 0, max: 0.6 + Math.random() * 0.4 });
    }
  }

  // ── Spawning ──
  function spawnOne(forceFruit: boolean): void {
    const W = app.screen.width, H = app.screen.height;
    const bombChance = forceFruit || frenzyTimer > 0 || elapsed < 6 ? 0 : diff.bombProbability() * 0.4;
    const isBomb = Math.random() < bombChance;
    const isFrenzy = !isBomb && frenzyTimer <= 0 && Math.random() < 0.06;
    const def = isFrenzy ? FRENZY : FRUITS[Math.floor(Math.random() * FRUITS.length)];
    const fromX = W * (0.18 + Math.random() * 0.64);
    const p = makeArc({
      fromX,
      fromY: H + 60,
      screenH: H,
      timeAloftSec: 2.4,
      apexFraction: 0.66,
      angleDeg: randomLaunchAngle(Math.random()),
      spinRadPerSec: (Math.random() - 0.5) * 3,
    });
    const body = new Graphics();
    drawBody(body, def, isBomb);
    const g = new Container();
    g.addChild(body);
    g.x = p.x; g.y = p.y;
    fruitLayer.addChild(g);
    fruits.push({ g, body, def, p, bomb: isBomb, sliced: false });
  }

  function spawnWave(): void {
    const n = frenzyTimer > 0 ? 2 : Math.max(1, diff.parallelCount());
    for (let i = 0; i < n; i++) spawnOne(elapsed < 4);
    sfx("throw.wav");
  }

  // ── Slicing ──
  function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t, cy = ay + dy * t;
    return Math.hypot(px - cx, py - cy);
  }

  function sliceFruit(f: Fruit): void {
    f.sliced = true;
    fruitLayer.removeChild(f.g);
    const idx = fruits.indexOf(f);
    if (idx >= 0) fruits.splice(idx, 1);

    if (f.bomb) {
      explode(f.g.x, f.g.y);
      return;
    }

    sfx("slice.wav");
    spawnJuice(f.g.x, f.g.y, f.def.flesh);
    diff.recordHit();

    // big fruit slow-mo
    if (f.def.r >= 58) slowTimer = Math.max(slowTimer, 0.5);

    // halves
    for (const dir of [-1, 1]) {
      const h = makeHalf(f.def, dir);
      h.x = f.g.x; h.y = f.g.y;
      h.rotation = f.g.children[0].rotation;
      fxLayer.addChild(h);
      halves.push({ g: h, vx: dir * (120 + Math.random() * 120), vy: -120 - Math.random() * 80, spin: dir * 4, life: 0 });
    }

    // combo
    comboCount += 1;
    comboTimer = COMBO_WINDOW;
    const mult = comboCount >= 3 ? Math.floor(comboCount / 2) + 1 : 1;
    score += 1 * mult;
    bumpScore();

    if (comboCount >= 3) {
      sfx("combo.wav");
      showCombo(comboCount, mult);
    }

    if (f.def.special === "frenzy") {
      frenzyTimer = 5;
      flashBanner("FRENZY!", 0xffe14d);
    }

    if (score >= SCORE_TARGET) finish(true);
  }

  function explode(x: number, y: number): void {
    sfx("bomb.wav");
    for (let i = 0; i < 24; i++) {
      const g = new Graphics();
      g.circle(0, 0, 4 + Math.random() * 6).fill(i % 2 ? 0xff7a1f : 0x333333);
      g.x = x; g.y = y;
      fxLayer.addChild(g);
      const ang = Math.random() * Math.PI * 2;
      const sp = 200 + Math.random() * 380;
      particles.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: 0.8 });
    }
    // shake + flash
    const W = app.screen.width, H = app.screen.height;
    flash.clear().rect(0, 0, W, H).fill(0xff2020);
    flash.alpha = 0.6;
    gsap.to(flash, { alpha: 0, duration: 0.5 });
    gsap.fromTo(world, { x: 0 }, { x: 0, duration: 0.4, onUpdate: () => {
      world.x = (Math.random() - 0.5) * 30;
      world.y = (Math.random() - 0.5) * 30;
    }, onComplete: () => { world.x = 0; world.y = 0; } });
    diff.recordBombHit();
    finish(false);
  }

  // ── pointer / blade ──
  const bladePts: { x: number; y: number; life: number }[] = [];
  let down = false;
  let lastX = 0, lastY = 0;

  function onMove(gx: number, gy: number): void {
    bladePts.push({ x: gx, y: gy, life: 0 });
    if (down && started && !over) {
      for (const f of fruits.slice()) {
        if (f.sliced) continue;
        if (distToSeg(f.g.x, f.g.y, lastX, lastY, gx, gy) <= f.def.r + 8) {
          if (hintGroup.visible) hideHint();
          sliceFruit(f);
        }
      }
    }
    lastX = gx; lastY = gy;
  }

  app.stage.eventMode = "static";
  app.stage.hitArea = { contains: () => true } as any;
  app.stage.on("pointerdown", (e: any) => {
    if (over) return;
    started = true;
    down = true;
    lastX = e.global.x; lastY = e.global.y;
  });
  app.stage.on("pointerup", () => { down = false; });
  app.stage.on("pointerupoutside", () => { down = false; });
  app.stage.on("pointermove", (e: any) => onMove(e.global.x, e.global.y));

  const blade = new Graphics();
  bladeLayer.addChild(blade);

  // ── feedback ──
  function bumpScore(): void {
    scoreText.text = String(score);
    gsap.fromTo(scoreText.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.3, ease: "back.out(3)" });
  }
  function showCombo(chain: number, mult: number): void {
    comboBanner.text = "Combo x" + chain + "!  +" + mult;
    comboBanner.alpha = 1;
    gsap.killTweensOf(comboBanner);
    gsap.killTweensOf(comboBanner.scale);
    gsap.fromTo(comboBanner.scale, { x: 0.4, y: 0.4 }, { x: 1.1, y: 1.1, duration: 0.3, ease: "back.out(2)" });
    gsap.to(comboBanner, { alpha: 0, duration: 0.5, delay: 0.6 });
  }
  function flashBanner(txt: string, col: number): void {
    comboBanner.style.fill = col;
    comboBanner.text = txt;
    comboBanner.alpha = 1;
    gsap.fromTo(comboBanner.scale, { x: 0.4, y: 0.4 }, { x: 1.2, y: 1.2, duration: 0.3, ease: "back.out(2)" });
    gsap.to(comboBanner, { alpha: 0, duration: 0.5, delay: 0.8 });
  }
  function hideHint(): void {
    hintGroup.visible = false;
    hintText.visible = false;
    gsap.killTweensOf(hintGroup);
  }

  // ── end card ──
  function finish(win: boolean): void {
    if (over) return;
    over = true;
    won = win;
    down = false;
    showEndcard();
  }

  function showEndcard(): void {
    const W = app.screen.width, H = app.screen.height;
    const card = new Container();
    const panel = new Graphics();
    panel.roundRect(-W * 0.4, -200, W * 0.8, 400, 28).fill({ color: 0x000000, alpha: 0.78 });
    card.addChild(panel);

    const head = new Text({
      text: won ? "Nice slicing!" : "Boom!",
      style: { fill: TEXTCOL, fontFamily: FONT, fontWeight: "900", fontSize: 48 },
    });
    head.anchor.set(0.5); head.y = -120;
    const sc = new Text({
      text: "Score: " + score,
      style: { fill: 0xffe14d, fontFamily: FONT, fontWeight: "900", fontSize: 40 },
    });
    sc.anchor.set(0.5); sc.y = -50;
    card.addChild(head, sc);

    // CTA button
    const btn = new Container();
    const bw = Math.min(W * 0.6, 360), bh = 92;
    const bg2 = new Graphics();
    bg2.roundRect(-bw / 2, -bh / 2, bw, bh, 22).fill(num(cfg.style.colors.primary));
    const btxt = new Text({
      text: cfg.copy.cta,
      style: { fill: 0xffffff, fontFamily: FONT, fontWeight: "900", fontSize: 36 },
    });
    btxt.anchor.set(0.5);
    btn.addChild(bg2, btxt);
    btn.y = 90;
    btn.eventMode = "static";
    btn.cursor = "pointer";
    btn.on("pointertap", () => { window.FbPlayableAd.onCTAClick(); });
    card.addChild(btn);
    gsap.to(btn.scale, { x: 1.06, y: 1.06, duration: 0.6, repeat: -1, yoyo: true, ease: "sine.inOut" });

    card.x = W / 2; card.y = H / 2;
    uiLayer.addChild(card);
    gsap.fromTo(card.scale, { x: 0.6, y: 0.6 }, { x: 1, y: 1, duration: 0.4, ease: "back.out(2)" });
  }

  // ── hint animation ──
  function startHintAnim(): void {
    const W = app.screen.width, H = app.screen.height;
    hintGroup.position.set(W * 0.3, H * 0.6);
    gsap.to(hand, { x: W * 0.4, y: -H * 0.1, duration: 1, repeat: -1, yoyo: true, ease: "sine.inOut" });
  }

  // ── ticker ──
  let firstSpawn = 0;
  app.ticker.add(() => {
    let dt = app.ticker.deltaMS / 1000;
    if (dt > 0.05) dt = 0.05;
    const W = app.screen.width, H = app.screen.height;
    const tScale = slowTimer > 0 ? 0.35 : 1;
    if (slowTimer > 0) slowTimer -= dt;

    if (!over) {
      // auto-start spawning a touch before input for the rigged easy combo
      elapsed += dt;
      if (frenzyTimer > 0) frenzyTimer -= dt;

      // first guaranteed cluster
      if (firstSpawn < 3 && elapsed > 0.6 + firstSpawn * 0.5) {
        spawnOne(true);
        firstSpawn += 1;
      }

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnWave();
        spawnTimer = frenzyTimer > 0 ? 0.35 : Math.max(0.5, diff.spawnWaitSec());
      }

      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) comboCount = 0;
      }

      if (elapsed >= DURATION) finish(true);
    }

    // fruits
    for (const f of fruits.slice()) {
      f.p.update(dt * tScale);
      f.g.x = f.p.x; f.g.y = f.p.y;
      f.g.children[0].rotation = f.p.rotation;
      if (f.p.done || f.g.y > H + 120) {
        fruitLayer.removeChild(f.g);
        fruits.splice(fruits.indexOf(f), 1);
        if (!f.bomb && !over) diff.recordMiss();
      }
    }

    // halves
    for (const h of halves.slice()) {
      h.life += dt;
      h.vy += 900 * dt;
      h.g.x += h.vx * dt;
      h.g.y += h.vy * dt;
      h.g.rotation += h.spin * dt;
      h.g.alpha = Math.max(0, 1 - h.life / 1.2);
      if (h.life > 1.2) { fxLayer.removeChild(h.g); halves.splice(halves.indexOf(h), 1); }
    }

    // particles
    for (const pt of particles.slice()) {
      pt.life += dt;
      pt.vy += 700 * dt;
      pt.g.x += pt.vx * dt;
      pt.g.y += pt.vy * dt;
      pt.g.alpha = Math.max(0, 1 - pt.life / pt.max);
      if (pt.life > pt.max) { fxLayer.removeChild(pt.g); particles.splice(particles.indexOf(pt), 1); }
    }

    // blade trail
    blade.clear();
    for (const bp of bladePts) bp.life += dt;
    while (bladePts.length && bladePts[0].life > 0.18) bladePts.shift();
    if (bladePts.length > 1) {
      for (let i = 1; i < bladePts.length; i++) {
        const a = bladePts[i - 1], b = bladePts[i];
        const w = 14 * (1 - a.life / 0.18);
        blade.moveTo(a.x, a.y).lineTo(b.x, b.y)
          .stroke({ color: 0xffffff, width: Math.max(1, w), alpha: 0.9 });
      }
    }
  });

  // ── layout ──
  function layout(): void {
    const W = app.screen.width, H = app.screen.height;
    bg.clear();
    bg.rect(0, 0, W, H).fill(num(cfg.style.colors.background));
    for (let i = 0; i < 8; i++) {
      bg.rect(0, (H / 8) * i, W, 3).fill({ color: 0x000000, alpha: 0.06 });
    }
    scoreText.position.set(24, 20);
    titleText.position.set(W / 2, 26);
    comboBanner.position.set(W / 2, H * 0.32);
    hintText.position.set(W / 2, H * 0.5);
    if (!started) startHintAnim();
    flash.clear().rect(0, 0, W, H).fill(0xff2020);
    flash.alpha = 0;
  }
  layout();
  window.addEventListener("resize", layout);
}
void main();
