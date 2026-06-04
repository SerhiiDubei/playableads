import { Application, Container, Graphics, Sprite, Texture, Assets, Text } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";
import { makeArc, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }

const GAME_DURATION = 28;
const COMBO_WINDOW = 1.0;
const FRUIT_KEYS = ["fruit1.webp", "fruit2.webp", "fruit3.webp", "fruit4.webp", "fruit5.webp", "fruit6.webp"];

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);

  const tex: Record<string, Texture> = {};
  for (const k of [...FRUIT_KEYS, "bomb.webp", "bg.webp"]) {
    tex[k] = await Assets.load({ src: cfg.assets[k], format: "webp" });
  }

  function sfx(k: string): void {
    try { const a = new Audio(cfg.assets[k]); a.volume = 0.5; a.play().catch(() => {}); } catch (e) {}
  }

  const COL_PRIMARY = num(cfg.style.colors.primary);
  const COL_ACCENT = num(cfg.style.colors.accent);
  const COL_TEXT = num(cfg.style.colors.text);
  const FONT = cfg.style.font.family;
  const FWEIGHT = cfg.style.font.weight as any;
  const JUICE_COLORS = [0xff4757, 0xffa502, 0xff6b81, 0x2ed573, 0xffd32a, 0xff7f50];

  // ---------- layers ----------
  const bgLayer = new Container();
  const gameLayer = new Container();
  const fxLayer = new Container();
  const uiLayer = new Container();
  app.stage.addChild(bgLayer, gameLayer, fxLayer, uiLayer);

  const bg = new Sprite(tex["bg.webp"]);
  bg.anchor.set(0.5);
  bgLayer.addChild(bg);

  // dim overlay for bomb flash
  const flash = new Graphics();
  flash.alpha = 0;
  fxLayer.addChild(flash);

  // blade trail
  const blade = new Graphics();
  fxLayer.addChild(blade);

  // ---------- UI ----------
  const scoreText = new Text({ text: "0", style: { fontFamily: FONT, fontWeight: FWEIGHT, fontSize: 64, fill: COL_TEXT, stroke: { color: 0x000000, width: 6 } } });
  scoreText.anchor.set(0, 0);
  uiLayer.addChild(scoreText);

  const timeText = new Text({ text: "", style: { fontFamily: FONT, fontWeight: FWEIGHT, fontSize: 38, fill: COL_TEXT, stroke: { color: 0x000000, width: 5 } } });
  timeText.anchor.set(1, 0);
  uiLayer.addChild(timeText);

  const livesCont = new Container();
  uiLayer.addChild(livesCont);
  const lifeMarks: Graphics[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new Graphics();
    g.circle(0, 0, 14).fill(0xff3b30).stroke({ color: 0xffffff, width: 3 });
    g.x = i * 38;
    livesCont.addChild(g);
    lifeMarks.push(g);
  }

  // combo banner
  const comboBanner = new Text({ text: "", style: { fontFamily: FONT, fontWeight: FWEIGHT, fontSize: 72, fill: COL_ACCENT, stroke: { color: 0x000000, width: 8 } } });
  comboBanner.anchor.set(0.5);
  comboBanner.alpha = 0;
  uiLayer.addChild(comboBanner);

  // title hint
  const title = new Text({ text: cfg.copy.title, style: { fontFamily: FONT, fontWeight: FWEIGHT, fontSize: 40, fill: COL_TEXT, stroke: { color: 0x000000, width: 5 }, align: "center" } });
  title.anchor.set(0.5);
  uiLayer.addChild(title);

  const hintText = new Text({ text: "Swipe to slice!", style: { fontFamily: FONT, fontWeight: FWEIGHT, fontSize: 44, fill: COL_ACCENT, stroke: { color: 0x000000, width: 6 } } });
  hintText.anchor.set(0.5);
  uiLayer.addChild(hintText);

  // hand hint
  const hand = new Graphics();
  hand.circle(0, 0, 22).fill(0xffffff).stroke({ color: 0x000000, width: 4 });
  hand.moveTo(0, -8).lineTo(0, -50).stroke({ color: 0xffffff, width: 10 });
  uiLayer.addChild(hand);

  // sticky CTA
  const cta = new Container();
  const ctaBg = new Graphics();
  const ctaText = new Text({ text: cfg.copy.cta, style: { fontFamily: FONT, fontWeight: FWEIGHT, fontSize: 40, fill: 0xffffff } });
  ctaText.anchor.set(0.5);
  cta.addChild(ctaBg, ctaText);
  cta.eventMode = "static";
  cta.cursor = "pointer";
  cta.on("pointertap", () => { (window as any).FbPlayableAd.onCTAClick(); });
  uiLayer.addChild(cta);

  function drawCta(w: number): void {
    const bw = Math.min(w * 0.7, 460), bh = 84;
    ctaBg.clear();
    ctaBg.roundRect(-bw / 2, -bh / 2, bw, bh, 22).fill(COL_ACCENT).stroke({ color: 0xffffff, width: 4 });
    ctaText.x = 0; ctaText.y = 0;
  }
  gsap.to(cta.scale, { x: 1.06, y: 1.06, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });

  // ---------- state ----------
  let score = 0;
  let lives = 3;
  let gameTime = 0;
  let spawnTimer = 0;
  let comboTimer = 0;
  let comboChain = 0;
  let frenzyTimer = 0;
  let started = false;
  let gameOver = false;
  let scoreMul = 1;
  const diff = new DifficultyController();

  interface Obj { sprite: Sprite; p: any; r: number; kind: string; sliced: boolean; }
  const objects: Obj[] = [];
  interface Half { cont: Container; vx: number; vy: number; rot: number; life: number; }
  const halves: Half[] = [];
  interface Part { g: Graphics; vx: number; vy: number; life: number; }
  const parts: Part[] = [];

  let W = app.screen.width, H = app.screen.height;

  function spawnOne(forceFruit: boolean): void {
    const fromX = W * (0.12 + Math.random() * 0.76);
    const isBomb = !forceFruit && !(frenzyTimer > 0) && gameTime > 6 && Math.random() < diff.bombProbability() * 0.8;
    const isFrenzy = !isBomb && frenzyTimer <= 0 && gameTime > 4 && gameTime < GAME_DURATION - 8 && Math.random() < 0.05;
    const key = isBomb ? "bomb.webp" : FRUIT_KEYS[(Math.random() * FRUIT_KEYS.length) | 0];
    const sp = new Sprite(tex[key]);
    sp.anchor.set(0.5);
    const r = isBomb ? 46 : (48 + Math.random() * 22);
    const baseW = sp.texture.width || 100;
    sp.scale.set((r * 2) / baseW);
    if (isFrenzy) { sp.tint = 0xffe14a; sp.scale.set((r * 2.2) / baseW); }
    const p = makeArc({
      fromX, fromY: H + r, screenH: H,
      timeAloftSec: 2.3 + Math.random() * 0.4,
      apexFraction: 0.7,
      angleDeg: randomLaunchAngle(Math.random()),
      spinRadPerSec: (Math.random() - 0.5) * 3.0,
    });
    gameLayer.addChild(sp);
    objects.push({ sprite: sp, p, r: isFrenzy ? r * 1.1 : r, kind: isBomb ? "bomb" : (isFrenzy ? "frenzy" : "fruit"), sliced: false });
    sfx("throw.wav");
    if (isFrenzy) gsap.to(sp.scale, { x: sp.scale.x * 1.12, y: sp.scale.y * 1.12, duration: 0.35, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  function spawnWave(): void {
    const n = frenzyTimer > 0 ? 3 + ((Math.random() * 2) | 0) : Math.max(1, diff.parallelCount());
    for (let i = 0; i < n; i++) spawnOne(false);
  }

  function makeJuice(x: number, y: number, color: number): void {
    for (let i = 0; i < 12; i++) {
      const g = new Graphics();
      g.circle(0, 0, 4 + Math.random() * 7).fill(color);
      g.x = x; g.y = y;
      fxLayer.addChild(g);
      const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 320;
      parts.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7 });
    }
  }

  function sliceFruit(o: Obj): void {
    o.sliced = true;
    const x = o.sprite.x, y = o.sprite.y, rot = o.sprite.rotation, sc = o.sprite.scale.x;
    const t = o.sprite.texture;
    o.sprite.visible = false;
    const halfW = t.width / 2;
    for (let s = 0; s < 2; s++) {
      const cont = new Container();
      cont.x = x; cont.y = y; cont.rotation = rot;
      const hs = new Sprite(t);
      hs.anchor.set(0.5);
      hs.scale.set(sc);
      const m = new Graphics();
      const left = s === 0;
      m.rect(left ? -halfW * sc : 0, -t.height * sc / 2, halfW * sc, t.height * sc).fill(0xffffff);
      cont.addChild(hs, m);
      hs.mask = m;
      gameLayer.addChild(cont);
      halves.push({ cont, vx: (left ? -1 : 1) * (120 + Math.random() * 90), vy: -120 - Math.random() * 80, rot: (left ? -1 : 1) * 2.5, life: 1.1 });
    }
    const col = JUICE_COLORS[(Math.random() * JUICE_COLORS.length) | 0];
    makeJuice(x, y, col);
    sfx("slice.wav");

    // score + combo
    comboChain++;
    comboTimer = COMBO_WINDOW;
    let mul = comboChain >= 5 ? 4 : comboChain >= 3 ? 2 : 1;
    const gained = 10 * mul * scoreMul;
    score += gained;
    bumpScore();
    if (comboChain >= 3) {
      sfx("combo.wav");
      showCombo(comboChain, mul);
    }
  }

  function explodeBomb(o: Obj): void {
    o.sliced = true;
    sfx("bomb.wav");
    const x = o.sprite.x, y = o.sprite.y;
    o.sprite.visible = false;
    makeJuice(x, y, 0x333333);
    makeJuice(x, y, 0xff5500);
    // shake + flash
    gsap.fromTo(flash, { alpha: 0.55 }, { alpha: 0, duration: 0.45 });
    const sx = gameLayer.x, sy = gameLayer.y;
    gsap.fromTo([gameLayer, bgLayer], { x: sx }, { x: sx, duration: 0 });
    const tl = gsap.timeline();
    for (let i = 0; i < 6; i++) tl.to([gameLayer, bgLayer], { x: (Math.random() - 0.5) * 36, y: (Math.random() - 0.5) * 36, duration: 0.05 });
    tl.to([gameLayer, bgLayer], { x: 0, y: 0, duration: 0.06 });
    score = Math.max(0, score - 30);
    bumpScore();
    comboChain = 0;
    diff.recordBombHit();
    if (lives > 0) {
      lives--;
      const lm = lifeMarks[lives];
      gsap.to(lm, { alpha: 0.18, duration: 0.3 });
    }
    // game continues — never finish from bomb
  }

  function startFrenzy(): void {
    frenzyTimer = 5;
    scoreMul = 2;
    // remove all bombs in air
    for (const o of objects) {
      if (o.kind === "bomb" && !o.sliced) { o.sliced = true; o.sprite.visible = false; }
    }
    showCombo(0, 0, "FRENZY!");
  }

  function flashColor(): void {
    flash.clear();
    flash.rect(0, 0, W, H).fill(0xff2200);
  }

  function bumpScore(): void {
    scoreText.text = String(score);
    gsap.fromTo(scoreText.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.3, ease: "back.out(3)" });
  }

  function showCombo(chain: number, mul: number, override?: string): void {
    comboBanner.text = override ? override : `Combo x${chain}!`;
    comboBanner.x = W / 2; comboBanner.y = H * 0.34;
    gsap.killTweensOf(comboBanner);
    gsap.killTweensOf(comboBanner.scale);
    comboBanner.alpha = 1;
    gsap.fromTo(comboBanner.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.35, ease: "back.out(3)" });
    gsap.to(comboBanner, { alpha: 0, duration: 0.5, delay: 0.6 });
  }

  // ---------- swipe / blade ----------
  const trail: { x: number; y: number }[] = [];
  let pointerDown = false;
  let lastPt: { x: number; y: number } | null = null;

  function segHit(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): boolean {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((cx - ax) * dx + (cy - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy;
    const ddx = cx - px, ddy = cy - py;
    return ddx * ddx + ddy * ddy <= r * r;
  }

  function handleSwipe(x: number, y: number): void {
    if (!started) startGame();
    if (lastPt) {
      for (const o of objects) {
        if (o.sliced) continue;
        if (segHit(lastPt.x, lastPt.y, x, y, o.sprite.x, o.sprite.y, o.r)) {
          if (o.kind === "bomb") { flashColor(); explodeBomb(o); diff.recordMiss(); }
          else { sliceFruit(o); diff.recordHit(); if (o.kind === "frenzy") startFrenzy(); }
        }
      }
    }
    trail.push({ x, y });
    if (trail.length > 14) trail.shift();
    lastPt = { x, y };
    hideHint();
  }

  app.canvas.addEventListener("pointerdown", (e) => { pointerDown = true; lastPt = { x: e.clientX, y: e.clientY }; trail.length = 0; handleSwipe(e.clientX, e.clientY); });
  app.canvas.addEventListener("pointermove", (e) => { if (pointerDown) handleSwipe(e.clientX, e.clientY); });
  app.canvas.addEventListener("pointerup", () => { pointerDown = false; lastPt = null; });
  app.canvas.addEventListener("pointerleave", () => { pointerDown = false; lastPt = null; });

  let hintActive = true;
  function hideHint(): void {
    if (!hintActive) return;
    hintActive = false;
    gsap.killTweensOf(hand);
    gsap.to([hintText, hand], { alpha: 0, duration: 0.3 });
  }

  function startGame(): void {
    if (started) return;
    started = true;
    gsap.to(title, { alpha: 0, duration: 0.4 });
  }

  // initial rigged cluster
  function startupCluster(): void {
    for (let i = 0; i < 3; i++) spawnOne(true);
  }
  startupCluster();

  // hand hint animation
  function animHand(): void {
    hand.alpha = 1; hintText.alpha = 1;
    gsap.fromTo(hand, { x: W * 0.32, y: H * 0.62 }, { x: W * 0.68, y: H * 0.5, duration: 1.0, repeat: -1, yoyo: true, ease: "sine.inOut" });
  }

  // ---------- end card ----------
  let endShown = false;
  function showEndcard(): void {
    if (endShown) return;
    endShown = true;
    gameOver = true;
    sfx("combo.wav");
    const panel = new Container();
    const pg = new Graphics();
    const pw = Math.min(W * 0.82, 520), ph = 360;
    pg.roundRect(-pw / 2, -ph / 2, pw, ph, 28).fill({ color: 0x000000, alpha: 0.78 }).stroke({ color: COL_ACCENT, width: 4 });
    const t1 = new Text({ text: "Time's Up!", style: { fontFamily: FONT, fontWeight: FWEIGHT, fontSize: 52, fill: COL_ACCENT } });
    t1.anchor.set(0.5); t1.y = -ph / 2 + 70;
    const t2 = new Text({ text: "Score\n" + score, style: { fontFamily: FONT, fontWeight: FWEIGHT, fontSize: 60, fill: COL_TEXT, align: "center" } });
    t2.anchor.set(0.5); t2.y = -10;
    panel.addChild(pg, t1, t2);
    panel.x = W / 2; panel.y = H * 0.42;
    uiLayer.addChild(panel);
    gsap.fromTo(panel.scale, { x: 0.5, y: 0.5 }, { x: 1, y: 1, duration: 0.5, ease: "back.out(2)" });
    // bring CTA to front, emphasize
    uiLayer.addChild(cta);
    gsap.fromTo(cta.scale, { x: 1, y: 1 }, { x: 1.15, y: 1.15, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // ---------- ticker ----------
  app.ticker.add(() => {
    const dt = Math.min(app.ticker.deltaMS / 1000, 0.05);

    // blade trail draw
    blade.clear();
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const a = i / trail.length;
        blade.moveTo(trail[i - 1].x, trail[i - 1].y).lineTo(trail[i].x, trail[i].y)
          .stroke({ color: 0xffffff, width: 2 + a * 12, alpha: a, cap: "round" });
      }
    }
    if (!pointerDown && trail.length) trail.shift();

    if (!gameOver) {
      if (started) {
        gameTime += dt;
        timeText.text = Math.max(0, Math.ceil(GAME_DURATION - gameTime)) + "s";
        if (frenzyTimer > 0) { frenzyTimer -= dt; if (frenzyTimer <= 0) scoreMul = 1; }
        if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) comboChain = 0; }

        spawnTimer += dt;
        const wait = frenzyTimer > 0 ? 0.4 : Math.max(0.5, diff.spawnWaitSec());
        if (spawnTimer >= wait) { spawnTimer = 0; spawnWave(); }

        if (gameTime >= GAME_DURATION) showEndcard();
      }
    }

    // objects
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      o.p.update(dt);
      o.sprite.x = o.p.x; o.sprite.y = o.p.y; o.sprite.rotation = o.p.rotation;
      if (o.p.done || o.sprite.y > H + 140) {
        if (!o.sliced && o.kind !== "bomb") diff.recordMiss();
        o.sprite.destroy();
        objects.splice(i, 1);
      }
    }

    // halves
    for (let i = halves.length - 1; i >= 0; i--) {
      const h = halves[i];
      h.vy += 900 * dt;
      h.cont.x += h.vx * dt;
      h.cont.y += h.vy * dt;
      h.cont.rotation += h.rot * dt;
      h.life -= dt;
      if (h.life < 0.4) h.cont.alpha = h.life / 0.4;
      if (h.life <= 0 || h.cont.y > H + 200) { h.cont.destroy(); halves.splice(i, 1); }
    }

    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += 800 * dt;
      p.g.x += p.vx * dt; p.g.y += p.vy * dt;
      p.life -= dt;
      p.g.alpha = Math.max(0, p.life / 0.7);
      if (p.life <= 0) { p.g.destroy(); parts.splice(i, 1); }
    }
  });

  // ---------- layout ----------
  function layout(): void {
    W = app.screen.width; H = app.screen.height;
    const scale = Math.max(W / bg.texture.width, H / bg.texture.height);
    bg.scale.set(scale);
    bg.x = W / 2; bg.y = H / 2;

    flash.clear(); flash.rect(0, 0, W, H).fill(0xff2200);

    scoreText.x = 24; scoreText.y = 18;
    timeText.x = W - 24; timeText.y = 22;
    livesCont.x = W - 130; livesCont.y = 86;

    title.x = W / 2; title.y = H * 0.16;
    hintText.x = W / 2; hintText.y = H * 0.7;

    comboBanner.x = W / 2; comboBanner.y = H * 0.34;

    drawCta(W);
    cta.x = W / 2; cta.y = H - 64;
  }
  layout();
  window.addEventListener("resize", layout);

  animHand();
}
void main();
