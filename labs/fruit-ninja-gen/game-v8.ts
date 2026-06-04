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
function sfx(k: string): void { try { const a = new Audio(cfg.assets[k]); a.volume = 0.5; a.play().catch(() => {}); } catch (e) {} }

const FRUIT_COLORS = [0xff4d4d, 0xffb24d, 0xffe24d, 0x9be24d, 0xff7eb6, 0xb06bff];

async function main(): Promise<void> {
  if (!window.FbPlayableAd) window.FbPlayableAd = { onCTAClick: () => {} };

  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);

  const KEYS = ["fruit1.webp","fruit2.webp","fruit3.webp","fruit4.webp","fruit5.webp","fruit6.webp","half1.webp","half2.webp","half3.webp","half4.webp","half5.webp","half6.webp","bomb.webp","bg.webp","splat1.webp","splat2.webp","splat3.webp","splat4.webp"];
  const tex: Record<string, Texture> = {};
  for (const k of KEYS) { try { tex[k] = await Assets.load({ src: cfg.assets[k], format: "webp" }); } catch (e) {} }

  // ---------- layers ----------
  const world = new Container();
  app.stage.addChild(world);

  const bgSprite = new Sprite(tex["bg.webp"]);
  const splatLayer = new Container();
  const fruitLayer = new Container();
  const halfLayer = new Container();
  const particleLayer = new Container();
  const trailG = new Graphics();
  world.addChild(bgSprite, splatLayer, fruitLayer, halfLayer, particleLayer, trailG);
  for (const l of [splatLayer, fruitLayer, halfLayer, particleLayer]) l.interactiveChildren = false;
  trailG.eventMode = "none";

  const ui = new Container();
  app.stage.addChild(ui);

  // ---------- UI ----------
  const fam = cfg.style.font.family;
  const scoreText = new Text({ text: "0", style: { fill: num(cfg.style.colors.text), fontFamily: fam, fontSize: 54, fontWeight: "900" } });
  const titleText = new Text({ text: cfg.copy.title, style: { fill: num(cfg.style.colors.text), fontFamily: fam, fontSize: 30, fontWeight: cfg.style.font.weight as any } });
  titleText.anchor.set(0.5, 0);
  const livesText = new Text({ text: "♥♥♥", style: { fill: num(cfg.style.colors.accent), fontFamily: fam, fontSize: 32, fontWeight: "900" } });
  livesText.anchor.set(1, 0);
  ui.addChild(scoreText, titleText, livesText);

  const banner = new Text({ text: "", style: { fill: num(cfg.style.colors.accent), fontFamily: fam, fontSize: 48, fontWeight: "900", align: "center" } });
  banner.anchor.set(0.5);
  banner.alpha = 0;
  ui.addChild(banner);

  // CTA
  const cta = new Container();
  const ctaBg = new Graphics();
  const ctaText = new Text({ text: cfg.copy.cta, style: { fill: 0xffffff, fontFamily: fam, fontSize: 30, fontWeight: "900" } });
  ctaText.anchor.set(0.5);
  cta.addChild(ctaBg, ctaText);
  cta.eventMode = "static";
  cta.cursor = "pointer";
  function drawCta(): void {
    ctaBg.clear();
    ctaBg.roundRect(-150, -34, 300, 68, 34).fill(num(cfg.style.colors.accent));
    ctaBg.roundRect(-150, -34, 300, 68, 34).stroke({ width: 3, color: 0xffffff, alpha: 0.8 });
  }
  drawCta();
  function doCTA(): void { window.FbPlayableAd.onCTAClick(); }
  cta.on("pointertap", doCTA);
  ui.addChild(cta);
  gsap.to(cta.scale, { x: 1.06, y: 1.06, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });

  // ---------- hint ----------
  const hint = new Container();
  const hand = new Graphics();
  hand.circle(0, 0, 26).fill({ color: 0xffffff, alpha: 0.85 });
  hand.circle(0, 0, 26).stroke({ width: 4, color: num(cfg.style.colors.accent) });
  const hintText = new Text({ text: "Swipe to slice!", style: { fill: num(cfg.style.colors.text), fontFamily: fam, fontSize: 34, fontWeight: "900" } });
  hintText.anchor.set(0.5);
  hint.addChild(hand, hintText);
  ui.addChild(hint);

  // ---------- state ----------
  type GObj = { kind: "fruit" | "bomb"; special: string | null; fruitN: number; cont: Container; sprite: Sprite; glow: Graphics | null; p: any; r: number; alive: boolean };
  const objs: GObj[] = [];
  type Half = { cont: Container; vx: number; vy: number; rot: number; life: number };
  const halves: Half[] = [];
  type Part = { g: Graphics; vx: number; vy: number; life: number };
  const parts: Part[] = [];
  type Splat = { s: Sprite; life: number };
  const splats: Splat[] = [];
  type TP = { x: number; y: number; t: number };
  const trail: TP[] = [];

  const diff = new DifficultyController();
  let score = 0;
  let lives = 3;
  let now = 0;
  let tScale = 1;
  let spawnTimer = 0.6;
  let gameTimeLeft = 28;
  let running = true;
  let started = false;

  let swipeCount = 0;
  let chain = 0;
  let lastSliceTime = -10;
  let frenzyUntil = -1, freezeUntil = -1, doubleUntil = -1;

  // ---------- helpers ----------
  function W(): number { return app.screen.width; }
  function H(): number { return app.screen.height; }

  function showBanner(txt: string, color: number): void {
    banner.text = txt;
    banner.style.fill = color;
    banner.alpha = 1;
    banner.scale.set(0.4);
    gsap.killTweensOf(banner);
    gsap.killTweensOf(banner.scale);
    gsap.to(banner.scale, { x: 1, y: 1, duration: 0.3, ease: "back.out(2)" });
    gsap.to(banner, { alpha: 0, duration: 0.6, delay: 0.7 });
  }

  function popScore(): void {
    gsap.killTweensOf(scoreText.scale);
    scoreText.scale.set(1.4);
    gsap.to(scoreText.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(3)" });
  }

  function slowMo(dur: number): void {
    tScale = 0.35;
    const holder = { t: 0.35 };
    gsap.killTweensOf(holder);
    gsap.to(holder, { t: 1, duration: dur, ease: "power2.in", onUpdate: () => { tScale = holder.t; } });
    gsap.to(world.scale, { x: 1.06, y: 1.06, duration: 0.18, yoyo: true, repeat: 1, ease: "sine.inOut" });
  }

  function spawnParticles(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const g = new Graphics();
      g.circle(0, 0, 3 + Math.random() * 5).fill(color);
      g.x = x; g.y = y;
      particleLayer.addChild(g);
      const ang = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 260;
      parts.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 100, life: 0 });
    }
  }

  function addSplat(x: number, y: number, color: number): void {
    const key = "splat" + (1 + Math.floor(Math.random() * 4)) + ".webp";
    const s = new Sprite(tex[key]);
    s.anchor.set(0.5);
    s.x = x; s.y = y;
    s.tint = color;
    s.alpha = 0.45;
    s.rotation = Math.random() * Math.PI * 2;
    s.scale.set(0.4 + Math.random() * 0.5);
    splatLayer.addChild(s);
    splats.push({ s, life: 0 });
  }

  function spawnHalves(x: number, y: number, fruitN: number, angle: number, scl: number): void {
    for (const side of [-1, 1]) {
      const c = new Container();
      c.x = x; c.y = y; c.rotation = angle;
      const s = new Sprite(tex["half" + fruitN + ".webp"]);
      s.anchor.set(0.5);
      s.scale.set(scl);
      const m = new Graphics();
      const w = 260;
      if (side === -1) m.rect(-w, -w, 2 * w, w).fill(0xffffff);
      else m.rect(-w, 0, 2 * w, w).fill(0xffffff);
      c.addChild(s, m);
      s.mask = m;
      halfLayer.addChild(c);
      const vx = Math.cos(angle + Math.PI / 2) * 240 * side - 30 + Math.random() * 60;
      const vy = Math.sin(angle + Math.PI / 2) * 240 * side - 120;
      halves.push({ cont: c, vx, vy, rot: side * (1.5 + Math.random()), life: 0 });
    }
  }

  // ---------- spawning ----------
  function spawnOne(): void {
    const frenzy = now < frenzyUntil;
    let kind: "fruit" | "bomb" = "fruit";
    let special: string | null = null;

    if (!frenzy && now > 9 && Math.random() < diff.bombProbability()) {
      kind = "bomb";
    } else if (Math.random() < 0.07) {
      const pool = ["frenzy", "freeze", "double", "pomegranate"];
      special = pool[Math.floor(Math.random() * pool.length)];
    }

    const fruitN = 1 + Math.floor(Math.random() * 6);
    const cont = new Container();
    const fromX = W() * (0.15 + Math.random() * 0.7);

    let sprite: Sprite;
    let glow: Graphics | null = null;
    let r = 52 + Math.random() * 18;

    if (kind === "bomb") {
      sprite = new Sprite(tex["bomb.webp"]);
      r = 54;
    } else {
      sprite = new Sprite(tex["fruit" + fruitN + ".webp"]);
      if (special === "pomegranate") r = 78;
      if (special) {
        const gc = special === "frenzy" ? 0xff8a1e : special === "freeze" ? 0x4dc4ff : special === "double" ? 0xffd24d : 0xc83cff;
        glow = new Graphics();
        glow.circle(0, 0, r + 14).stroke({ width: 8, color: gc, alpha: 0.9 });
        glow.circle(0, 0, r + 14).fill({ color: gc, alpha: 0.12 });
        cont.addChild(glow);
        gsap.to(glow, { alpha: 0.4, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
      }
    }
    sprite.anchor.set(0.5);
    const scl = (r * 2) / Math.max(1, sprite.texture.width);
    sprite.scale.set(scl);
    cont.addChild(sprite);
    fruitLayer.addChild(cont);

    const p = makeArc({
      fromX,
      fromY: H() + 60,
      screenH: H(),
      timeAloftSec: 2.4,
      apexFraction: 0.72,
      angleDeg: randomLaunchAngle(Math.random()),
      spinRadPerSec: (Math.random() - 0.5) * 4,
    });
    cont.x = p.x; cont.y = p.y;
    objs.push({ kind, special, fruitN, cont, sprite, glow, p, r: r * scl / scl, alive: true });
  }

  function removeObj(o: GObj): void {
    const i = objs.indexOf(o);
    if (i >= 0) objs.splice(i, 1);
    if (o.glow) gsap.killTweensOf(o.glow);
    fruitLayer.removeChild(o.cont);
    o.cont.destroy({ children: true });
  }

  // ---------- slicing ----------
  function applyEffect(o: GObj, angle: number): void {
    const color = FRUIT_COLORS[o.fruitN - 1];
    addSplat(o.cont.x, o.cont.y, color);
    spawnParticles(o.cont.x, o.cont.y, color, 14);
    if (o.sprite) o.sprite.visible = false;
    spawnHalves(o.cont.x, o.cont.y, o.fruitN, angle, o.sprite.scale.x);
    sfx("slice.wav");

    let gained = 1;
    const mult = (now < doubleUntil ? 2 : 1) * (swipeCount >= 3 ? 2 : 1);

    if (o.special === "frenzy") {
      frenzyUntil = now + 5;
      for (const b of [...objs]) if (b.kind === "bomb") removeObj(b);
      showBanner("FRENZY!", 0xff8a1e); gained = 3;
    } else if (o.special === "freeze") {
      freezeUntil = now + 3;
      showBanner("FREEZE!", 0x4dc4ff); gained = 3;
    } else if (o.special === "double") {
      doubleUntil = now + 5;
      showBanner("DOUBLE!", 0xffd24d); gained = 3;
    } else if (o.special === "pomegranate") {
      showBanner("POMEGRANATE!", 0xc83cff);
      spawnParticles(o.cont.x, o.cont.y, color, 40);
      gained = 8;
      slowMo(0.5);
    }

    score += gained * mult;
    diff.recordHit();
  }

  function sliceObj(o: GObj, angle: number): void {
    if (!o.alive) return;
    o.alive = false;
    if (o.kind === "bomb") {
      // soft penalty
      sfx("bomb.wav");
      lives = Math.max(0, lives - 1);
      livesText.text = "♥♥♥♥♥".slice(0, lives) || "·";
      score = Math.max(0, score - 3);
      spawnParticles(o.cont.x, o.cont.y, 0xff3030, 30);
      const flash = new Graphics();
      flash.rect(0, 0, W(), H()).fill({ color: 0xff2020, alpha: 0.5 });
      ui.addChild(flash);
      gsap.to(flash, { alpha: 0, duration: 0.4, onComplete: () => { ui.removeChild(flash); flash.destroy(); } });
      const ox = world.x;
      gsap.to(world, { x: ox + 18, duration: 0.05, yoyo: true, repeat: 6, ease: "none", onComplete: () => { world.x = ox; } });
      removeObj(o);
      diff.recordBombHit();
      popScore();
      return;
    }
    // fruit
    swipeCount++;
    if (now - lastSliceTime < 1.0) chain++; else chain = 1;
    lastSliceTime = now;
    applyEffect(o, angle);
    if (chain >= 3 || swipeCount >= 3) {
      showBanner("Combo x" + Math.max(chain, swipeCount) + "!", num(cfg.style.colors.accent));
      sfx("combo.wav");
      if (swipeCount === 3) slowMo(0.45);
    }
    scoreText.text = String(score);
    popScore();
    removeObj(o);
  }

  // ---------- pointer ----------
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  let down = false;
  let lastX = 0, lastY = 0;

  app.stage.on("pointerdown", (e: any) => {
    down = true; swipeCount = 0;
    lastX = e.global.x; lastY = e.global.y;
    if (!started) { started = true; gsap.killTweensOf(hand); hint.visible = false; }
  });
  app.stage.on("pointerup", () => { down = false; swipeCount = 0; });
  app.stage.on("pointerupoutside", () => { down = false; swipeCount = 0; });

  app.stage.on("pointermove", (e: any) => {
    const x = e.global.x, y = e.global.y;
    trail.push({ x, y, t: now });
    if (!down || !running) { lastX = x; lastY = y; return; }
    const moved = Math.hypot(x - lastX, y - lastY);
    if (moved > 4) {
      const angle = Math.atan2(y - lastY, x - lastX);
      for (const o of [...objs]) {
        if (!o.alive) continue;
        const d = distToSeg(o.cont.x, o.cont.y, lastX, lastY, x, y);
        if (d < o.r + 8) sliceObj(o, angle);
      }
    }
    lastX = x; lastY = y;
  });

  function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // ---------- endcard ----------
  let ended = false;
  function showEndcard(): void {
    if (ended) return;
    ended = true; running = false;
    sfx("combo.wav");
    const ov = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, W(), H()).fill({ color: 0x000000, alpha: 0.62 });
    ov.addChild(bg);
    const big = new Text({ text: "Score " + score, style: { fill: 0xffffff, fontFamily: fam, fontSize: 64, fontWeight: "900" } });
    big.anchor.set(0.5); big.x = W() / 2; big.y = H() * 0.34;
    const sub = new Text({ text: cfg.copy.title, style: { fill: num(cfg.style.colors.accent), fontFamily: fam, fontSize: 34, fontWeight: "900" } });
    sub.anchor.set(0.5); sub.x = W() / 2; sub.y = H() * 0.46;
    ov.addChild(big, sub);
    ui.addChild(ov);
    ov.alpha = 0;
    gsap.to(ov, { alpha: 1, duration: 0.4 });
    ui.removeChild(cta); ui.addChild(cta); // keep CTA on top
    cta.scale.set(1);
    gsap.fromTo(cta.scale, { x: 1.2, y: 1.2 }, { x: 1.06, y: 1.06, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // ---------- ticker ----------
  app.ticker.add(() => {
    const rawDt = Math.min(0.05, app.ticker.deltaMS / 1000);
    now += rawDt;
    let ts = tScale;
    if (now < freezeUntil) ts = Math.min(ts, 0.4);
    const dt = rawDt * ts;

    if (running) {
      gameTimeLeft -= rawDt;
      if (gameTimeLeft <= 0) showEndcard();

      // spawn
      spawnTimer -= rawDt;
      if (spawnTimer <= 0) {
        const cnt = now < frenzyUntil ? 3 : diff.parallelCount();
        for (let i = 0; i < cnt; i++) spawnOne();
        if (cnt > 0) sfx("throw.wav");
        spawnTimer = now < frenzyUntil ? 0.45 : Math.max(0.4, diff.spawnWaitSec());
      }
    }

    // objects
    for (const o of [...objs]) {
      o.p.update(dt);
      o.cont.x = o.p.x; o.cont.y = o.p.y;
      o.sprite.rotation = o.p.rotation;
      if (o.p.done || o.cont.y > H() + 120) {
        if (o.alive && o.kind === "fruit") diff.recordMiss();
        removeObj(o);
      }
    }

    // halves
    for (let i = halves.length - 1; i >= 0; i--) {
      const h = halves[i];
      h.vy += 1100 * dt;
      h.cont.x += h.vx * dt;
      h.cont.y += h.vy * dt;
      h.cont.rotation += h.rot * dt;
      h.life += rawDt;
      if (h.life > 1.4) { h.cont.alpha = Math.max(0, 1 - (h.life - 1.4) * 3); }
      if (h.life > 1.8 || h.cont.y > H() + 200) { halfLayer.removeChild(h.cont); h.cont.destroy({ children: true }); halves.splice(i, 1); }
    }

    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const pt = parts[i];
      pt.vy += 900 * dt;
      pt.g.x += pt.vx * dt;
      pt.g.y += pt.vy * dt;
      pt.life += rawDt;
      pt.g.alpha = Math.max(0, 1 - pt.life * 1.4);
      if (pt.life > 0.7) { particleLayer.removeChild(pt.g); pt.g.destroy(); parts.splice(i, 1); }
    }

    // splats (slow fade, accumulate)
    for (let i = splats.length - 1; i >= 0; i--) {
      const sp = splats[i];
      sp.life += rawDt;
      if (sp.life > 4) sp.s.alpha = Math.max(0, sp.s.alpha - rawDt * 0.04);
      if (sp.s.alpha <= 0.02) { splatLayer.removeChild(sp.s); sp.s.destroy(); splats.splice(i, 1); }
    }

    // trail
    while (trail.length && now - trail[0].t > 0.2) trail.shift();
    trailG.clear();
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      const age = (now - b.t) / 0.2;
      const al = Math.max(0, 1 - age);
      trailG.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 10 * al + 2, color: 0xffffff, alpha: 0.5 * al, cap: "round" });
    }
  });

  // ---------- layout ----------
  function layout(): void {
    const w = W(), h = H();
    if (bgSprite.texture && bgSprite.texture.width) {
      const s = Math.max(w / bgSprite.texture.width, h / bgSprite.texture.height);
      bgSprite.scale.set(s);
      bgSprite.anchor.set(0.5);
      bgSprite.x = w / 2; bgSprite.y = h / 2;
    }
    world.pivot.set(w / 2, h / 2);
    world.position.set(w / 2, h / 2);

    scoreText.x = 24; scoreText.y = 20;
    livesText.x = w - 24; livesText.y = 22;
    titleText.x = w / 2; titleText.y = 18;

    banner.x = w / 2; banner.y = h * 0.28;

    cta.x = w / 2; cta.y = h - 56;

    hint.x = w / 2; hint.y = h * 0.5;
    if (!started) {
      gsap.killTweensOf(hand);
      hand.x = -90; hand.y = 40;
      gsap.to(hand, { x: 90, y: -30, duration: 1, yoyo: true, repeat: -1, ease: "sine.inOut" });
      hintText.y = -50;
    }
  }
  layout();
  window.addEventListener("resize", layout);
}
void main();
