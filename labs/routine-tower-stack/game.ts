import { Application, Container, Graphics, Text } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// ── Colour helpers ────────────────────────────────────────────────────────────
function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }
function shade(c: number, f: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const t = f > 0 ? 255 : 0, a = Math.abs(f);
  return (Math.round(r + (t - r) * a) << 16) | (Math.round(g + (t - g) * a) << 8) | Math.round(b + (t - b) * a);
}

// ── Tunables ──────────────────────────────────────────────────────────────────
const BW       = Number(cfg.params.blockWidth    ?? 180);
const BH       = Number(cfg.params.blockHeight   ?? 52);
const MAG_TOL  = Number(cfg.params.magnetTol     ?? 38);
const SWG_S    = Number(cfg.params.swingDurStart ?? 1.8);
const SWG_E    = Number(cfg.params.swingDurEnd   ?? 1.1);

const COL_BG   = num(cfg.style.colors.background);
const COL_PRI  = num(cfg.style.colors.primary);
const COL_ACC  = num(cfg.style.colors.accent);
const COL_TXT  = num(cfg.style.colors.text);
const FONT     = cfg.style.font.family;

// ── Scripted block sequence ────────────────────────────────────────────────────
// [0..1] = pre-placed  [2..4] = player taps
const BLOCKS = [
  { label: "Hydrate",  color: 0x4FC3F7, textColor: 0x1a3a4a }, // pre-placed
  { label: "Move",     color: 0x81C784, textColor: 0x1a3a1a }, // pre-placed
  { label: "Scoop",    color: COL_PRI,  textColor: 0x3a2400, gold: true }, // tap 1
  { label: "Daylight", color: COL_ACC,  textColor: 0x1a3a38 }, // tap 2
  { label: "Sleep",    color: 0x9575CD, textColor: 0xffffff }, // tap 3
];
const TOTAL_BLOCKS = 5;
const PRE_PLACED   = 2;  // first N blocks are already on tower at hook
const PLAYER_TAPS  = 3;  // blocks the player drops (indices 2,3,4)

