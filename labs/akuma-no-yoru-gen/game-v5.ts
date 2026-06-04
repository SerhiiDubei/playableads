import { Application, Container, Graphics, Sprite, Texture, Assets, Text } from "pixi.js";
import { gsap } from "gsap";
import { makeArc, makeApproach, makePlatformerBody, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }
function clamp(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)); }

const C = cfg.style.colors;
const FONT = cfg.style.font.family;
const FW = cfg.style.font.weight as any;

function sfx(k: string): void {
  try { const a = new Audio(cfg.assets[k]); a.volume = 0.5; a.play().catch(() => {}); } catch (e) {}
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: num(C.background), antialias: true });
  document.body.appendChild(app.canvas);

  // ── Preload pixel-art textures ──
  const tex: Record<string, Texture> = {};
  const keys = ["bg.webp", "demon1.webp", "demon2.webp", "demon3.webp", "ground.webp", "hero_attack.webp", "hero_idle.webp", "hero_jump.webp", "hero_run.webp"];
  for (const k of keys) {
    try {
      tex[k] = await Assets.load({ src: cfg.assets[k], format: k.endsWith(".webp") ? "webp" : "png" });
      if (tex[k] && (tex[k] as any).source) (tex[k] as any).source.scaleMode = "nearest";
    } catch (e) { /* missing asset tolerant */ }
  }

  let W = app.screen.width, H = app.screen.height;
  let WORLD_W = W * 3.5;
  let groundY = H * 0.82;

  // ── Layers ──
  const world = new Container();
  world.interactiveChildren = false;
  app.stage.addChild(world);

  const uiLayer = new Container();
  app.stage.addChild(uiLayer);

  const ctaLayer = new Container();
  app.stage.addChild(ctaLayer);

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // ── Background (parallax) ──
  const bg = tex["bg.webp"] ? new Sprite(tex["bg.webp"]) : new Sprite(Texture.WHITE);
  bg.anchor.set(0, 0);
  world.addChild(bg);

  // ── Ground (repeated) ──
  const groundLayer = new Container();
  world.addChild(groundLayer);
  const groundSprites: Sprite[] = [];

  // ── Enemy + hero + vfx containers ──
  const enemyLayer = new Container();
  enemyLayer.interactiveChildren = false;
  world.addChild(enemyLayer);

  const vfxLayer = new Container();
  vfxLayer.interactiveChildren = false;
  world.addChild(vfxLayer);

  // ── Goal / boss marker ──
  const goal = new Container();
  world.addChild(goal);
  const goalGlow = new Graphics();
  goal.addChild(goalGlow);
  const bossShape = new Graphics();
  goal.addChild(bossShape);
  const goalText = new Text({ text: "BOSS", style: { fontFamily: FONT, fontSize: 26, fontWeight: FW, fill: num(C.accent), align: "center" } });
  goalText.anchor.set(0.5, 1);
  goal.addChild(goalText);

  // ── Hero ──
  const hero = tex["hero_idle.webp"] ? new Sprite(tex["hero_idle.webp"]) : new Sprite(Texture.WHITE);
  hero.anchor.set(0.5, 1.0);
  world.addChild(hero);
  let baseScale = Math.min(W, H) * 0.0020;
  if (!tex["hero_idle.webp"]) { hero.width = 60; hero.height = 110; }

  // slash VFX
  const slash = new Graphics();
  slash.alpha = 0;
  world.addChild(slash);

  // ── Physics body ──
  const body = makePlatformerBody({
    x: W * 0.3, groundY, screenH: H,
    runSpeedShPerSec: 0.5, jumpHeightFraction: 0.26, jumpRiseSec: 0.4,
    minX: 60, maxX: WORLD_W - 60,
  });

  // ── State ──
  const input = { left: false, right: false };
  let jumpPressed = false;
  let attacking = false;
  let attackTimer = 0;
  let attackCooldown = 0;
  let lives = 5;
  let score = 0;
  let invuln = 0;
  let wasGrounded = true;
  let runBob = 0;
  let worldScroll = 0;
  let elapsed = 0;
  let gameOver = false;
  let won = false;
  const GRACE = 1.5;
  const TIME_LIMIT = 27;

  // ── Enemies ──
  interface Enemy { spr: Sprite; mover: any; alive: boolean; }
  const enemies: Enemy[] = [];
  const diff = new DifficultyController({ waitMin: 1.1, waitMax: 2.6 });
  let spawnTimer = 1.2;
  const enemyTexKeys = ["demon1.webp", "demon2.webp", "demon3.webp"];

  function spawnEnemy(): void {
    const key = enemyTexKeys[Math.floor(Math.random() * enemyTexKeys.length)];
    const spr = tex[key] ? new Sprite(tex[key]) : new Sprite(Texture.WHITE);
    spr.anchor.set(0.5, 1.0);
    const es = Math.min(W, H) * 0.0019;
    if (tex[key]) spr.scale.set(es); else { spr.width = 52; spr.height = 90; spr.tint = num(C.accent); }
    // spawn ahead of hero in world coords
    const fromX = clamp(body.x + W * 0.6 + Math.random() * W * 0.6, body.x + 200, WORLD_W - 80);
    const mover = makeApproach({
      fromX, fromY: groundY, toX: body.x, toY: groundY,
      screenH: H, speedShPerSec: 0.10 + Math.random() * 0.06, arriveRadius: 30,
    });
    spr.x = fromX; spr.y = groundY;
    enemyLayer.addChild(spr);
    enemies.push({ spr, mover, alive: true });
  }

  function killEnemy(e: Enemy): void {
    e.alive = false;
    score++;
    diff.recordHit();
    sfx("kill.wav");
    // sparks
    for (let i = 0; i < 10; i++) {
      const p = new Graphics();
      p.rect(-3, -3, 6, 6).fill(num(C.accent));
      p.x = e.spr.x; p.y = groundY - 40;
      vfxLayer.addChild(p);
      const ang = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 60;
      gsap.to(p, { x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d, alpha: 0, duration: 0.5, ease: "power2.out",
        onComplete: () => { try { vfxLayer.removeChild(p); p.destroy(); } catch (er) {} } });
    }
    // body fly + fade
    gsap.to(e.spr, { y: groundY - 60, alpha: 0, rotation: (Math.random() - 0.5) * 1.5, duration: 0.45, ease: "power1.out",
      onComplete: () => { try { enemyLayer.removeChild(e.spr); e.spr.destroy(); } catch (er) {} } });
    const idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
  }

  // ── UI: top HUD ──
  const title = new Text({ text: cfg.copy.title, style: { fontFamily: FONT, fontSize: 18, fontWeight: FW, fill: num(C.text) } });
  title.x = 12; title.y = 10;
  uiLayer.addChild(title);

  const heartsC = new Container();
  uiLayer.addChild(heartsC);
  const hearts: Graphics[] = [];
  function buildHearts(): void {
    heartsC.removeChildren();
    hearts.length = 0;
    for (let i = 0; i < 5; i++) {
      const g = new Graphics();
      g.circle(0, 0, 8).fill(num(C.primary));
      g.x = i * 22; g.y = 0;
      heartsC.addChild(g);
      hearts.push(g);
    }
  }
  buildHearts();
  function refreshHearts(): void { for (let i = 0; i < hearts.length; i++) hearts[i].alpha = i < lives ? 1 : 0.2; }

  const scoreT = new Text({ text: "", style: { fontFamily: FONT, fontSize: 16, fontWeight: FW, fill: num(C.text) } });
  uiLayer.addChild(scoreT);

  // red flash
  const flash = new Graphics();
  flash.rect(0, 0, W, H).fill(0xff2222);
  flash.alpha = 0;
  uiLayer.addChild(flash);

  // ── Control buttons ──
  function makeBtn(label: string, color: number): Container {
    const c = new Container();
    const g = new Graphics();
    g.roundRect(-40, -40, 80, 80, 16).fill({ color, alpha: 0.35 }).stroke({ color: 0xffffff, width: 2, alpha: 0.4 });
    c.addChild(g);
    const t = new Text({ text: label, style: { fontFamily: FONT, fontSize: 30, fontWeight: FW, fill: 0xffffff } });
    t.anchor.set(0.5);
    c.addChild(t);
    c.eventMode = "static";
    c.cursor = "pointer";
    uiLayer.addChild(c);
    return c;
  }
  const btnLeft = makeBtn("◀", num(C.primary));
  const btnRight = makeBtn("▶", num(C.primary));
  const btnJump = makeBtn("⤒", num(C.accent));
  const btnAttack = makeBtn("⚔", num(C.accent));

  btnLeft.on("pointerdown", (e) => { e.stopPropagation(); input.left = true; });
  btnLeft.on("pointerup", () => { input.left = false; });
  btnLeft.on("pointerupoutside", () => { input.left = false; });
  btnRight.on("pointerdown", (e) => { e.stopPropagation(); input.right = true; });
  btnRight.on("pointerup", () => { input.right = false; });
  btnRight.on("pointerupoutside", () => { input.right = false; });
  btnJump.on("pointerdown", (e) => { e.stopPropagation(); jumpPressed = true; });
  btnAttack.on("pointerdown", (e) => { e.stopPropagation(); doAttack(); });

  function doAttack(): void {
    if (attackCooldown > 0 || attacking) return;
    attacking = true;
    attackTimer = 0.25;
    attackCooldown = 0.35;
    sfx("slash.wav");
    hideHint();
    // slash arc VFX
    slash.clear();
    const dir = body.facing;
    const hw = (hero.width || 60) * 1.2;
    slash.alpha = 1;
    slash.x = hero.x + dir * (hero.width || 60) * 0.4;
    slash.y = hero.y - (hero.height || 100) * 0.55;
    slash.scale.x = dir;
    slash.clear();
    slash.moveTo(0, -hw * 0.5);
    slash.arc(0, 0, hw * 0.6, -Math.PI / 2.5, Math.PI / 2.5);
    slash.stroke({ color: num(C.accent), width: 6, alpha: 0.9 });
    gsap.fromTo(slash, { alpha: 0.9 }, { alpha: 0, duration: 0.3, ease: "power1.out" });
    // hitbox check (world coords)
    const reach = (hero.width || 60) * 1.2;
    const hbx = body.x + dir * (hero.width || 60) * 0.3;
    for (const e of [...enemies]) {
      if (!e.alive) continue;
      const dx = e.spr.x - hbx;
      const within = dir > 0 ? (dx > -20 && dx < reach) : (dx < 20 && dx > -reach);
      if (within && Math.abs((groundY) - e.spr.y) < (hero.height || 100)) {
        killEnemy(e);
      }
    }
  }

  // ── First action hint ──
  const hint = new Container();
  uiLayer.addChild(hint);
  const hintText = new Text({ text: "Tap to move & jump!", style: { fontFamily: FONT, fontSize: 22, fontWeight: FW, fill: num(C.text), align: "center" } });
  hintText.anchor.set(0.5);
  hint.addChild(hintText);
  const hand = new Text({ text: "👆", style: { fontSize: 40 } });
  hand.anchor.set(0.5);
  hint.addChild(hand);
  let hintActive = true;
  function hideHint(): void {
    if (!hintActive) return;
    hintActive = false;
    gsap.to(hint, { alpha: 0, duration: 0.4, onComplete: () => { hint.visible = false; } });
  }

  // ── Sticky CTA ──
  const ctaBtn = new Container();
  ctaLayer.addChild(ctaBtn);
  const ctaBg = new Graphics();
  ctaBtn.addChild(ctaBg);
  const ctaText = new Text({ text: cfg.copy.cta, style: { fontFamily: FONT, fontSize: 22, fontWeight: FW, fill: 0xffffff } });
  ctaText.anchor.set(0.5);
  ctaBtn.addChild(ctaText);
  ctaBtn.eventMode = "static";
  ctaBtn.cursor = "pointer";
  function fireCTA(): void { try { (window as any).FbPlayableAd.onCTAClick(); } catch (e) {} }
  ctaBtn.on("pointerdown", (e) => { e.stopPropagation(); fireCTA(); });

  // ── Endcard ──
  const endcard = new Container();
  endcard.visible = false;
  ctaLayer.addChild(endcard);
  const endBg = new Graphics();
  endcard.addChild(endBg);
  const endTitle = new Text({ text: "", style: { fontFamily: FONT, fontSize: 40, fontWeight: FW, fill: num(C.text), align: "center" } });
  endTitle.anchor.set(0.5);
  endcard.addChild(endTitle);
  const endCtaBtn = new Container();
  endcard.addChild(endCtaBtn);
  const endCtaBg = new Graphics();
  endCtaBtn.addChild(endCtaBg);
  const endCtaText = new Text({ text: cfg.copy.cta, style: { fontFamily: FONT, fontSize: 30, fontWeight: FW, fill: 0xffffff } });
  endCtaText.anchor.set(0.5);
  endCtaBtn.addChild(endCtaText);
  endCtaBtn.eventMode = "static";
  endCtaBtn.cursor = "pointer";
  endCtaBtn.on("pointerdown", (e) => { e.stopPropagation(); fireCTA(); });

  function showEndcard(winState: boolean): void {
    if (gameOver) return;
    gameOver = true;
    endcard.visible = true;
    endcard.alpha = 0;
    endTitle.text = winState ? "Victory!" : "Time's Up!";
    gsap.to(endcard, { alpha: 1, duration: 0.5 });
    gsap.fromTo(endCtaBtn.scale, { x: 0.8, y: 0.8 }, { x: 1, y: 1, duration: 1.2, repeat: -1, yoyo: true, ease: "sine.inOut" });
    layout();
  }

  // ── Hero animation swap ──
  function setHeroTex(): void {
    let key = "hero_idle.webp";
    if (attacking) key = "hero_attack.webp";
    else if (!body.grounded) key = "hero_jump.webp";
    else if (input.left || input.right) key = "hero_run.webp";
    if (tex[key] && hero.texture !== tex[key]) hero.texture = tex[key];
  }

  // ── Damage ──
  function hurt(e: Enemy): void {
    if (invuln > 0 || elapsed < GRACE) return;
    lives = Math.max(0, lives - 1);
    refreshHearts();
    invuln = 1.0;
    sfx("hurt.wav");
    flash.alpha = 0.4;
    gsap.to(flash, { alpha: 0, duration: 0.5 });
    // shake
    gsap.fromTo(world, { x: world.x + 10 }, { x: world.x, duration: 0.3, ease: "elastic.out(1,0.3)" });
  }

  // ── Ticker ──
  app.ticker.add(() => {
    const dt = Math.min(0.05, app.ticker.deltaMS / 1000);
    if (gameOver) return;
    elapsed += dt;

    // input → body
    body.setMove(input.right ? 1 : (input.left ? -1 : 0));
    if (jumpPressed) { if (body.grounded) sfx("jump.wav"); body.jump(); jumpPressed = false; hideHint(); }
    body.update(dt);

    // landing squash
    if (!wasGrounded && body.grounded) {
      gsap.fromTo(hero.scale, { y: baseScale * 0.7 }, { y: baseScale, duration: 0.25, ease: "back.out(2)" });
      // dust
      const d = new Graphics();
      d.ellipse(0, 0, 26, 8).fill({ color: 0xffffff, alpha: 0.4 });
      d.x = body.x; d.y = groundY;
      vfxLayer.addChild(d);
      gsap.to(d, { alpha: 0, duration: 0.4, onComplete: () => { try { vfxLayer.removeChild(d); d.destroy(); } catch (er) {} } });
    }
    wasGrounded = body.grounded;

    // hero placement
    hero.x = body.x;
    let by = body.y;
    if (body.grounded && (input.left || input.right)) {
      runBob += dt * 14;
      by += Math.sin(runBob) * 4;
      hero.rotation = Math.sin(runBob) * 0.05;
    } else {
      hero.rotation = body.grounded ? 0 : (body.vy < 0 ? -0.08 : 0.08);
    }
    hero.y = by;
    hero.scale.x = Math.abs(baseScale) * body.facing;
    if (!gsap.isTweening(hero.scale)) hero.scale.y = Math.abs(baseScale);
    setHeroTex();

    // attack timers
    if (attackTimer > 0) { attackTimer -= dt; if (attackTimer <= 0) attacking = false; }
    if (attackCooldown > 0) attackCooldown -= dt;
    if (invuln > 0) invuln -= dt;
    hero.alpha = invuln > 0 ? (0.5 + 0.5 * Math.abs(Math.sin(elapsed * 20))) : 1;

    // camera
    worldScroll = clamp(body.x - W * 0.35, 0, WORLD_W - W);
    world.x = -worldScroll;
    bg.x = -worldScroll * 0.35;

    // enemies
    if (elapsed > GRACE) {
      spawnTimer -= dt;
      if (spawnTimer <= 0 && body.x < WORLD_W - W * 0.6) {
        spawnEnemy();
        spawnTimer = diff.spawnWaitSec();
      }
    }
    for (const e of [...enemies]) {
      if (!e.alive) continue;
      (e.mover as any).update(dt);
      e.spr.x = e.mover.x;
      e.spr.y = groundY;
      e.spr.scale.x = Math.abs(e.spr.scale.x) * (e.mover.x > body.x ? -1 : 1);
      // contact
      if (Math.abs(e.spr.x - body.x) < (hero.width || 60) * 0.5 && body.grounded) {
        hurt(e);
        // small knockback removal of enemy to avoid repeated hits
        gsap.to(e.spr, { alpha: 0, duration: 0.3, onComplete: () => { try { enemyLayer.removeChild(e.spr); e.spr.destroy(); } catch (er) {} } });
        e.alive = false;
        const idx = enemies.indexOf(e);
        if (idx >= 0) enemies.splice(idx, 1);
      }
    }

    // HUD
    scoreT.text = "Kills: " + score + "   " + Math.round((body.x / (WORLD_W - 60)) * 100) + "%";

    // win check
    if (!won && body.x >= WORLD_W - 90) {
      won = true;
      gsap.to(app.ticker, { speed: 0.3, duration: 0.4, onComplete: () => { gsap.to(app.ticker, { speed: 1, duration: 0.6 }); } });
      gsap.delayedCall(0.8, () => showEndcard(true));
    }

    // timer end
    if (elapsed >= TIME_LIMIT && !won) showEndcard(false);

    // hint follow
    if (hintActive) hand.x = btnRight.x;
  });

  // ── Layout ──
  function layout(): void {
    W = app.screen.width; H = app.screen.height;
    groundY = H * 0.82;
    baseScale = Math.min(W, H) * 0.0020;

    // bg cover by height
    if (bg.texture && bg.texture.width) {
      const s = H / bg.texture.height;
      bg.scale.set(s);
    } else { bg.width = WORLD_W; bg.height = H; }

    // ground tiles across world
    groundLayer.removeChildren();
    groundSprites.length = 0;
    const gh = H - groundY;
    if (tex["ground.webp"]) {
      const gt = tex["ground.webp"];
      const tileW = gt.width * (gh / gt.height);
      for (let x = 0; x < WORLD_W + tileW; x += tileW) {
        const gs = new Sprite(gt);
        gs.x = x; gs.y = groundY;
        gs.scale.set(gh / gt.height);
        groundLayer.addChild(gs);
        groundSprites.push(gs);
      }
    } else {
      const gs = new Graphics();
      gs.rect(0, groundY, WORLD_W, gh).fill(num(C.primary));
      groundLayer.addChild(gs);
    }

    if (tex["hero_idle.webp"]) hero.scale.set(baseScale);

    // goal marker
    goal.x = WORLD_W - 60;
    goalGlow.clear();
    goalGlow.circle(0, groundY - H * 0.18, H * 0.22).fill({ color: num(C.accent), alpha: 0.18 });
    bossShape.clear();
    bossShape.roundRect(-50, groundY - H * 0.35, 100, H * 0.35, 10).fill({ color: num(C.primary), alpha: 0.85 }).stroke({ color: num(C.accent), width: 3 });
    goalText.x = 0; goalText.y = groundY - H * 0.36;

    // HUD
    title.x = 12; title.y = 10;
    heartsC.x = 16; heartsC.y = 44;
    refreshHearts();
    scoreT.x = W - 150; scoreT.y = 12;
    flash.clear(); flash.rect(0, 0, W, H).fill(0xff2222); flash.alpha = flash.alpha;

    // buttons
    const by = H - 70;
    btnLeft.x = 70; btnLeft.y = by;
    btnRight.x = 170; btnRight.y = by;
    btnAttack.x = W - 70; btnAttack.y = by;
    btnJump.x = W - 170; btnJump.y = by;

    // cta sticky bottom center
    ctaBg.clear();
    ctaBg.roundRect(-90, -26, 180, 52, 26).fill(num(C.accent)).stroke({ color: 0xffffff, width: 2, alpha: 0.6 });
    ctaBtn.x = W / 2; ctaBtn.y = H - 150;

    // hint
    hint.x = 0; hint.y = 0;
    hintText.x = W / 2; hintText.y = H * 0.45;
    hand.x = btnRight.x; hand.y = by - 60;

    // endcard
    endBg.clear();
    endBg.rect(0, 0, W, H).fill({ color: num(C.background), alpha: 0.92 });
    endTitle.x = W / 2; endTitle.y = H * 0.38;
    endCtaBg.clear();
    endCtaBg.roundRect(-140, -38, 280, 76, 38).fill(num(C.accent)).stroke({ color: 0xffffff, width: 3 });
    endCtaBtn.x = W / 2; endCtaBtn.y = H * 0.58;

    // dev hook
    (window as any).__btns = {
      left: { x: btnLeft.x - 40, y: btnLeft.y - 40, w: 80, h: 80 },
      right: { x: btnRight.x - 40, y: btnRight.y - 40, w: 80, h: 80 },
      jump: { x: btnJump.x - 40, y: btnJump.y - 40, w: 80, h: 80 },
      attack: { x: btnAttack.x - 40, y: btnAttack.y - 40, w: 80, h: 80 },
      cta: { x: ctaBtn.x - 90, y: ctaBtn.y - 26, w: 180, h: 52 },
    };
  }

  layout();
  window.addEventListener("resize", layout);

  // hint pulse
  gsap.to(hand, { y: "+=12", duration: 0.6, repeat: -1, yoyo: true, ease: "sine.inOut" });
  gsap.to(ctaBtn.scale, { x: 1.06, y: 1.06, duration: 0.8, repeat: -1, yoyo: true, ease: "sine.inOut" });
}

void main();
