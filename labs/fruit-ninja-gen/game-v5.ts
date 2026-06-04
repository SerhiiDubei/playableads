import { Application, Container, Graphics, Sprite, Texture, Assets, Text } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";
import { makeArc, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }
function rand(a: number, b: number): number { return a + Math.random() * (b - a); }
function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }

const FRUIT_COLORS: number[] = [0xff4d4d, 0x6ee36e, 0xffa733, 0xffe14d, 0xff5fa2, 0x9b5fff];

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);

  // ---- preload textures ----
  const tex: Record<string, Texture> = {};
  for (const k of ["fruit1.webp", "fruit2.webp", "fruit3.webp", "fruit4.webp", "fruit5.webp", "fruit6.webp", "bomb.webp", "bg.webp"]) {
    tex[k] = await Assets.load({ src: cfg.assets[k], format: "webp" });
  }

  function sfx(k: string): void {
    try { const a = new Audio(cfg.assets[k]); a.volume = 0.5; a.play().catch(() => {}); } catch (e) {}
  }

  const COL_PRIMARY = num(cfg.style.colors.primary);
  const COL_ACCENT = num(cfg.style.colors.accent);
  const COL_TEXT = num(cfg.style.colors.text);
  const FONT = cfg.style.font.family;
  const FW: any = cfg.style.font.weight;

  // ---- layers ----
  const bgLayer = new Container();
  const stainLayer = new Container();
  const worldLayer = new Container();
  const trailLayer = new Container();
  const uiLayer = new Container();
  app.stage.addChild(bgLayer, stainLayer, worldLayer, trailLayer, uiLayer);

  const bg = new Sprite(tex["bg.webp"]);
  bg.anchor.set(0.5);
  bgLayer.addChild(bg);

  // dim overlay for readability
  const dim = new Graphics();
  bgLayer.addChild(dim);

  // ---- UI ----
  const titleTxt = new Text({ text: cfg.copy.title, style: { fontFamily: FONT, fontWeight: FW, fontSize: 54, fill: COL_TEXT, align: "center", stroke: { color: 0x000000, width: 6 } } });
  titleTxt.anchor.set(0.5);
  uiLayer.addChild(titleTxt);

  const scoreTxt = new Text({ text: "0", style: { fontFamily: FONT, fontWeight: FW, fontSize: 46, fill: COL_ACCENT, stroke: { color: 0x000000, width: 5 } } });
  scoreTxt.anchor.set(0, 0.5);
  uiLayer.addChild(scoreTxt);

  const timeTxt = new Text({ text: "", style: { fontFamily: FONT, fontWeight: FW, fontSize: 34, fill: COL_TEXT, stroke: { color: 0x000000, width: 4 } } });
  timeTxt.anchor.set(1, 0.5);
  uiLayer.addChild(timeTxt);

  const livesCont = new Container();
  uiLayer.addChild(livesCont);
  const hearts: Graphics[] = [];
  for (let i = 0; i < 3; i++) {
    const h = new Graphics();
    h.circle(-7, 0, 8).circle(7, 0, 8).fill(0xff3b5c);
    h.poly([-14, 2, 14, 2, 0, 20]).fill(0xff3b5c);
    livesCont.addChild(h);
    hearts.push(h);
  }

  const comboTxt = new Text({ text: "", style: { fontFamily: FONT, fontWeight: FW, fontSize: 60, fill: COL_PRIMARY, align: "center", stroke: { color: 0x000000, width: 7 } } });
  comboTxt.anchor.set(0.5);
  comboTxt.alpha = 0;
  uiLayer.addChild(comboTxt);

  const bannerTxt = new Text({ text: "", style: { fontFamily: FONT, fontWeight: FW, fontSize: 50, fill: COL_ACCENT, align: "center", stroke: { color: 0x000000, width: 6 } } });
  bannerTxt.anchor.set(0.5);
  bannerTxt.alpha = 0;
  uiLayer.addChild(bannerTxt);

  // sticky CTA
  const cta = new Container();
  const ctaBg = new Graphics();
  const ctaTxt = new Text({ text: cfg.copy.cta, style: { fontFamily: FONT, fontWeight: FW, fontSize: 34, fill: 0xffffff } });
  ctaTxt.anchor.set(0.5);
  cta.addChild(ctaBg, ctaTxt);
  cta.eventMode = "static";
  cta.cursor = "pointer";
  cta.on("pointertap", () => { (window as any).FbPlayableAd.onCTAClick(); });
  uiLayer.addChild(cta);
  gsap.to(cta.scale, { x: 1.06, y: 1.06, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });

  // hint hand + text
  const hintCont = new Container();
  const hand = new Graphics();
  hand.roundRect(-10, 0, 20, 38, 8).fill(0xffe0bd);
  hand.circle(0, 0, 16).fill(0xffe0bd);
  hand.circle(0, 0, 16).stroke({ width: 3, color: 0x000000, alpha: 0.2 });
  const hintTxt = new Text({ text: "Swipe to slice!", style: { fontFamily: FONT, fontWeight: FW, fontSize: 30, fill: COL_TEXT, stroke: { color: 0x000000, width: 4 } } });
  hintTxt.anchor.set(0.5);
  hintCont.addChild(hand, hintTxt);
  hintCont.alpha = 0;
  uiLayer.addChild(hintCont);

  // flash overlay
  const flash = new Graphics();
  flash.alpha = 0;
  uiLayer.addChild(flash);

  // ---- state ----
  type FObj = { node: Container; sprite: Sprite; glow: Graphics | null; p: any; r: number; idx: number; color: number; kind: string; special: string; big: boolean; sliced: boolean };
  const objs: FObj[] = [];
  const cuts: any[] = [];
  const particles: any[] = [];
  const stains: Graphics[] = [];
  const trail: { x: number; y: number; t: number }[] = [];
  const trailG = new Graphics();
  trailLayer.addChild(trailG);

  const diff = new DifficultyController();
  let score = 0;
  let lives = 3;
  let T = 0;                 // real time clock
  let started = false;
  let ended = false;
  let gameTime = 0;          // elapsed game time
  const GAME_TIME = 28;
  let spawnTimer = 0;
  let comboChain = 0;
  let lastSliceT = -10;
  let swipeCount = 0;
  let scoreMult = 1;
  let doubleTimer = 0;
  let freezeTimer = 0;
  let frenzyTimer = 0;
  let pomTimer = 0;
  let slowmoTimer = 0;
  let shakeTimer = 0;
  let curZoom = 1;
  let W = app.screen.width, H = app.screen.height;

  // ---- helpers ----
  function showBanner(t: Text, msg: string, color: number): void {
    t.text = msg; (t.style as any).fill = color;
    gsap.killTweensOf(t); gsap.killTweensOf(t.scale);
    t.alpha = 1; t.scale.set(0.4);
    gsap.to(t.scale, { x: 1, y: 1, duration: 0.3, ease: "back.out(2.5)" });
    gsap.to(t, { alpha: 0, duration: 0.5, delay: 0.8 });
  }

  function addStain(x: number, y: number, color: number): void {
    const g = new Graphics();
    for (let i = 0; i < 4; i++) {
      g.circle(rand(-26, 26), rand(-26, 26), rand(8, 22)).fill({ color, alpha: 0.4 });
    }
    g.x = x; g.y = y; g.rotation = rand(0, 6.28);
    stainLayer.addChild(g);
    stains.push(g);
    if (stains.length > 55) { const old = stains.shift(); if (old) old.destroy(); }
  }

  function spawnParticles(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const g = new Graphics();
      g.circle(0, 0, rand(3, 8)).fill({ color, alpha: 1 });
      g.x = x; g.y = y;
      worldLayer.addChild(g);
      const a = rand(0, 6.28), sp = rand(120, 420);
      particles.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: rand(0.5, 1.0), max: 0.9 });
    }
  }

  function makeHalves(x: number, y: number, rot: number, angle: number, sprite: Sprite, color: number, r: number): void {
    const cutGroup = new Container();
    cutGroup.x = x; cutGroup.y = y; cutGroup.rotation = angle;
    worldLayer.addChild(cutGroup);
    const parts: any[] = [];
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const half = new Container();
      cutGroup.addChild(half);
      const sp = new Sprite(sprite.texture);
      sp.anchor.set(0.5);
      sp.width = r * 2; sp.height = r * 2;
      sp.rotation = rot - angle;
      half.addChild(sp);
      const m = new Graphics();
      if (side < 0) m.rect(-r * 2.2, -r * 2.2, r * 4.4, r * 2.2).fill(0xffffff);
      else m.rect(-r * 2.2, 0, r * 4.4, r * 2.2).fill(0xffffff);
      half.addChild(m);
      sp.mask = m;
      parts.push({ half, vy: side * rand(60, 110), vx: side * rand(-20, 20), vr: rand(-3, 3) });
    }
    cuts.push({ cutGroup, parts, gv: -40, life: 1.7 });
  }

  function spawnOne(forceFruit: boolean, special: string): void {
    const r = Math.min(W, H) * (special === "pomegranate" ? 0.115 : 0.085);
    const isBomb = !forceFruit && special === "" && Math.random() < diff.bombProbability() && frenzyTimer <= 0 && gameTime > 6;
    const node = new Container();
    let glow: Graphics | null = null;
    const idx = 1 + Math.floor(Math.random() * 6);
    let color = FRUIT_COLORS[idx - 1];
    let key = "fruit" + idx + ".webp";
    let big = false;
    if (isBomb) { key = "bomb.webp"; color = 0x333333; }
    else {
      big = special === "pomegranate" || Math.random() < 0.16;
      if (special === "pomegranate") { key = "fruit6.webp"; color = 0xc0306a; }
    }
    if (special !== "") {
      const gc = special === "frenzy" ? 0xff8a1e : special === "freeze" ? 0x4fc3ff : special === "double" ? 0xffd23f : 0xc0306a;
      glow = new Graphics();
      glow.circle(0, 0, r * 1.25).stroke({ width: 7, color: gc, alpha: 0.9 });
      glow.circle(0, 0, r * 1.05).fill({ color: gc, alpha: 0.18 });
      node.addChild(glow);
    }
    const sprite = new Sprite(tex[key]);
    sprite.anchor.set(0.5);
    const rr = isBomb ? r : (big ? r * 1.35 : r);
    sprite.width = rr * 2; sprite.height = rr * 2;
    node.addChild(sprite);
    worldLayer.addChild(node);
    const fromX = rand(W * 0.18, W * 0.82);
    const p = makeArc({ fromX, fromY: H + rr, screenH: H, timeAloftSec: rand(2.2, 2.7), apexFraction: 0.72, angleDeg: randomLaunchAngle(Math.random()), spinRadPerSec: rand(-2.2, 2.2) });
    objs.push({ node, sprite, glow, p, r: rr, idx, color, kind: isBomb ? "bomb" : "fruit", special: isBomb ? "" : special, big, sliced: false });
    sfx("throw.wav");
  }

  function spawnWave(): void {
    let n = diff.parallelCount();
    if (frenzyTimer > 0) n += 2;
    let special = "";
    if (frenzyTimer <= 0 && gameTime > 3 && Math.random() < 0.07) {
      const pool = ["frenzy", "freeze", "double", "pomegranate"];
      special = pool[Math.floor(Math.random() * pool.length)];
    }
    for (let i = 0; i < n; i++) spawnOne(frenzyTimer > 0, i === 0 ? special : "");
  }

  function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function addScore(v: number): void {
    score += Math.round(v * scoreMult);
    scoreTxt.text = String(score);
    gsap.killTweensOf(scoreTxt.scale);
    scoreTxt.scale.set(1.3);
    gsap.to(scoreTxt.scale, { x: 1, y: 1, duration: 0.3, ease: "back.out(3)" });
  }

  function sliceFruit(o: FObj, angle: number): void {
    o.sliced = true;
    o.node.visible = false;
    makeHalves(o.node.x, o.node.y, o.node.rotation, angle, o.sprite, o.color, o.r);
    spawnParticles(o.node.x, o.node.y, o.color, o.big ? 16 : 10);
    addStain(o.node.x, o.node.y, o.color);
    sfx("slice.wav");
    diff.recordHit();
    swipeCount++;

    // combo window
    if (T - lastSliceT <= 1.0) comboChain++; else comboChain = 1;
    lastSliceT = T;

    let base = o.big ? 18 : 10;
    let mult = comboChain >= 3 ? comboChain - 1 : 1;
    addScore(base * mult);

    if (comboChain >= 3) {
      showBanner(comboTxt, "Combo x" + comboChain + "!", COL_PRIMARY);
      sfx("combo.wav");
    }
    if (o.big) { slowmoTimer = Math.max(slowmoTimer, 0.4); }

    // special effects
    if (o.special === "frenzy") {
      frenzyTimer = 5;
      for (let i = objs.length - 1; i >= 0; i--) { if (objs[i].kind === "bomb") { objs[i].node.destroy(); objs.splice(i, 1); } }
      showBanner(bannerTxt, "FRENZY!", 0xff8a1e);
    } else if (o.special === "freeze") {
      freezeTimer = 3; showBanner(bannerTxt, "FREEZE!", 0x4fc3ff);
    } else if (o.special === "double") {
      doubleTimer = 5; scoreMult = 2; showBanner(bannerTxt, "DOUBLE!", 0xffd23f);
    } else if (o.special === "pomegranate") {
      pomTimer = 2.5; showBanner(bannerTxt, "TAP FAST!", 0xc0306a);
      for (let i = 0; i < 8; i++) spawnParticles(o.node.x + rand(-30, 30), o.node.y + rand(-30, 30), 0xc0306a, 4);
    }

    if (hintCont.alpha > 0) { gsap.to(hintCont, { alpha: 0, duration: 0.3 }); }
  }

  function hitBomb(o: FObj): void {
    o.sliced = true;
    o.node.destroy();
    const i = objs.indexOf(o); if (i >= 0) objs.splice(i, 1);
    diff.recordBombHit();
    sfx("bomb.wav");
    shakeTimer = 0.4;
    flash.clear(); flash.rect(0, 0, W, H).fill(0xff2222); flash.alpha = 0.55;
    gsap.to(flash, { alpha: 0, duration: 0.5 });
    spawnParticles(o.node.x, o.node.y, 0x222222, 22);
    score = Math.max(0, score - 5); scoreTxt.text = String(score);
    if (lives > 0) { lives--; }
    showBanner(bannerTxt, "-5", 0xff3b5c);
  }

  // ---- input ----
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  let lastP: { x: number; y: number } | null = null;
  let lastAngle = 0;

  function onMove(gx: number, gy: number): void {
    trail.push({ x: gx, y: gy, t: T });
    if (lastP) {
      const dx = gx - lastP.x, dy = gy - lastP.y;
      if (dx * dx + dy * dy > 4) lastAngle = Math.atan2(dy, dx);
      // pomegranate tap-frenzy points
      if (pomTimer > 0) addScore(2);
      for (const o of objs) {
        if (o.sliced) continue;
        const d = distSeg(o.node.x, o.node.y, lastP.x, lastP.y, gx, gy);
        if (d < o.r) {
          if (o.kind === "bomb") hitBomb(o);
          else sliceFruit(o, lastAngle);
        }
      }
    }
    lastP = { x: gx, y: gy };
  }

  app.stage.on("pointerdown", (e) => { swipeCount = 0; lastP = { x: e.global.x, y: e.global.y }; });
  app.stage.on("pointermove", (e) => { if (lastP) onMove(e.global.x, e.global.y); });
  function endSwipe(): void {
    if (swipeCount >= 3) { showBanner(comboTxt, swipeCount + " HIT!", COL_ACCENT); sfx("combo.wav"); slowmoTimer = Math.max(slowmoTimer, 0.4); }
    lastP = null; swipeCount = 0;
  }
  app.stage.on("pointerup", endSwipe);
  app.stage.on("pointerupoutside", endSwipe);

  // ---- layout ----
  function layout(): void {
    W = app.screen.width; H = app.screen.height;
    const sc = Math.max(W / bg.texture.width, H / bg.texture.height);
    bg.scale.set(sc); bg.x = W / 2; bg.y = H / 2;
    dim.clear(); dim.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.18 });
    titleTxt.x = W / 2; titleTxt.y = 50;
    scoreTxt.x = 20; scoreTxt.y = 36;
    timeTxt.x = W - 20; timeTxt.y = 36;
    livesCont.x = W - 50; livesCont.y = 80;
    for (let i = 0; i < hearts.length; i++) hearts[i].x = -i * 40;
    comboTxt.x = W / 2; comboTxt.y = H * 0.32;
    bannerTxt.x = W / 2; bannerTxt.y = H * 0.45;
    hintCont.x = W / 2; hintCont.y = H * 0.6;
    const cw = Math.min(W * 0.82, 440), ch = 64;
    ctaBg.clear();
    ctaBg.roundRect(-cw / 2, -ch / 2, cw, ch, 18).fill(COL_PRIMARY);
    ctaBg.roundRect(-cw / 2, -ch / 2, cw, ch, 18).stroke({ width: 4, color: 0xffffff, alpha: 0.85 });
    cta.x = W / 2; cta.y = H - 50;
    worldLayer.pivot.set(W / 2, H / 2); worldLayer.position.set(W / 2, H / 2);
  }
  layout();
  window.addEventListener("resize", layout);

  // intro animation
  gsap.fromTo(titleTxt.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.5, ease: "back.out(2)" });
  gsap.to(titleTxt, { alpha: 0.85, duration: 0.4 });

  function startGame(): void {
    started = true;
    gsap.to(titleTxt, { alpha: 0, duration: 0.6 });
    // guaranteed first combo cluster
    for (let i = 0; i < 4; i++) spawnOne(true, "");
    // hint hand swipe
    hintCont.alpha = 1;
    hand.x = -90; hand.y = -10;
    gsap.to(hand, { x: 90, duration: 1.1, repeat: 2, yoyo: true, ease: "sine.inOut" });
    gsap.to(hintCont, { alpha: 0, duration: 0.5, delay: 4 });
  }
  gsap.delayedCall(0.8, startGame);

  function endGame(): void {
    ended = true;
    sfx("combo.wav");
    const ov = new Container();
    const ob = new Graphics();
    ob.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.72 });
    ov.addChild(ob);
    const big = new Text({ text: "Time's Up!", style: { fontFamily: FONT, fontWeight: FW, fontSize: 56, fill: COL_ACCENT, align: "center", stroke: { color: 0x000000, width: 6 } } });
    big.anchor.set(0.5); big.x = W / 2; big.y = H * 0.32; ov.addChild(big);
    const sc = new Text({ text: "Score: " + score, style: { fontFamily: FONT, fontWeight: FW, fontSize: 44, fill: COL_TEXT, align: "center", stroke: { color: 0x000000, width: 5 } } });
    sc.anchor.set(0.5); sc.x = W / 2; sc.y = H * 0.45; ov.addChild(sc);
    uiLayer.addChild(ov);
    uiLayer.addChild(cta);
    gsap.fromTo(big.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.5, ease: "back.out(2.5)" });
    gsap.to(cta.scale, { x: 1.12, y: 1.12, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // ---- main loop ----
  app.ticker.add(() => {
    const dtReal = Math.min(app.ticker.deltaMS / 1000, 0.05);
    T += dtReal;

    // timers (real)
    if (slowmoTimer > 0) slowmoTimer -= dtReal;
    if (shakeTimer > 0) shakeTimer -= dtReal;
    if (doubleTimer > 0) { doubleTimer -= dtReal; if (doubleTimer <= 0) scoreMult = 1; }
    if (freezeTimer > 0) freezeTimer -= dtReal;
    if (frenzyTimer > 0) frenzyTimer -= dtReal;
    if (pomTimer > 0) pomTimer -= dtReal;

    const tScale = freezeTimer > 0 ? 0.4 : slowmoTimer > 0 ? 0.35 : 1;
    const dt = dtReal * tScale;

    // zoom
    const targetZoom = (slowmoTimer > 0 || freezeTimer > 0) ? 1.05 : 1;
    curZoom += (targetZoom - curZoom) * Math.min(1, dtReal * 8);
    worldLayer.scale.set(curZoom);

    // shake
    if (shakeTimer > 0) { app.stage.x = rand(-12, 12); app.stage.y = rand(-12, 12); }
    else { app.stage.x = 0; app.stage.y = 0; }

    if (started && !ended) {
      gameTime += dtReal;
      timeTxt.text = Math.max(0, Math.ceil(GAME_TIME - gameTime)) + "s";
      // spawning
      spawnTimer -= dtReal;
      const interval = frenzyTimer > 0 ? 0.45 : diff.spawnWaitSec();
      if (spawnTimer <= 0) { spawnWave(); spawnTimer = interval; }
      if (gameTime >= GAME_TIME) endGame();
    }

    // lives display
    for (let i = 0; i < hearts.length; i++) hearts[i].alpha = i < lives ? 1 : 0.2;

    // fruits / bombs
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      o.p.update(dt);
      o.node.x = o.p.x; o.node.y = o.p.y; o.node.rotation = o.p.rotation;
      if (o.glow) o.glow.rotation = -o.p.rotation;
      if (o.p.done || o.node.y > H + o.r * 2) {
        if (!o.sliced && o.kind === "fruit") diff.recordMiss();
        o.node.destroy();
        objs.splice(i, 1);
      }
    }

    // cut halves
    for (let i = cuts.length - 1; i >= 0; i--) {
      const c = cuts[i];
      c.gv += 700 * dt;
      c.cutGroup.y += c.gv * dt;
      c.life -= dtReal;
      for (const part of c.parts) {
        part.half.y += part.vy * dt;
        part.half.x += part.vx * dt;
        part.half.rotation += part.vr * dt;
      }
      if (c.life < 0.5) c.cutGroup.alpha = Math.max(0, c.life / 0.5);
      if (c.life <= 0) { c.cutGroup.destroy(); cuts.splice(i, 1); }
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.vy += 900 * dt;
      pt.g.x += pt.vx * dt; pt.g.y += pt.vy * dt;
      pt.life -= dtReal;
      pt.g.alpha = Math.max(0, pt.life / pt.max);
      if (pt.life <= 0) { pt.g.destroy(); particles.splice(i, 1); }
    }

    // slowly fade old stains (signature: they linger)
    for (const s of stains) { if (s.alpha > 0.18) s.alpha -= dtReal * 0.02; }

    // blade trail
    while (trail.length && T - trail[0].t > 0.2) trail.shift();
    trailG.clear();
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        const k = i / trail.length;
        const w = 2 + 16 * k;
        trailG.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: w + 6, color: 0xffffff, alpha: 0.18 * k, cap: "round" });
      }
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        const k = i / trail.length;
        const w = 2 + 9 * k;
        trailG.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: w, color: 0xffffff, alpha: 0.9 * k, cap: "round" });
      }
    }
  });
}
void main();