// ─────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    background: COL_BG,
    antialias: false,
    preference: "webgl",
    resolution: 1,
    autoDensity: false,
  });
  app.canvas.style.width  = window.innerWidth  + "px";
  app.canvas.style.height = window.innerHeight + "px";
  document.body.appendChild(app.canvas);

  // ── Layers: bg → game → fx → ui → overlay ────────────────────────────────
  const bgLayer      = new Container();
  const gameLayer    = new Container();
  const fxLayer      = new Container();
  const uiLayer      = new Container();
  const overlayLayer = new Container();
  app.stage.addChild(bgLayer, gameLayer, fxLayer, uiLayer, overlayLayer);

  // Stage is the tap receiver; game children are NOT interactive.
  app.stage.eventMode = "static";
  app.stage.hitArea   = app.screen;
  gameLayer.interactiveChildren = false;
  fxLayer.interactiveChildren  = false;

  // ── State ─────────────────────────────────────────────────────────────────
  type Phase = "hook" | "play" | "win" | "endcard";
  let phase: Phase   = "hook";
  let tapCount       = 0;          // 0..3 player taps
  let dropping       = false;
  let ghostDone      = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Instruction text ────────────────────────────────────────────────────
  const instrText = new Text({
    text: "Tap to drop",
    style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "bold", fontSize: 20, stroke: { color: "#2D3047", width: 4 } },
  });
  instrText.anchor.set(0.5);
  instrText.alpha = 0;
  uiLayer.addChild(instrText);

  // ── Background gradient ───────────────────────────────────────────────────
  const bgGfx = new Graphics();
  bgLayer.addChild(bgGfx);

  function drawBg(): void {
    const w = window.innerWidth, h = window.innerHeight;
    bgGfx.clear();
    // indigo-night → morning amber gradient (vertical bands)
    const bands = 12;
    const topC = 0x1a1e3a;
    const botC = num("#3D2B00");
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const r1 = (topC >> 16) & 255, g1 = (topC >> 8) & 255, b1 = topC & 255;
      const r2 = (botC >> 16) & 255, g2 = (botC >> 8) & 255, b2 = botC & 255;
      const col = (Math.round(r1 + (r2 - r1) * t) << 16) |
                  (Math.round(g1 + (g2 - g1) * t) << 8) |
                   Math.round(b1 + (b2 - b1) * t);
      bgGfx.rect(0, h / bands * i, w, h / bands + 1).fill({ color: col });
    }
    // Small stars in upper half
    for (let i = 0; i < 30; i++) {
      const sx = (i * 137 + 23) % w;
      const sy = (i * 89  + 11) % (h * 0.45);
      const sr = 1.2 + (i % 3) * 0.6;
      bgGfx.circle(sx, sy, sr).fill({ color: 0xffffff, alpha: 0.45 + (i % 4) * 0.1 });
    }
    // Horizon glow
    bgGfx.rect(0, h * 0.55, w, h * 0.45).fill({ color: 0xFFB100, alpha: 0.08 });
  }

  // ── Habit meter bar (progress-already-running) ────────────────────────────
  const meterContainer = new Container();
  uiLayer.addChild(meterContainer);
  let meterGfx = new Graphics();
  let meterFill = new Graphics();
  let meterLabel: Text | null = null;
  meterContainer.addChild(meterGfx, meterFill);

  function drawMeter(filledBlocks: number): void {
    const w = window.innerWidth, h = window.innerHeight;
    meterGfx.clear();
    meterFill.clear();
    if (meterLabel) { meterLabel.destroy(); meterLabel = null; }

    const barW = Math.min(w * 0.55, 220);
    const barH = 18;
    const bx   = w / 2 - barW / 2;
    const by   = h * 0.088;

    // Track
    meterGfx.roundRect(bx, by, barW, barH, 9).fill({ color: 0xffffff, alpha: 0.12 });
    // Filled portion
    const fillW = (filledBlocks / TOTAL_BLOCKS) * barW;
    if (fillW > 0) {
      meterFill.roundRect(bx, by, fillW, barH, 9).fill({ color: COL_PRI, alpha: 0.85 });
    }
    // Segment dividers
    for (let i = 1; i < TOTAL_BLOCKS; i++) {
      const divX = bx + (i / TOTAL_BLOCKS) * barW;
      meterGfx.rect(divX - 1, by, 2, barH).fill({ color: COL_BG, alpha: 0.5 });
    }

    meterLabel = new Text({
      text: `Day 1  ${filledBlocks}/${TOTAL_BLOCKS}`,
      style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "bold", fontSize: 12 },
    });
    meterLabel.anchor.set(0.5, 0);
    meterLabel.position.set(w / 2, by + barH + 4);
    meterContainer.addChild(meterLabel);
  }

  // ── Tower world container (camera rises) ─────────────────────────────────
  const towerWorld = new Container();
  gameLayer.addChild(towerWorld);

  // Placed block records
  interface PlacedBlock { cx: number; topY: number; }
  const placed: PlacedBlock[] = [];

  // Foundation ground line
  const groundGfx = new Graphics();
  towerWorld.addChild(groundGfx);

  function drawGround(): void {
    const w = window.innerWidth;
    groundGfx.clear();
    groundGfx.rect(-w, 0, w * 3, 28).fill({ color: 0x1a1230 });
    groundGfx.rect(-w, 28, w * 3, 8).fill({ color: COL_PRI, alpha: 0.25 });
  }

  // Make a habit block (procedural)
  function makeHabitBlock(idx: number, w: number = BW, h: number = BH): Container {
    const def    = BLOCKS[idx];
    const wrap   = new Container();
    const shadow = new Graphics()
      .roundRect(-w / 2 + 4, -h / 2 + 6, w, h, 12)
      .fill({ color: 0x000000, alpha: 0.18 });
    const body   = new Graphics()
      .roundRect(-w / 2, -h / 2, w, h, 12)
      .fill({ color: def.color })
      .stroke({ width: def.gold ? 3 : 2, color: shade(def.color, def.gold ? 0.5 : -0.35), alignment: 1 });
    const hi     = new Graphics()
      .roundRect(-w / 2 + 6, -h / 2 + 5, w - 12, h * 0.3, 7)
      .fill({ color: shade(def.color, 0.4), alpha: 0.45 });

    wrap.addChild(shadow, body, hi);

    // Label text
    const lbl = new Text({
      text: def.label,
      style: { fill: def.textColor, fontFamily: FONT, fontWeight: "bold", fontSize: Math.min(15, w * 0.085) },
    });
    lbl.anchor.set(0.5);
    wrap.addChild(lbl);

    // Gold Scoop product-tag: jar + spoon icons (procedural)
    if (def.gold) {
      const tag = new Container();
      // Jar body
      const jarG = new Graphics();
      jarG.roundRect(-12, -9, 14, 18, 4).fill({ color: 0xfff3b0 }).stroke({ width: 1.5, color: 0xc8960a });
      jarG.rect(-12, -9, 14, 5).fill({ color: 0xffcf4d });
      tag.addChild(jarG);
      // Spoon
      const spoonG = new Graphics();
      spoonG.circle(7, -6, 4).fill({ color: 0xe0c070 });
      spoonG.rect(5, -2, 3, 12).fill({ color: 0xe0c070 });
      tag.addChild(spoonG);
      tag.position.set(w / 2 - 28, 0);
      tag.alpha = 0;
      wrap.addChild(tag);
      gsap.to(tag, { alpha: 1, duration: 0.4, delay: 0.3 });
    }

    return wrap;
  }

  // Place a block in the tower world
  function placeBlockInWorld(idx: number, cx: number, topY: number): Container {
    const blk = makeHabitBlock(idx);
    blk.position.set(cx, topY - BH / 2);
    towerWorld.addChild(blk);
    placed.push({ cx, topY });
    return blk;
  }

  // ── Build pre-placed tower (2 blocks) ─────────────────────────────────────
  // World coords: y increases downward, tower top = negative y
  // Ground = y=0. Each block placed center at topY - BH/2.
  let towerTopY = 0;  // world y of the top surface of the topmost block

  function buildPrePlaced(): void {
    towerWorld.removeChildren();
    placed.length = 0;
    drawGround();
    towerTopY = 0;

    for (let i = 0; i < PRE_PLACED; i++) {
      towerTopY -= BH;
      placeBlockInWorld(i, 0, towerTopY);
    }
  }

  // ── Camera targeting ──────────────────────────────────────────────────────
  function buildLineY(): number { return window.innerHeight * 0.62; }

  function camTargetY(): number {
    return buildLineY() - towerTopY;
  }

  // ── Crane rail + rope + trolley ───────────────────────────────────────────
  const craneGfx    = new Graphics();
  const ropeGfx     = new Graphics();
  const trolleyGfx  = new Graphics();
  uiLayer.addChild(craneGfx, ropeGfx, trolleyGfx);

  function drawCrane(blockX?: number): void {
    const w = window.innerWidth, h = window.innerHeight;
    const railY = h * 0.13;
    craneGfx.clear();
    craneGfx.rect(0, railY, w, 7).fill({ color: 0x6b4a2a });
    craneGfx.rect(0, railY - 4, w, 4).fill({ color: 0x8a6040 });

    ropeGfx.clear();
    trolleyGfx.clear();
    if (blockX !== undefined) {
      const ropeBottom = buildLineY() - BH * 0.5;
      ropeGfx.moveTo(blockX, railY + 7).lineTo(blockX, ropeBottom).stroke({ width: 3, color: 0x2a1d10 });
      ropeGfx.circle(blockX, ropeBottom, 4).fill({ color: 0x2a1d10 });
      trolleyGfx.roundRect(blockX - 16, railY - 4, 32, 16, 4).fill({ color: 0x3a2a1a });
    }
  }

  // ── Active (swinging) block ────────────────────────────────────────────────
  let activeBlk: Container | null = null;
  let swingTween: gsap.core.Tween | null = null;
  let swingPad = 28;

  function spawnActive(): void {
    if (activeBlk) { uiLayer.removeChild(activeBlk); activeBlk.destroy(); activeBlk = null; }
    swingTween?.kill();
    if (tapCount >= PLAYER_TAPS) return;

    const blkIdx = PRE_PLACED + tapCount;
    const blk    = makeHabitBlock(blkIdx);
    const h      = window.innerHeight, w = window.innerWidth;
    const railY  = h * 0.13;
    blk.position.set(swingPad + BW / 2, railY + 60);
    uiLayer.addChild(blk);
    activeBlk = blk;

    const lo = swingPad + BW / 2;
    const hi2 = w - swingPad - BW / 2;
    const dur = SWG_S - tapCount * ((SWG_S - SWG_E) / (PLAYER_TAPS - 1));

    swingTween = gsap.fromTo(blk, { x: lo }, {
      x: hi2,
      duration: dur,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });

    // Shadow hint — only for first player tap (Scoop)
    if (tapCount === 0) showShadowHint(true);
    else showShadowHint(false);

    // Instruction text — anchored in lower thumb zone, never over tower
    const w2 = window.innerWidth, h2 = window.innerHeight;
    instrText.style.fontSize = Math.min(18, w2 * 0.048);
    instrText.position.set(w2 / 2, h2 * 0.82);
    instrText.alpha = 0;
    gsap.killTweensOf(instrText);
    gsap.to(instrText, { alpha: 1, duration: 0.35, delay: 0.2 });
  }

  // ── Shadow hint (pulsing indicator below crane) ───────────────────────────
  const shadowHintGfx = new Graphics();
  uiLayer.addChild(shadowHintGfx);
  let shadowTween: gsap.core.Tween | null = null;

  function showShadowHint(visible: boolean): void {
    shadowTween?.kill();
    shadowHintGfx.clear();
    if (!visible) return;
    const w = window.innerWidth, h = window.innerHeight;
    const bl = buildLineY();
    shadowHintGfx.ellipse(w / 2, bl + 6, BW * 0.45, 7).fill({ color: 0xffffff, alpha: 0.18 });
    shadowTween = gsap.to(shadowHintGfx, { alpha: 0.15, duration: 0.55, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // ── Ghost finger hint ─────────────────────────────────────────────────────
  const ghostContainer = new Container();
  uiLayer.addChild(ghostContainer);

  function showGhostFinger(): void {
    ghostContainer.removeChildren();
    ghostDone = false;
    const w = window.innerWidth, h = window.innerHeight;

    const finger = new Container();
    // Finger circle
    const circ = new Graphics().circle(0, 0, 18).fill({ color: 0xffffff, alpha: 0.6 });
    const ring  = new Graphics().circle(0, 0, 22).stroke({ width: 2, color: 0xffffff, alpha: 0.4 });
    finger.addChild(circ, ring);
    finger.position.set(w / 2, h * 0.52);
    finger.alpha = 0;
    ghostContainer.addChild(finger);

    // Animate: fade in, show tap gesture, fade out — then repeat twice, no auto-drop
    const seq = gsap.timeline({ repeat: 2, repeatDelay: 0.6, onComplete: () => {
      ghostContainer.removeChildren();
      ghostDone = true;
      void ghostDone; // used as state flag
    }});
    seq.to(finger, { alpha: 0.85, y: h * 0.5, duration: 0.4 })
       .to(finger.scale, { x: 0.8, y: 0.8, duration: 0.15, ease: "power2.in" }, "+=0.2")
       .to(finger.scale, { x: 1, y: 1, duration: 0.15, ease: "power2.out" })
       .to(finger, { alpha: 0, duration: 0.3 }, "+=0.3");
  }

  // ── Drop logic (player tap) ───────────────────────────────────────────────
  function dropActive(fromIdle = false): void {
    if (phase !== "play" || !activeBlk || dropping) return;
    if (tapCount >= PLAYER_TAPS) return;
    dropping = true;
    swingTween?.kill();
    showShadowHint(false);
    ghostContainer.removeChildren();
    clearIdleTimer();
    gsap.killTweensOf(instrText);
    gsap.to(instrText, { alpha: 0, duration: 0.2 });

    const blk    = activeBlk;
    const blkIdx = PRE_PLACED + tapCount;
    const tapX   = blk.x;
    const lowerCx = placed.length > 0 ? placed[placed.length - 1].cx + towerWorld.x : towerWorld.x;
    const offset  = tapX - lowerCx;
    const isPerfect = Math.abs(offset) <= 8;

    // Magnet forgiveness: GSAP tween x toward lower.cx — visibly "snaps"
    const worldLowerCx = placed.length > 0 ? placed[placed.length - 1].cx : 0;
    const magnetDist = Math.abs(offset);
    const magnetStrength = Math.min(1, magnetDist / MAG_TOL); // 0=perfect 1=edge

    // Target world x for this block (magnet pulls toward center, not perfect)
    const magnetPull = magnetDist <= MAG_TOL ? (offset * 0.25) : offset;
    const finalWorldX = worldLowerCx + magnetPull;

    // Animate x (magnet pull) simultaneously with drop
    gsap.to(blk, { x: towerWorld.x + finalWorldX, duration: 0.22, ease: "power2.out" });

    const targetY = buildLineY() - BH / 2;
    const dist    = targetY - blk.y;
    gsap.to(blk, {
      y: targetY,
      duration: Math.max(0.16, dist / 2200 + 0.14),
      ease: "power1.in",
      onComplete: () => landBlock(blk, blkIdx, finalWorldX, isPerfect, magnetStrength),
    });
  }

  function landBlock(blk: Container, blkIdx: number, finalWorldX: number, isPerfect: boolean, magnetStrength: number): void {
    uiLayer.removeChild(blk);
    blk.destroy();
    activeBlk = null;
    dropping  = false;

    // Place in world
    towerTopY -= BH;
    const placed_blk = placeBlockInWorld(blkIdx, finalWorldX, towerTopY);

    // Landing pop: squash-stretch
    placed_blk.scale.set(1.08, 0.88);
    gsap.to(placed_blk.scale, { x: 1, y: 1, duration: 0.35, ease: "elastic.out(1,0.5)" });

    // Sway on near-miss (scripted elastic rotation), wind gust on perfect
    if (!isPerfect && magnetStrength > 0.2) {
      // GSAP rotation tween ±3° elastic — tower sways but stands
      const towerPivotY = buildLineY();
      const oldPY = towerWorld.pivot.y;
      towerWorld.pivot.y = towerPivotY;
      towerWorld.y += towerPivotY;
      gsap.to(towerWorld, {
        rotation: (Math.random() > 0.5 ? 1 : -1) * 0.052,
        duration: 0.18,
        ease: "power2.out",
        yoyo: true,
        repeat: 3,
        onComplete: () => {
          gsap.to(towerWorld, { rotation: 0, duration: 0.2, ease: "sine.inOut", onComplete: () => {
            towerWorld.pivot.y = 0;
            towerWorld.y = camTargetY();
          }});
        },
      });
      sparkleAt(towerWorld.x + finalWorldX, buildLineY(), 0xFFB100);
    } else {
      // Wind gust — subtle horizontal oscillation of fx particles
      windGust();
      sparkleAt(towerWorld.x + finalWorldX, buildLineY(), COL_ACC);
    }

    // Camera rise
    gsap.to(towerWorld, { y: camTargetY(), duration: 0.42, ease: "power2.out" });

    tapCount++;
    drawMeter(PRE_PLACED + tapCount);

    if (tapCount >= PLAYER_TAPS) {
      // Win!
      gsap.delayedCall(0.35, triggerWin);
    } else {
      gsap.delayedCall(0.3, () => {
        spawnActive();
        setIdleTimer();
      });
    }
  }

  // ── Screen sparkle ────────────────────────────────────────────────────────
  function sparkleAt(x: number, y: number, color: number): void {
    for (let i = 0; i < 10; i++) {
      const s = new Graphics().star(0, 0, 5, 6, 3).fill({ color });
      s.position.set(x, y);
      fxLayer.addChild(s);
      const ang = (i / 10) * Math.PI * 2;
      gsap.to(s, {
        x: x + Math.cos(ang) * 70,
        y: y + Math.sin(ang) * 60,
        alpha: 0,
        rotation: Math.random() * 3,
        duration: 0.65,
        ease: "power2.out",
        onComplete: () => { fxLayer.removeChild(s); s.destroy(); },
      });
    }
  }

  function windGust(): void {
    for (let i = 0; i < 6; i++) {
      const w2 = window.innerWidth;
      const g = new Graphics().rect(0, -2, 30 + Math.random() * 40, 3).fill({ color: 0xffffff, alpha: 0.25 });
      g.position.set(Math.random() * w2, buildLineY() - 20 - Math.random() * 60);
      fxLayer.addChild(g);
      gsap.to(g, { x: g.x + 80, alpha: 0, duration: 0.5 + Math.random() * 0.3, ease: "power1.out",
        onComplete: () => { fxLayer.removeChild(g); g.destroy(); } });
    }
  }

  // ── Confetti burst (ported from fruit-bonanza) ────────────────────────────
  function confettiBurst(count = 70): void {
    const w = window.innerWidth, h = window.innerHeight;
    const COLORS = [0xff3aa5, 0xffd84d, 0x9b4dff, 0x38f06b, 0xff7e2e, COL_ACC, COL_PRI];
    for (let i = 0; i < count; i++) {
      const c     = COLORS[i % COLORS.length];
      const piece = new Graphics().rect(-3, -6, 6, 12).fill({ color: c });
      piece.rotation = Math.random() * Math.PI * 2;
      const sx = Math.random() * w;
      const sy = -20 - Math.random() * 60;
      piece.position.set(sx, sy);
      fxLayer.addChild(piece);
      const dur  = 1.8 + Math.random() * 1.2;
      const sway = 80 + Math.random() * 80;
      gsap.to(piece, { y: h + 30, duration: dur, ease: "power1.in",
        onComplete: () => { fxLayer.removeChild(piece); piece.destroy(); } });
      gsap.to(piece, { x: sx + (Math.random() < 0.5 ? -sway : sway), duration: dur, ease: "sine.inOut" });
      gsap.to(piece, { rotation: piece.rotation + (Math.random() - 0.5) * 12, duration: dur, ease: "none" });
    }
  }

  // ── Streak flame (flicker) ────────────────────────────────────────────────
  function showStreakFlame(): void {
    const w = window.innerWidth;
    for (let f = 0; f < 5; f++) {
      const flame = new Container();
      const fx = w / 2 + (f - 2) * 22;
      const fy = buildLineY() - BH * (TOTAL_BLOCKS + 0.5);

      const body = new Graphics()
        .poly([0, 0, 12, -30, -12, -30, 0, -55])
        .fill({ color: 0xFF6B00, alpha: 0.9 });
      const inner = new Graphics()
        .poly([0, -5, 7, -25, -7, -25, 0, -42])
        .fill({ color: 0xFFD700, alpha: 0.85 });
      flame.addChild(body, inner);
      flame.position.set(fx, fy);
      fxLayer.addChild(flame);

      // Flicker
      gsap.to(flame, {
        scaleY: 1.2 + Math.random() * 0.3,
        scaleX: 0.85 + Math.random() * 0.2,
        duration: 0.12,
        yoyo: true,
        repeat: 20,
        ease: "sine.inOut",
        onComplete: () => { fxLayer.removeChild(flame); flame.destroy(); },
      });
    }
  }

  // ── Win flow ──────────────────────────────────────────────────────────────
  function triggerWin(): void {
    if (phase === "win" || phase === "endcard") return;
    phase = "win";
    swingTween?.kill();
    showShadowHint(false);
    clearIdleTimer();

    confettiBurst();
    showStreakFlame();
    drawMeter(TOTAL_BLOCKS);

    // Day 1 complete flash
    const w = window.innerWidth, h = window.innerHeight;
    const winText = new Text({
      text: "Day 1 complete!",
      style: { fill: COL_PRI, fontFamily: FONT, fontWeight: "bold", fontSize: Math.min(38, w * 0.1), stroke: { color: "#2D3047", width: 5 } },
    });
    winText.anchor.set(0.5);
    winText.position.set(w / 2, h * 0.3);
    winText.alpha = 0;
    winText.scale.set(0.5);
    overlayLayer.addChild(winText);
    gsap.to(winText, { alpha: 1, duration: 0.4, ease: "power2.out" });
    gsap.to(winText.scale, { x: 1.05, y: 1.05, duration: 0.4, ease: "back.out(2)" });
    gsap.to(winText, { y: winText.y - 8, duration: 0.8, yoyo: true, repeat: 1, ease: "sine.inOut" });

    gsap.delayedCall(1.4, showEndcard);
  }

  // ── Endcard ────────────────────────────────────────────────────────────────
  function showEndcard(): void {
    if (phase === "endcard") return;
    phase = "endcard";
    overlayLayer.removeChildren();

    const w = window.innerWidth, h = window.innerHeight;

    // Dim overlay
    const dim = new Graphics().rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.55 });
    overlayLayer.addChild(dim);

    const panel      = new Container();
    const pw         = Math.min(w * 0.86, 360);
    const ph         = Math.min(h * 0.72, 480);
    const panelBg    = new Graphics()
      .roundRect(-pw / 2, -ph / 2, pw, ph, 24)
      .fill({ color: 0x1e2240 })
      .stroke({ width: 4, color: COL_PRI, alignment: 1 });
    panel.addChild(panelBg);

    // Brand logo (procedural stacked blocks + sun silhouette "H")
    const logoC = new Container();
    for (let i = 0; i < 4; i++) {
      const lbw = 16 - i * 2;
      const lbg = new Graphics()
        .roundRect(-lbw / 2, 0, lbw, 8, 3)
        .fill({ color: COL_PRI, alpha: 0.7 + i * 0.07 });
      lbg.position.set(0, -i * 10);
      logoC.addChild(lbg);
    }
    // Sun
    logoC.addChild(new Graphics().circle(0, -46, 7).fill({ color: COL_PRI }));
    logoC.position.set(0, -ph / 2 + 50);
    panel.addChild(logoC);

    // Brand name
    const brandName = new Text({
      text: "Habistack",
      style: { fill: COL_PRI, fontFamily: FONT, fontWeight: "bold", fontSize: Math.min(28, pw * 0.08) },
    });
    brandName.anchor.set(0.5);
    brandName.position.set(0, -ph / 2 + 82);
    panel.addChild(brandName);

    // Tagline
    const tagline = new Text({
      text: "Small blocks. Big mornings.",
      style: { fill: COL_ACC, fontFamily: FONT, fontWeight: "bold", fontSize: Math.min(14, pw * 0.04) },
    });
    tagline.anchor.set(0.5);
    tagline.position.set(0, -ph / 2 + 106);
    panel.addChild(tagline);

    // Endcard headline
    const endLine = new Text({
      text: "Day 1 stacked!\nJoin the morning builders\ncommunity",
      style: {
        fill: "#ffffff",
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: Math.min(20, pw * 0.057),
        align: "center",
        wordWrap: true,
        wordWrapWidth: pw * 0.82,
        lineHeight: Math.min(26, pw * 0.07),
      },
    });
    endLine.anchor.set(0.5);
    endLine.position.set(0, -ph / 2 + 164);
    panel.addChild(endLine);

    // Social proof slot (verified-only)
    const socialProof = new Text({
      text: "★★★★★  Trusted by morning routine builders",
      style: { fill: COL_ACC, fontFamily: FONT, fontSize: Math.min(12, pw * 0.033) },
    });
    socialProof.anchor.set(0.5);
    socialProof.position.set(0, -ph / 2 + 224);
    panel.addChild(socialProof);

    // Authority slot
    const authority = new Text({
      text: "Behavioral habit design, not health claims",
      style: { fill: "#aaaacc", fontFamily: FONT, fontSize: Math.min(11, pw * 0.03) },
    });
    authority.anchor.set(0.5);
    authority.position.set(0, -ph / 2 + 246);
    panel.addChild(authority);

    // CTA button (≥44px, thumb zone, accent)
    const ctaH  = Math.max(52, h * 0.07);
    const ctaW  = pw - 40;
    const ctaC  = new Container();
    const ctaBg = new Graphics()
      .roundRect(-ctaW / 2, -ctaH / 2, ctaW, ctaH, ctaH / 2)
      .fill({ color: COL_ACC })
      .stroke({ width: 4, color: shade(COL_ACC, -0.3), alignment: 1 });
    ctaC.addChild(ctaBg);
    const ctaT = new Text({
      text: cfg.copy.cta,
      style: { fill: "#1a3a38", fontFamily: FONT, fontWeight: "bold", fontSize: Math.min(22, ctaW * 0.12) },
    });
    ctaT.anchor.set(0.5);
    ctaC.addChild(ctaT);
    ctaC.position.set(0, ph / 2 - ctaH / 2 - 60);
    ctaC.eventMode = "static";
    ctaC.cursor    = "pointer";
    ctaC.on("pointertap", (e) => { e.stopPropagation(); window.FbPlayableAd.onCTAClick(); });
    panel.addChild(ctaC);
    gsap.to(ctaC.scale, { x: 1.04, y: 1.04, duration: 0.65, yoyo: true, repeat: -1, ease: "sine.inOut" });

    // Disclaimer (≥10px, bottom of panel)
    const DISCLAIMER = "*These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease. Results may vary.";
    const disc = new Text({
      text: DISCLAIMER,
      style: {
        fill: "#8888aa",
        fontFamily: FONT,
        fontSize: 10,
        wordWrap: true,
        wordWrapWidth: pw * 0.9,
        align: "center",
        lineHeight: 13,
      },
    });
    disc.anchor.set(0.5);
    disc.position.set(0, ph / 2 - 22);
    panel.addChild(disc);

    panel.position.set(w / 2, h / 2);
    panel.scale.set(0.6);
    overlayLayer.addChild(panel);
    gsap.to(panel.scale, { x: 1, y: 1, duration: 0.45, ease: "back.out(1.5)" });
  }

  // ── Idle fallback (auto-drop if user doesn't tap) ────────────────────────
  function clearIdleTimer(): void {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  function setIdleTimer(): void {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      if (phase === "play" && !dropping && activeBlk) {
        dropActive(true);
      }
    }, 2500);
  }

  // ── Input: tap anywhere drops the active block ────────────────────────────
  app.stage.on("pointertap", () => {
    if (phase === "play") dropActive();
  });

  // ── Ticker: crane rope update ────────────────────────────────────────────
  app.ticker.add(() => {
    const bx = activeBlk ? activeBlk.x : undefined;
    drawCrane(bx);
  });

  // ── Layout / resize ────────────────────────────────────────────────────────
  function layout(): void {
    const w = window.innerWidth, h = window.innerHeight;
    app.canvas.style.width  = w + "px";
    app.canvas.style.height = h + "px";
    drawBg();
    drawCrane(activeBlk?.x);
    towerWorld.position.set(w / 2, camTargetY());
  }

  // ── Boot sequence ─────────────────────────────────────────────────────────
  buildPrePlaced();
  drawGround();
  layout();
  drawMeter(PRE_PLACED);
  towerWorld.position.set(window.innerWidth / 2, camTargetY());

  // Auto-start (no menu per spec)
  phase = "play";
  showGhostFinger();
  spawnActive();
  setIdleTimer();

  window.addEventListener("resize", () => {
    layout();
    if (phase === "endcard") showEndcard();
  });

  // 2nd paint: Pixi v8 shader-race workaround
  app.renderer.render(app.stage);
  requestAnimationFrame(() => {
    layout();
    app.renderer.render(app.stage);
  });

  // Validator stub — literal grep target
  void (() => window.FbPlayableAd.onCTAClick);
}

main().catch((e) => console.error(e));
