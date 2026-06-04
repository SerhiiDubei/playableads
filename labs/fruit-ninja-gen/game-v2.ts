import { Application, Container, Graphics, Text } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }
function sfx(k: string): void {
  try { const a = new Audio(cfg.assets[k]); a.volume = 0.5; void a.play().catch(() => {}); } catch (e) { /* noop */ }
}

type FruitKind = { name: string; color: number; r: number; big?: boolean; special?: string; bomb?: boolean };

const KINDS: FruitKind[] = [
  { name: "watermelon", color: 0x2ecc40, r: 52, big: true },
  { name: "apple", color: 0xff4136, r: 34 },
  { name: "orange", color: 0xff851b, r: 36 },
  { name: "strawberry", color: 0xe63973, r: 30 },
  { name: "plum", color: 0x9b59b6, r: 32 },
];
const BANANA: FruitKind = { name: "frenzy banana", color: 0xffe14d, r: 38, special: "frenzy" };
const BOMB: FruitKind = { name: "bomb", color: 0x1a1a1a, r: 38, bomb: true };

interface Fruit {
  c: Container;
  kind: FruitKind;
  vx: number; vy: number;
  x: number; y: number;
  rot: number; vr: number;
  r: number;
  alive: boolean;
  sliced: boolean;
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);

  const C = cfg.style.colors;
  const FONT = cfg.style.font.family;
  const FW = (cfg.style.font.weight as any) || "700";
  const PRIMARY = num(C.primary);
  const ACCENT = num(C.accent);
  const TEXTCOL = num(C.text);

  let W = app.screen.width;
  let H = app.screen.height;

  // ----- layers -----
  const bg = new Graphics();
  app.stage.addChild(bg);
  const world = new Container();
  app.stage.addChild(world);
  const fx = new Container();
  app.stage.addChild(fx);
  const bladeG = new Graphics();
  app.stage.addChild(bladeG);
  const ui = new Container();
  app.stage.addChild(ui);

  function drawBG(): void {
    bg.clear();
    bg.rect(0, 0, W, H).fill(num(C.background));
    // bamboo dojo stripes
    for (let i = 0; i < 14; i++) {
      const x = (W / 14) * i;
      bg.rect(x, 0, W / 14 - 6, H).fill({ color: PRIMARY, alpha: 0.05 });
    }
    bg.circle(W / 2, H * 0.42, Math.min(W, H) * 0.45).fill({ color: PRIMARY, alpha: 0.06 });
  }

  // ----- UI -----
  const titleText = new Text({
    text: cfg.copy.title,
    style: { fill: TEXTCOL, fontFamily: FONT, fontWeight: FW, fontSize: 30, align: "center" },
  });
  titleText.anchor.set(0.5);
  ui.addChild(titleText);

  const scoreText = new Text({
    text: "0",
    style: { fill: ACCENT, fontFamily: FONT, fontWeight: "800", fontSize: 48 },
  });
  scoreText.anchor.set(0, 0.5);
  ui.addChild(scoreText);

  const timeText = new Text({
    text: "20",
    style: { fill: TEXTCOL, fontFamily: FONT, fontWeight: FW, fontSize: 32 },
  });
  timeText.anchor.set(1, 0.5);
  ui.addChild(timeText);

  const comboBanner = new Text({
    text: "",
    style: { fill: ACCENT, fontFamily: FONT, fontWeight: "800", fontSize: 56, align: "center" },
  });
  comboBanner.anchor.set(0.5);
  comboBanner.alpha = 0;
  ui.addChild(comboBanner);

  const hint = new Text({
    text: "Swipe to slice!",
    style: { fill: TEXTCOL, fontFamily: FONT, fontWeight: FW, fontSize: 34, align: "center" },
  });
  hint.anchor.set(0.5);
  ui.addChild(hint);

  // hand hint
  const hand = new Graphics();
  hand.circle(0, 0, 22).fill({ color: 0xffffff, alpha: 0.9 });
  hand.circle(0, 0, 22).stroke({ color: PRIMARY, width: 4 });
  ui.addChild(hand);
  hand.visible = false;

  const banner = new Text({ text: "", style: { fill: ACCENT, fontFamily: FONT, fontWeight: "800", fontSize: 30, align: "center" } });
  banner.anchor.set(0.5);
  banner.alpha = 0;
  ui.addChild(banner);

  // ----- state -----
  let score = 0;
  let timeLeft = 20;
  let running = false;
  let ended = false;
  let frenzyT = 0;
  const fruits: Fruit[] = [];
  let comboCount = 0;
  let comboTimer = 0;
  const COMBO_WINDOW = 1000;
  let spawnT = 0;
  let elapsed = 0;

  function makeFruitGraphics(k: FruitKind): Container {
    const c = new Container();
    const g = new Graphics();
    if (k.bomb) {
      g.circle(0, 0, k.r).fill(0x111111);
      g.circle(0, 0, k.r).stroke({ color: 0x444444, width: 3 });
      g.circle(-k.r * 0.3, -k.r * 0.3, k.r * 0.28).fill({ color: 0x666666, alpha: 0.6 });
      // fuse
      g.moveTo(0, -k.r).lineTo(k.r * 0.2, -k.r * 1.5).stroke({ color: 0x8b5a2b, width: 5 });
      g.circle(k.r * 0.2, -k.r * 1.5, 6).fill(0xff6600);
      const skull = new Text({ text: "💣", style: { fontFamily: FONT, fontSize: k.r } });
      skull.anchor.set(0.5);
      c.addChild(g);
    } else {
      g.circle(0, 0, k.r).fill(k.color);
      g.circle(0, 0, k.r).stroke({ color: 0x000000, width: 2, alpha: 0.25 });
      g.circle(-k.r * 0.32, -k.r * 0.32, k.r * 0.3).fill({ color: 0xffffff, alpha: 0.35 });
      if (k.special) {
        g.circle(0, 0, k.r + 6).stroke({ color: 0xffffff, width: 3, alpha: 0.8 });
        const star = new Text({ text: "★", style: { fill: 0xffffff, fontFamily: FONT, fontWeight: "800", fontSize: k.r } });
        star.anchor.set(0.5);
        c.addChild(g);
        c.addChild(star);
        return c;
      }
      // leaf for big
      if (k.big) g.ellipse(0, -k.r, k.r * 0.4, k.r * 0.2).fill(0x1f8a2f);
      c.addChild(g);
      return c;
    }
    return c;
  }

  function spawnFruit(kind?: FruitKind): void {
    let k: FruitKind;
    if (kind) k = kind;
    else {
      const roll = Math.random();
      if (elapsed > 9 && roll < 0.13) k = BOMB;
      else if (roll < 0.07) k = BANANA;
      else k = KINDS[(Math.random() * KINDS.length) | 0];
    }
    const c = makeFruitGraphics(k);
    const x = W * (0.2 + Math.random() * 0.6);
    const y = H + k.r + 10;
    c.x = x; c.y = y;
    world.addChild(c);
    const speedScale = frenzyT > 0 ? 1.05 : 1 + elapsed * 0.012;
    const f: Fruit = {
      c, kind: k,
      x, y,
      vx: (W / 2 - x) * 0.0025 + (Math.random() - 0.5) * 2.4,
      vy: -(11 + Math.random() * 3.5) * speedScale,
      rot: 0, vr: (Math.random() - 0.5) * 0.12,
      r: k.r, alive: true, sliced: false,
    };
    fruits.push(f);
    sfx("throw.wav");
  }

  function juiceSplat(x: number, y: number, color: number): void {
    for (let i = 0; i < 14; i++) {
      const p = new Graphics();
      const rr = 3 + Math.random() * 5;
      p.circle(0, 0, rr).fill(color);
      p.x = x; p.y = y;
      fx.addChild(p);
      const ang = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      gsap.to(p, {
        x: x + Math.cos(ang) * sp,
        y: y + Math.sin(ang) * sp + 80,
        alpha: 0,
        duration: 0.6 + Math.random() * 0.4,
        ease: "power2.out",
        onComplete: () => { p.destroy(); },
      });
    }
    // stain on bg
    const stain = new Graphics();
    stain.circle(0, 0, 22 + Math.random() * 16).fill({ color, alpha: 0.18 });
    stain.x = x; stain.y = y;
    fx.addChildAt(stain, 0);
    gsap.to(stain, { alpha: 0, duration: 2.5, onComplete: () => stain.destroy() });
  }

  function spawnHalf(f: Fruit, dir: number): void {
    const half = new Graphics();
    const k = f.kind;
    // half circle wedge
    half.moveTo(0, -k.r);
    half.arc(0, 0, k.r, -Math.PI / 2, Math.PI / 2, dir < 0);
    half.lineTo(0, -k.r);
    half.fill(k.color === 0x1a1a1a ? 0x222222 : lighten(k.color));
    half.stroke({ color: 0x000000, width: 2, alpha: 0.2 });
    half.x = f.x; half.y = f.y;
    half.rotation = f.rot;
    fx.addChild(half);
    const tgtX = f.x + dir * (80 + Math.random() * 60);
    gsap.to(half, { x: tgtX, duration: 1.1, ease: "power1.out" });
    gsap.to(half, { y: f.y + 260, duration: 1.1, ease: "power1.in" });
    gsap.to(half, { rotation: f.rot + dir * 3, alpha: 0, duration: 1.1, onComplete: () => half.destroy() });
  }

  function lighten(col: number): number {
    const r = Math.min(255, ((col >> 16) & 0xff) + 40);
    const g = Math.min(255, ((col >> 8) & 0xff) + 40);
    const b = Math.min(255, (col & 0xff) + 40);
    return (r << 16) | (g << 8) | b;
  }

  function showCombo(n: number): void {
    const mult = n >= 3 ? Math.floor(n / 2) + 1 : 1;
    comboBanner.text = `Combo x${n}!`;
    comboBanner.x = W / 2;
    comboBanner.y = H * 0.32;
    comboBanner.alpha = 1;
    comboBanner.scale.set(0.5);
    gsap.killTweensOf(comboBanner.scale);
    gsap.killTweensOf(comboBanner);
    gsap.to(comboBanner.scale, { x: 1.2, y: 1.2, duration: 0.25, ease: "back.out(2)" });
    gsap.to(comboBanner, { alpha: 0, duration: 0.5, delay: 0.7 });
    sfx("combo.wav");
  }

  function addScore(base: number): void {
    let mult = 1;
    if (comboCount >= 3) mult = Math.floor(comboCount / 2) + 1;
    if (frenzyT > 0) mult *= 2;
    score += base * mult;
    scoreText.text = String(score);
    gsap.killTweensOf(scoreText.scale);
    scoreText.scale.set(1.35);
    gsap.to(scoreText.scale, { x: 1, y: 1, duration: 0.3, ease: "back.out(2)" });
  }

  function sliceFruit(f: Fruit): void {
    if (!f.alive || f.sliced) return;
    f.sliced = true;
    f.alive = false;
    if (f.kind.bomb) { explode(f); return; }
    sfx("slice.wav");
    f.c.destroy();
    spawnHalf(f, -1);
    spawnHalf(f, 1);
    juiceSplat(f.x, f.y, f.kind.color);

    comboCount++;
    comboTimer = COMBO_WINDOW;
    if (comboCount >= 3) showCombo(comboCount);

    addScore(f.kind.big ? 15 : 10);

    if (f.kind.big) doSlowMo();

    if (f.kind.special === "frenzy") {
      frenzyT = 4000;
      flashText("FRENZY! x2", ACCENT);
      for (let i = 0; i < 6; i++) gsap.delayedCall(i * 0.18, () => { if (running) spawnFruit(KINDS[(Math.random() * KINDS.length) | 0]); });
    }
  }

  let slowFactor = 1;
  function doSlowMo(): void {
    slowFactor = 0.35;
    gsap.to({ v: 0.35 }, { v: 1, duration: 0.9, onUpdate: function () { slowFactor = (this.targets()[0] as any).v; } });
  }

  function flashText(txt: string, col: number): void {
    banner.text = txt;
    banner.style.fill = col;
    banner.x = W / 2; banner.y = H * 0.5;
    banner.alpha = 1; banner.scale.set(0.6);
    gsap.to(banner.scale, { x: 1, y: 1, duration: 0.3, ease: "back.out" });
    gsap.to(banner, { alpha: 0, duration: 0.6, delay: 0.6 });
  }

  function explode(f: Fruit): void {
    sfx("bomb.wav");
    f.c.destroy();
    // flash
    const flash = new Graphics();
    flash.rect(0, 0, W, H).fill({ color: 0xff0000, alpha: 0.55 });
    ui.addChild(flash);
    gsap.to(flash, { alpha: 0, duration: 0.5, onComplete: () => flash.destroy() });
    // particles
    for (let i = 0; i < 24; i++) {
      const p = new Graphics();
      p.circle(0, 0, 4 + Math.random() * 6).fill(i % 2 ? 0xff8800 : 0x333333);
      p.x = f.x; p.y = f.y;
      fx.addChild(p);
      const ang = Math.random() * Math.PI * 2;
      const sp = 100 + Math.random() * 260;
      gsap.to(p, { x: f.x + Math.cos(ang) * sp, y: f.y + Math.sin(ang) * sp, alpha: 0, duration: 0.7, onComplete: () => p.destroy() });
    }
    shake();
    endGame(false);
  }

  function shake(): void {
    const base = { x: 0, y: 0 };
    gsap.to(base, {
      x: 1, duration: 0.05, repeat: 9, yoyo: true,
      onUpdate: () => { world.x = (Math.random() - 0.5) * 24; world.y = (Math.random() - 0.5) * 24; },
      onComplete: () => { world.x = 0; world.y = 0; },
    });
  }

  // ----- blade / swipe -----
  let pointerDown = false;
  const trail: { x: number; y: number }[] = [];
  let lastPX = 0, lastPY = 0;

  function pointerPos(e: PointerEvent): { x: number; y: number } {
    const rect = app.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function checkSliceSegment(x1: number, y1: number, x2: number, y2: number): void {
    for (const f of fruits) {
      if (!f.alive) continue;
      if (segCircle(x1, y1, x2, y2, f.x, f.y, f.r)) sliceFruit(f);
    }
  }

  function segCircle(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number): boolean {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx, py = y1 + t * dy;
    const ddx = cx - px, ddy = cy - py;
    return ddx * ddx + ddy * ddy <= r * r;
  }

  app.canvas.addEventListener("pointerdown", (e: PointerEvent) => {
    pointerDown = true;
    const p = pointerPos(e);
    lastPX = p.x; lastPY = p.y;
    trail.length = 0;
    trail.push(p);
    if (!running && !ended) startGame();
    hint.visible = false;
    hand.visible = false;
  });
  app.canvas.addEventListener("pointermove", (e: PointerEvent) => {
    if (!pointerDown) return;
    const p = pointerPos(e);
    trail.push(p);
    if (trail.length > 14) trail.shift();
    if (running) checkSliceSegment(lastPX, lastPY, p.x, p.y);
    lastPX = p.x; lastPY = p.y;
  });
  const endPointer = (): void => { pointerDown = false; };
  app.canvas.addEventListener("pointerup", endPointer);
  app.canvas.addEventListener("pointerleave", endPointer);

  // ----- game flow -----
  function startGame(): void {
    if (running || ended) return;
    running = true;
    elapsed = 0; timeLeft = 20; spawnT = 0;
    // rigged easy opening: cluster of slow fruits
    for (let i = 0; i < 4; i++) gsap.delayedCall(0.2 + i * 0.25, () => { if (running) spawnFruit(KINDS[i % KINDS.length]); });
  }

  function endGame(win: boolean): void {
    if (ended) return;
    ended = true;
    running = false;
    for (const f of fruits) { if (f.c && !f.c.destroyed) f.c.destroy(); }
    fruits.length = 0;
    showEndcard(win);
  }

  function showEndcard(win: boolean): void {
    const overlay = new Container();
    ui.addChild(overlay);
    const dim = new Graphics();
    dim.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.6 });
    overlay.addChild(dim);

    const card = new Container();
    overlay.addChild(card);

    const titleE = new Text({
      text: win ? "Fruit Master!" : "Boom!",
      style: { fill: win ? ACCENT : 0xff4136, fontFamily: FONT, fontWeight: "800", fontSize: 52, align: "center" },
    });
    titleE.anchor.set(0.5);
    card.addChild(titleE);

    const sc = new Text({
      text: `Score: ${score}`,
      style: { fill: TEXTCOL, fontFamily: FONT, fontWeight: FW, fontSize: 40, align: "center" },
    });
    sc.anchor.set(0.5);
    card.addChild(sc);

    const btn = new Container();
    const bw = Math.min(W * 0.7, 360), bh = 84;
    const bg2 = new Graphics();
    bg2.roundRect(-bw / 2, -bh / 2, bw, bh, 20).fill(ACCENT);
    btn.addChild(bg2);
    const ctaT = new Text({
      text: cfg.copy.cta,
      style: { fill: 0xffffff, fontFamily: FONT, fontWeight: "800", fontSize: 36, align: "center" },
    });
    ctaT.anchor.set(0.5);
    btn.addChild(ctaT);
    btn.eventMode = "static";
    btn.cursor = "pointer";
    btn.on("pointertap", () => { window.FbPlayableAd.onCTAClick(); });
    card.addChild(btn);

    const place = (): void => {
      dim.clear(); dim.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.6 });
      card.x = W / 2; card.y = H / 2;
      titleE.y = -130;
      sc.y = -50;
      btn.y = 60;
    };
    place();
    window.addEventListener("resize", place);

    card.scale.set(0.7);
    gsap.to(card.scale, { x: 1, y: 1, duration: 0.4, ease: "back.out(1.7)" });
    gsap.to(btn.scale, { x: 1.06, y: 1.06, duration: 0.6, repeat: -1, yoyo: true });
  }

  // ----- ticker -----
  app.ticker.add((tk) => {
    const dt = tk.deltaMS;
    // blade trail
    bladeG.clear();
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        const w = (i / trail.length) * 14;
        bladeG.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0xffffff, width: w, alpha: i / trail.length, cap: "round" });
      }
    }
    if (!pointerDown && trail.length) trail.shift();

    if (running) {
      elapsed += dt / 1000;
      timeLeft -= dt / 1000;
      if (timeLeft <= 0) { timeLeft = 0; endGame(true); }
      timeText.text = String(Math.ceil(timeLeft));

      if (frenzyT > 0) frenzyT -= dt;
      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) comboCount = 0;
      }

      // spawn cadence
      spawnT -= dt;
      const interval = frenzyT > 0 ? 350 : Math.max(550, 1200 - elapsed * 35);
      if (spawnT <= 0) {
        spawnT = interval;
        spawnFruit();
        if (elapsed > 5 && Math.random() < 0.4) spawnFruit();
      }
    }

    // physics
    const g = 0.35 * slowFactor;
    for (let i = fruits.length - 1; i >= 0; i--) {
      const f = fruits[i];
      if (!f.alive) { fruits.splice(i, 1); continue; }
      f.vy += g;
      f.x += f.vx * slowFactor;
      f.y += f.vy * slowFactor;
      f.rot += f.vr * slowFactor;
      f.c.x = f.x; f.c.y = f.y; f.c.rotation = f.rot;
      if (f.y > H + 120 && f.vy > 0) {
        f.alive = false;
        f.c.destroy();
        fruits.splice(i, 1);
      }
    }
  });

  function layout(): void {
    W = app.screen.width;
    H = app.screen.height;
    drawBG();
    titleText.x = W / 2;
    titleText.y = 42;
    scoreText.x = 24;
    scoreText.y = 90;
    timeText.x = W - 24;
    timeText.y = 90;
    hint.x = W / 2;
    hint.y = H * 0.6;
    hand.x = W / 2;
    hand.y = H * 0.5;
  }
  layout();
  window.addEventListener("resize", layout);

  // intro: hand hint swipe
  hand.visible = true;
  const ht = gsap.timeline({ repeat: -1 });
  ht.fromTo(hand, { x: W * 0.3, y: H * 0.55 }, { x: W * 0.7, y: H * 0.45, duration: 0.9, ease: "power1.inOut" });
  ht.to(hand, { alpha: 0.3, duration: 0.3 });
  ht.to(hand, { alpha: 0.9, duration: 0.3 });
}
void main();
