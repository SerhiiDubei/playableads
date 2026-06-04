import { Application, Container, Graphics, Sprite, Texture, Assets, Text } from "pixi.js";
import { gsap } from "gsap";
import { makeApproach, DifficultyController } from "../../src/assetgen/kit/motion.js";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

declare global {
  interface Window { FbPlayableAd: { onCTAClick: () => void }; }
}

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }
function sfx(k: string): void { try { const a = new Audio(cfg.assets[k]); a.volume = 0.5; a.play().catch(() => {}); } catch (e) {} }

const BLOOD = 0x9e0e14;
const DEMON_TINTS = [0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff];

async function main(): Promise<void> {
  if (!window.FbPlayableAd) window.FbPlayableAd = { onCTAClick: () => {} };

  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);

  const KEYS = ["bg.webp", "demon1.webp", "demon2.webp", "demon3.webp", "demon4.webp", "demon5.webp", "demon6.webp", "splat1.webp", "splat2.webp", "splat3.webp", "splat4.webp", "warrior.webp"];
  const tex: Record<string, Texture> = {};
  for (const k of KEYS) { try { tex[k] = await Assets.load({ src: cfg.assets[k], format: "webp" }); } catch (e) {} }

  // ---------- layers ----------
  const world = new Container();
  app.stage.addChild(world);

  const bgSprite = new Sprite(tex["bg.webp"]);
  const nightVeil = new Graphics();          // darkness limiting visibility
  const splatLayer = new Container();        // blood stains accumulate
  const warriorC = new Container();
  const demonLayer = new Container();
  const halfLayer = new Container();
  const particleLayer = new Container();
  const trailG = new Graphics();             // glowing blade trail
  world.addChild(bgSprite, nightVeil, splatLayer, warriorC, demonLayer, halfLayer, particleLayer, trailG);
  for (const l of [splatLayer, demonLayer, halfLayer, particleLayer]) l.interactiveChildren = false;
  nightVeil.eventMode = "none"; trailG.eventMode = "none"; warriorC.interactiveChildren = false;

  const warrior = new Sprite(tex["warrior.webp"]);
  warrior.anchor.set(0.5, 0.55);
  warriorC.addChild(warrior);

  const ui = new Container();
  app.stage.addChild(ui);

  // ---------- UI ----------
  const fam = cfg.style.font.family;
  const scoreText = new Text({ text: "0", style: { fill: num(cfg.style.colors.text), fontFamily: fam, fontSize: 54, fontWeight: "900" } });
  const titleText = new Text({ text: cfg.copy.title, style: { fill: num(cfg.style.colors.text), fontFamily: fam, fontSize: 26, fontWeight: cfg.style.font.weight as any, align: "center" } });
  titleText.anchor.set(0.5, 0);
  const livesText = new Text({ text: "♥♥♥", style: { fill: num(cfg.style.colors.accent), fontFamily: fam, fontSize: 34, fontWeight: "900" } });
  livesText.anchor.set(1, 0);
  ui.addChild(scoreText, titleText, livesText);

  const banner = new Text({ text: "", style: { fill: num(cfg.style.colors.accent), fontFamily: fam, fontSize: 48, fontWeight: "900", align: "center" } });
  banner.anchor.set(0.5); banner.alpha = 0;
  ui.addChild(banner);

  // CTA (sticky bottom)
  const cta = new Container();
  const ctaBg = new Graphics();
  const ctaText = new Text({ text: cfg.copy.cta, style: { fill: 0xffffff, fontFamily: fam, fontSize: 30, fontWeight: "900" } });
  ctaText.anchor.set(0.5);
  cta.addChild(ctaBg, ctaText);
  cta.eventMode = "static"; cta.cursor = "pointer";
  ctaBg.roundRect(-155, -34, 310, 68, 34).fill(num(cfg.style.colors.accent));
  ctaBg.roundRect(-155, -34, 310, 68, 34).stroke({ width: 3, color: 0xffffff, alpha: 0.85 });
  cta.on("pointertap", () => { window.FbPlayableAd.onCTAClick(); });
  ui.addChild(cta);
  gsap.to(cta.scale, { x: 1.06, y: 1.06, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });

  // ---------- hint ----------
  const hint = new Container();
  const hand = new Graphics();
  hand.circle(0, 0, 24).fill({ color: 0xffffff, alpha: 0.9 });
  hand.circle(0, 0, 24).stroke({ width: 4, color: num(cfg.style.colors.accent) });
  const hintText = new Text({ text: "Swipe to slay!", style: { fill: num(cfg.style.colors.text), fontFamily: fam, fontSize: 34, fontWeight: "900" } });
  hintText.anchor.set(0.5);
  hint.addChild(hand, hintText);
  ui.addChild(hint);

  // ---------- state ----------
  type Demon = { special: string | null; demonN: number; cont: Container; sprite: Sprite; glow: Graphics | null; m: any; r: number; alive: boolean };
  const demons: Demon[] = [];
  type Half = { cont: Container; vx: number; vy: number; rot: number; life: number };
  const halves: Half[] = [];
  type Part = { g: Graphics; vx: number; vy: number; life: number };
  const parts: Part[] = [];
  type Splat = { s: Sprite; life: number };
  const splats: Splat[] = [];
  type TP = { x: number; y: number; t: number };
  const trail: TP[] = [];

  const diff = new DifficultyController({ waitMin: 0.45, waitMax: 1.6, parallelMin: 1, parallelMax: 4 });
  let score = 0;
  let lives = 3;
  let now = 0;
  let tScale = 1;
  let spawnTimer = 0.8;
  let gameTimeLeft = 28;
  let running = true;
  let started = false;

  let swipeCount = 0;
  let chain = 0;
  let lastSliceTime = -10;
  let frenzyUntil = -1, riftUntil = -1;

  function W(): number { return app.screen.width; }
  function H(): number { return app.screen.height; }
  function warriorX(): number { return W() / 2; }
  function warriorY(): number { return H() * 0.5; }

  function showBanner(txt: string, color: number): void {
    banner.text = txt; banner.style.fill = color; banner.alpha = 1; banner.scale.set(0.4);
    gsap.killTweensOf(banner); gsap.killTweensOf(banner.scale);
    gsap.to(banner.scale, { x: 1, y: 1, duration: 0.3, ease: "back.out(2)" });
    gsap.to(banner, { alpha: 0, duration: 0.6, delay: 0.75 });
  }
  function popScore(): void {
    gsap.killTweensOf(scoreText.scale);
    scoreText.scale.set(1.4);
    gsap.to(scoreText.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(3)" });
  }
  function slowMo(dur: number): void {
    tScale = 0.32;
    const holder = { t: 0.32 };
    gsap.killTweensOf(holder);
    gsap.to(holder, { t: 1, duration: dur, ease: "power2.in", onUpdate: () => { tScale = holder.t; } });
    gsap.to(world.scale, { x: 1.05, y: 1.05, duration: 0.18, yoyo: true, repeat: 1, ease: "sine.inOut" });
  }

  function spawnParticles(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const g = new Graphics();
      g.circle(0, 0, 3 + Math.random() * 5).fill(color);
      g.x = x; g.y = y;
      particleLayer.addChild(g);
      const ang = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 280;
      parts.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60, life: 0 });
    }
  }
  function addSplat(x: number, y: number, color: number): void {
    const key = "splat" + (1 + Math.floor(Math.random() * 4)) + ".webp";
    const s = new Sprite(tex[key]);
    s.anchor.set(0.5); s.x = x; s.y = y;
    s.tint = color; s.alpha = 0.45;
    s.rotation = Math.random() * Math.PI * 2;
    s.scale.set(0.45 + Math.random() * 0.55);
    splatLayer.addChild(s);
    splats.push({ s, life: 0 });
  }
  function spawnHalves(x: number, y: number, demonN: number, angle: number, scl: number): void {
    for (const side of [-1, 1]) {
      const c = new Container();
      c.x = x; c.y = y; c.rotation = angle;
      const s = new Sprite(tex["demon" + demonN + ".webp"]);
      s.anchor.set(0.5); s.scale.set(scl);
      const m = new Graphics();
      const w = 300;
      if (side === -1) m.rect(-w, -w, 2 * w, w).fill(0xffffff);
      else m.rect(-w, 0, 2 * w, w).fill(0xffffff);
      c.addChild(s, m); s.mask = m;
      halfLayer.addChild(c);
      const vx = Math.cos(angle + Math.PI / 2) * 260 * side - 20 + Math.random() * 40;
      const vy = Math.sin(angle + Math.PI / 2) * 260 * side - 140;
      halves.push({ cont: c, vx, vy, rot: side * (1.6 + Math.random()), life: 0 });
    }
  }

  // ---------- spawning ----------
  function edgeStart(): { x: number; y: number } {
    const side = Math.floor(Math.random() * 3); // 0 top, 1 left, 2 right
    if (side === 0) return { x: W() * (0.12 + Math.random() * 0.76), y: -90 };
    if (side === 1) return { x: -90, y: H() * (0.12 + Math.random() * 0.55) };
    return { x: W() + 90, y: H() * (0.12 + Math.random() * 0.55) };
  }

  function spawnOne(): void {
    const frenzy = now < frenzyUntil;
    let special: string | null = null;
    if (!frenzy && Math.random() < 0.08) {
      const pool = ["bloodmoon", "soulorb", "timerift"];
      special = pool[Math.floor(Math.random() * pool.length)];
    }
    const demonN = 1 + Math.floor(Math.random() * 6);
    const cont = new Container();
    const st = edgeStart();
    let r = 48 + Math.random() * 16;

    const sprite = new Sprite(tex["demon" + demonN + ".webp"]);
    sprite.tint = DEMON_TINTS[demonN - 1];
    let glow: Graphics | null = null;
    if (special) {
      r = 56;
      const gc = special === "bloodmoon" ? 0xff2a2a : special === "soulorb" ? 0x5cf2ff : 0xc066ff;
      glow = new Graphics();
      glow.circle(0, 0, r + 16).stroke({ width: 8, color: gc, alpha: 0.9 });
      glow.circle(0, 0, r + 16).fill({ color: gc, alpha: 0.14 });
      cont.addChild(glow);
      gsap.to(glow, { alpha: 0.4, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }
    sprite.anchor.set(0.5);
    const scl = (r * 2) / Math.max(1, sprite.texture.width);
    sprite.scale.set(scl);
    cont.addChild(sprite);
    cont.x = st.x; cont.y = st.y; cont.alpha = 0;
    demonLayer.addChild(cont);
    gsap.to(cont, { alpha: 1, duration: 0.4 });

    const m = makeApproach({
      fromX: st.x, fromY: st.y,
      toX: warriorX(), toY: warriorY(),
      screenH: H(),
      speedShPerSec: 0.12 + Math.random() * 0.05, // slow, rigged: player almost always slays in time
      arriveRadius: 58,
    });
    demons.push({ special, demonN, cont, sprite, glow, m, r, alive: true });
    sfx("spawn.wav");
  }

  function removeDemon(o: Demon): void {
    const i = demons.indexOf(o);
    if (i >= 0) demons.splice(i, 1);
    if (o.glow) gsap.killTweensOf(o.glow);
    gsap.killTweensOf(o.cont);
    demonLayer.removeChild(o.cont);
    o.cont.destroy({ children: true });
  }

  function hurt(): void {
    sfx("hurt.wav");
    lives = Math.max(0, lives - 1);
    livesText.text = "♥♥♥".slice(0, lives) || "·";
    const flash = new Graphics();
    flash.rect(0, 0, W(), H()).fill({ color: 0xc00000, alpha: 0.5 });
    flash.eventMode = "none";
    ui.addChildAt(flash, 0);
    gsap.to(flash, { alpha: 0, duration: 0.45, onComplete: () => { ui.removeChild(flash); flash.destroy(); } });
    const ox = world.x;
    gsap.killTweensOf(world);
    gsap.to(world, { x: ox + 20, duration: 0.05, yoyo: true, repeat: 6, ease: "none", onComplete: () => { world.x = ox; } });
    diff.recordMiss();
    if (lives <= 0) showEndcard();
  }

  // ---------- slashing ----------
  function slashDemon(o: Demon, angle: number): void {
    if (!o.alive) return;
    o.alive = false;
    const color = BLOOD;
    addSplat(o.cont.x, o.cont.y, color);
    spawnParticles(o.cont.x, o.cont.y, color, 16);
    o.sprite.visible = false;
    spawnHalves(o.cont.x, o.cont.y, o.demonN, angle, o.sprite.scale.x);
    sfx("slash.wav");

    swipeCount++;
    if (now - lastSliceTime < 1.0) chain++; else chain = 1;
    lastSliceTime = now;

    let gained = 1;
    const mult = swipeCount >= 3 ? 2 : 1;

    if (o.special === "bloodmoon") {
      frenzyUntil = now + 5; gained = 4;
      showBanner("BLOOD MOON!", 0xff2a2a);
      spawnParticles(o.cont.x, o.cont.y, 0xff2a2a, 32);
      slowMo(0.5);
    } else if (o.special === "soulorb") {
      lives = Math.min(3, lives + 1);
      livesText.text = "♥♥♥".slice(0, lives) || "·";
      gained = 3;
      showBanner("SOUL ORB +1", 0x5cf2ff);
    } else if (o.special === "timerift") {
      riftUntil = now + 3; gained = 3;
      showBanner("TIME RIFT!", 0xc066ff);
      slowMo(0.5);
    }

    score += gained * mult;
    diff.recordHit();

    if (chain >= 3 || swipeCount >= 3) {
      showBanner("Combo x" + Math.max(chain, swipeCount) + "!", num(cfg.style.colors.accent));
      sfx("combo.wav");
      if (swipeCount === 3) slowMo(0.45);
    }
    scoreText.text = String(score);
    popScore();
    removeDemon(o);
  }

  // ---------- pointer (only stage listens) ----------
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
      for (const o of [...demons]) {
        if (!o.alive) continue;
        const d = distToSeg(o.cont.x, o.cont.y, lastX, lastY, x, y);
        if (d < o.r + 10) slashDemon(o, angle);
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
    bg.rect(0, 0, W(), H()).fill({ color: 0x000000, alpha: 0.66 });
    bg.eventMode = "none";
    ov.addChild(bg);
    const big = new Text({ text: score + " Slain", style: { fill: 0xffffff, fontFamily: fam, fontSize: 60, fontWeight: "900" } });
    big.anchor.set(0.5); big.x = W() / 2; big.y = H() * 0.34;
    const sub = new Text({ text: cfg.copy.title, style: { fill: num(cfg.style.colors.accent), fontFamily: fam, fontSize: 32, fontWeight: "900", align: "center" } });
    sub.anchor.set(0.5); sub.x = W() / 2; sub.y = H() * 0.45;
    ov.addChild(big, sub);
    ui.addChild(ov);
    ov.alpha = 0;
    gsap.to(ov, { alpha: 1, duration: 0.4 });
    ui.removeChild(cta); ui.addChild(cta); // keep CTA on top
    cta.scale.set(1);
    gsap.killTweensOf(cta.scale);
    gsap.fromTo(cta.scale, { x: 1.2, y: 1.2 }, { x: 1.06, y: 1.06, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // ---------- ticker ----------
  app.ticker.add(() => {
    const rawDt = Math.min(0.05, app.ticker.deltaMS / 1000);
    now += rawDt;
    let ts = tScale;
    if (now < riftUntil) ts = Math.min(ts, 0.45);
    const dt = rawDt * ts;

    if (running) {
      gameTimeLeft -= rawDt;
      if (gameTimeLeft <= 0) showEndcard();

      spawnTimer -= rawDt;
      if (spawnTimer <= 0) {
        const cnt = now < frenzyUntil ? 4 : Math.max(1, diff.parallelCount());
        for (let i = 0; i < cnt; i++) spawnOne();
        spawnTimer = now < frenzyUntil ? 0.4 : Math.max(0.45, diff.spawnWaitSec());
      }
    }

    // demons approach the warrior
    for (const o of [...demons]) {
      o.m.update(dt);
      o.cont.x = o.m.x; o.cont.y = o.m.y;
      if (o.m.arrived) {
        if (o.alive) {
          o.alive = false;
          if (running) { if (o.special !== "soulorb") hurt(); }
          spawnParticles(o.cont.x, o.cont.y, 0x551111, 8);
          removeDemon(o);
        }
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
      if (h.life > 1.2) h.cont.alpha = Math.max(0, 1 - (h.life - 1.2) * 3);
      if (h.life > 1.7 || h.cont.y > H() + 220) { halfLayer.removeChild(h.cont); h.cont.destroy({ children: true }); halves.splice(i, 1); }
    }

    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const pt = parts[i];
      pt.vy += 900 * dt;
      pt.g.x += pt.vx * dt;
      pt.g.y += pt.vy * dt;
      pt.life += rawDt;
      pt.g.alpha = Math.max(0, 1 - pt.life * 1.4);
      if (pt.life > 0.75) { particleLayer.removeChild(pt.g); pt.g.destroy(); parts.splice(i, 1); }
    }

    // splats accumulate, slow fade
    for (let i = splats.length - 1; i >= 0; i--) {
      const sp = splats[i];
      sp.life += rawDt;
      if (sp.life > 5) sp.s.alpha = Math.max(0, sp.s.alpha - rawDt * 0.03);
      if (sp.s.alpha <= 0.02) { splatLayer.removeChild(sp.s); sp.s.destroy(); splats.splice(i, 1); }
    }

    // glowing blade trail
    while (trail.length && now - trail[0].t > 0.2) trail.shift();
    trailG.clear();
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      const age = (now - b.t) / 0.2;
      const al = Math.max(0, 1 - age);
      trailG.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 12 * al + 2, color: 0xffe8c0, alpha: 0.55 * al, cap: "round" });
    }
  });

  // idle warrior breathing
  gsap.to(warrior.scale, { x: 1.04, y: 0.97, duration: 1.1, yoyo: true, repeat: -1, ease: "sine.inOut" });

  // ---------- layout ----------
  function layout(): void {
    const w = W(), h = H();
    if (bgSprite.texture && bgSprite.texture.width) {
      const s = Math.max(w / bgSprite.texture.width, h / bgSprite.texture.height);
      bgSprite.scale.set(s);
      bgSprite.anchor.set(0.5);
      bgSprite.x = w / 2; bgSprite.y = h / 2;
    }
    // dark night veil that limits visibility (radial-ish via layered rects)
    nightVeil.clear();
    nightVeil.rect(0, 0, w, h).fill({ color: 0x05030a, alpha: 0.45 });

    world.pivot.set(w / 2, h / 2);
    world.position.set(w / 2, h / 2);

    warriorC.x = warriorX(); warriorC.y = warriorY();
    if (warrior.texture && warrior.texture.width) {
      const ws = (Math.min(w, h) * 0.26) / warrior.texture.width;
      warrior.scale.set(ws);
    }

    scoreText.x = 24; scoreText.y = 18;
    livesText.x = w - 24; livesText.y = 20;
    titleText.x = w / 2; titleText.y = 16;
    banner.x = w / 2; banner.y = h * 0.24;
    cta.x = w / 2; cta.y = h - 56;

    hint.x = w / 2; hint.y = h * 0.72;
    if (!started) {
      gsap.killTweensOf(hand);
      hand.x = -90; hand.y = 30;
      gsap.to(hand, { x: 90, y: -30, duration: 1, yoyo: true, repeat: -1, ease: "sine.inOut" });
      hintText.y = -54;
    }
  }
  layout();
  window.addEventListener("resize", layout);
}
void main();
