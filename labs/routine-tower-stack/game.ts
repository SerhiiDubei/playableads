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

// ── Layout constants ──────────────────────────────────────────────────────────
// HUD strip: top 56px reserved for meter + label
const HUD_H        = 56;
// Crane rail sits just below HUD
// Drop zone: the active swinging block hangs at CRANE_HANG_Y
// Tower top anchor: tower's topmost block always ~38% down from top of play area
// Play area = HUD_H .. (h - BOTTOM_STRIP_H)
const BOTTOM_STRIP_H = 80; // reserved bottom strip for instruction + CTA-free zone

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

  // ── Layers (bottom to top): bg → world(sky+ground+tower) → crane → rope → activeBlk → fx → ui(HUD) → overlay
  // We use these containers to enforce correct z-order:
  //   bgLayer      - sky gradient
  //   towerWorld   - ground + placed tower blocks (scrolls with camera)
  //   craneLayer   - crane beam + trolley (fixed screen position)
  //   ropeLayer    - rope (fixed screen, drawn to swinging block)
  //   gameLayer    - (unused now — towerWorld promoted to stage child directly)
  //   fxLayer      - sparkles / confetti
  //   uiLayer      - HUD meter + instruction text + ghost finger
  //   overlayLayer - endcard

  const bgLayer      = new Container();
  const towerWorld   = new Container(); // replaces gameLayer — placed blocks + ground
  const craneLayer   = new Container(); // crane beam + trolley
  const ropeLayer    = new Container(); // rope (rendered above crane, below swinging block)
  const activeLayer  = new Container(); // swinging block lives here
  const fxLayer      = new Container();
  const uiLayer      = new Container();
  const overlayLayer = new Container();

  app.stage.addChild(bgLayer, towerWorld, craneLayer, ropeLayer, activeLayer, fxLayer, uiLayer, overlayLayer);

  // Stage is the tap receiver; game children are NOT interactive.
  app.stage.eventMode = "static";
  app.stage.hitArea   = app.screen;
  towerWorld.interactiveChildren  = false;
  craneLayer.interactiveChildren  = false;
  ropeLayer.interactiveChildren   = false;
  activeLayer.interactiveChildren = false;
  fxLayer.interactiveChildren     = false;

  // ── State ─────────────────────────────────────────────────────────────────
  type Phase = "hook" | "play" | "win" | "endcard";
  let phase: Phase   = "hook";
  let tapCount       = 0;          // 0..3 player taps
  let dropping       = false;
  let ghostDone      = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Layout helpers ────────────────────────────────────────────────────────
  // Rail Y: crane beam sits just below HUD strip
  function railY(): number { return HUD_H + 18; }

  // The swinging block hangs at this screen Y (center of block)
  function hangY(): number { return railY() + 72; }

  // Camera target for towerWorld.y:
  //
  // Three competing constraints (towerTopY ≤ 0, towerWorld.y maps world→screen):
  //
  //   (A) GROUND FLOOR: keep ground (world y=0) visible near bottom.
  //       Screen Y of ground = towerWorld.y. Want ≤ h * 0.79.
  //
  //   (B) DROP ZONE CAP: when tower is tall, pan up so tower visual top ≤ 40% of play area.
  //       Visual top = towerWorld.y + towerTopY - BH  (towerTopY is bottom of top block).
  //       Want ≤ HUD_H + playH * 0.40.
  //       → towerWorld.y ≤ HUD_H + playH * 0.40 - towerTopY + BH
  //
  // Camera target for towerWorld.y:
  //
  // Strategy: push camera as far down as possible (ground near bottom of screen),
  // but cap upward so the TOWER TOP stays visible (at most at 55% of screen height,
  // giving plenty of sky for stars + block swing).
  //
  //   groundFloor = h * 0.79 → desired ground position (near bottom)
  //   dropZoneCap = tower visual top at screen 55%:
  //       towerWorld.y + towerTopY - BH = h * 0.55
  //       → towerWorld.y = h * 0.55 - towerTopY + BH  (= h * 0.55 + |towerTopY| + BH)
  //
  //   result = min(groundFloor, dropZoneCap)
  //   Short tower: dropZoneCap is large → groundFloor dominates → ground near bottom ✓
  //   Tall tower:  dropZoneCap shrinks → caps camera so tower top stays visible ✓
  function camTargetY(): number {
    const h = window.innerHeight;

    // (A) Desired ground position: ~79% of screen height
    const groundFloor = h * 0.79;

    // (B) Hard cap: tower visual top must stay above 55% of screen
    //     tower visual top (screen) = towerWorld.y + towerTopY - BH
    //     want ≤ h * 0.55  →  towerWorld.y ≤ h * 0.55 - towerTopY + BH
    const dropZoneCap = h * 0.55 - towerTopY + BH;

    // Use the smaller: normally groundFloor rules; when tower is tall, dropZoneCap overrides
    return Math.min(groundFloor, dropZoneCap);
  }

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
    // Horizon glow — in lower 45%
    bgGfx.rect(0, h * 0.55, w, h * 0.45).fill({ color: 0xFFB100, alpha: 0.08 });
  }

  // ── Habit meter bar (HUD strip — top 56px) ───────────────────────────────
  const meterContainer = new Container();
  uiLayer.addChild(meterContainer);
  let meterGfx  = new Graphics();
  let meterFill = new Graphics();
  let meterLabel: Text | null = null;
  meterContainer.addChild(meterGfx, meterFill);

  function drawMeter(filledBlocks: number): void {
    const w = window.innerWidth;
    meterGfx.clear();
    meterFill.clear();
    if (meterLabel) { meterLabel.destroy(); meterLabel = null; }

    const barW = Math.min(w * 0.55, 220);
    const barH = 14;
    const bx   = w / 2 - barW / 2;
    // Vertically center the meter + label within the top HUD_H strip
    // label below bar: barH + 4 + ~14 label = 32px total; center at HUD_H/2 = 28
    const by   = Math.round(HUD_H / 2 - (barH + 18) / 2);

    // Track
    meterGfx.roundRect(bx, by, barW, barH, 7).fill({ color: 0xffffff, alpha: 0.12 });
    // Filled portion
    const fillW = (filledBlocks / TOTAL_BLOCKS) * barW;
    if (fillW > 0) {
      meterFill.roundRect(bx, by, fillW, barH, 7).fill({ color: COL_PRI, alpha: 0.85 });
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
    meterLabel.position.set(w / 2, by + barH + 3);
    meterContainer.addChild(meterLabel);
  }

  // HUD background strip (solid semi-transparent bar behind meter)
  const hudBg = new Graphics();
  uiLayer.addChildAt(hudBg, 0); // behind meter

  function drawHudBg(): void {
    const w = window.innerWidth;
    hudBg.clear();
    hudBg.rect(0, 0, w, HUD_H).fill({ color: 0x000000, alpha: 0.32 });
  }

  // ── Placed block records ──────────────────────────────────────────────────
  interface PlacedBlock { cx: number; topY: number; }
  const placed: PlacedBlock[] = [];

  // ── Tower top world Y ─────────────────────────────────────────────────────
  let towerTopY = 0;  // world y of the top surface of the topmost block (0 = ground surface)

  // ── Ground platform (soil + grass) ───────────────────────────────────────
  const groundGfx = new Graphics();
  towerWorld.addChild(groundGfx);

  function drawGround(): void {
    const w = window.innerWidth;
    groundGfx.clear();
    // Wide soil platform the tower stands on
    // In towerWorld coords: y=0 is the ground surface
    const gw = w * 2.4;
    const gx = -gw / 2;

    // Deep soil body
    groundGfx.rect(gx, 0, gw, 80).fill({ color: 0x3b2005 });
    // Lighter soil mid
    groundGfx.rect(gx, 6, gw, 30).fill({ color: 0x5a3410 });
    // Grass top strip
    groundGfx.rect(gx, 0, gw, 10).fill({ color: 0x2e7d32 });
    // Bright grass edge highlight
    groundGfx.rect(gx, 0, gw, 3).fill({ color: 0x4caf50 });
    // Grass tufts (decorative notches)
    for (let i = 0; i < 22; i++) {
      const tx = gx + (i / 22) * gw + 10;
      const th = 6 + (i % 3) * 3;
      groundGfx.rect(tx, -th, 4, th).fill({ color: 0x388e3c });
    }
    // Soil pebble dots
    for (let i = 0; i < 12; i++) {
      const px = gx + (i * 173 + 40) % gw;
      const py = 16 + (i * 31) % 18;
      groundGfx.circle(px, py, 2 + (i % 3)).fill({ color: 0x2a1a06, alpha: 0.5 });
    }
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
  function buildPrePlaced(): void {
    // Remove all children except groundGfx
    while (towerWorld.children.length > 0) {
      towerWorld.removeChildAt(0);
    }
    placed.length = 0;
    towerWorld.addChild(groundGfx);
    drawGround();
    towerTopY = 0;

    for (let i = 0; i < PRE_PLACED; i++) {
      towerTopY -= BH;
      placeBlockInWorld(i, 0, towerTopY);
    }
  }

  // ── Crane rail + trolley ───────────────────────────────────────────────────
  // Crane drawn in craneLayer (fixed screen coords, below HUD, above world)
  const craneGfx   = new Graphics();
  const trolleyGfx = new Graphics();
  craneLayer.addChild(craneGfx, trolleyGfx);

  // Rope drawn in ropeLayer (above crane, below activeBlock)
  const ropeGfx = new Graphics();
  ropeLayer.addChild(ropeGfx);

  function drawCrane(blockScreenX?: number): void {
    const w = window.innerWidth;
    const ry = railY();
    craneGfx.clear();
    // Crane beam spans full width
    craneGfx.rect(0, ry, w, 7).fill({ color: 0x6b4a2a });
    craneGfx.rect(0, ry - 4, w, 4).fill({ color: 0x8a6040 });

    trolleyGfx.clear();
    ropeGfx.clear();

    if (blockScreenX !== undefined) {
      const hy = hangY();
      // Rope: from rail bottom to just above block center
      ropeGfx.moveTo(blockScreenX, ry + 7).lineTo(blockScreenX, hy - BH * 0.52).stroke({ width: 3, color: 0x2a1d10 });
      ropeGfx.circle(blockScreenX, hy - BH * 0.52, 4).fill({ color: 0x2a1d10 });
      // Trolley wheel on rail
      trolleyGfx.roundRect(blockScreenX - 16, ry - 4, 32, 16, 4).fill({ color: 0x3a2a1a });
    }
  }

  // ── Active (swinging) block ────────────────────────────────────────────────
  let activeBlk: Container | null = null;
  let swingTween: gsap.core.Tween | null = null;
  const swingPad = 28;

  function spawnActive(): void {
    if (activeBlk && !activeBlk.destroyed) {
      gsap.killTweensOf(activeBlk);
      for (let ci = 0; ci < activeBlk.children.length; ci++) {
        gsap.killTweensOf(activeBlk.children[ci]);
      }
      activeLayer.removeChild(activeBlk);
      activeBlk.destroy({ children: true });
      activeBlk = null;
    }
    swingTween?.kill();
    swingTween = null;
    if (tapCount >= PLAYER_TAPS) return;

    const blkIdx = PRE_PLACED + tapCount;
    const blk    = makeHabitBlock(blkIdx);
    const w      = window.innerWidth;
    blk.position.set(swingPad + BW / 2, hangY());
    activeLayer.addChild(blk);
    activeBlk = blk;

    const lo  = swingPad + BW / 2;
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

    // Instruction text — in bottom strip above CTA-free zone
    const h2 = window.innerHeight;
    instrText.style.fontSize = Math.min(18, window.innerWidth * 0.048);
    instrText.position.set(window.innerWidth / 2, h2 - BOTTOM_STRIP_H / 2);
    instrText.alpha = 0;
    gsap.killTweensOf(instrText);
    gsap.to(instrText, { alpha: 1, duration: 0.35, delay: 0.2 });
  }

  // ── Shadow hint (pulsing indicator at tower top) ──────────────────────────
  const shadowHintGfx = new Graphics();
  uiLayer.addChild(shadowHintGfx);
  let shadowTween: gsap.core.Tween | null = null;

  function showShadowHint(visible: boolean): void {
    shadowTween?.kill();
    shadowTween = null;
    shadowHintGfx.clear();
    if (!visible) return;
    const w = window.innerWidth;
    // Draw hint at the tower top in screen coords
    const screenTowerTop = towerWorld.y + towerTopY;
    shadowHintGfx.ellipse(w / 2, screenTowerTop - 6, BW * 0.45, 7).fill({ color: 0xffffff, alpha: 0.18 });
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
    // Position in middle of play area
    finger.position.set(w / 2, HUD_H + (h - HUD_H - BOTTOM_STRIP_H) * 0.52);
    finger.alpha = 0;
    ghostContainer.addChild(finger);

    // Animate: fade in, show tap gesture, fade out — then repeat twice, no auto-drop
    const seq = gsap.timeline({ repeat: 2, repeatDelay: 0.6, onComplete: () => {
      ghostContainer.removeChildren();
      ghostDone = true;
      void ghostDone; // used as state flag
    }});
    seq.to(finger, { alpha: 0.85, y: finger.y - (h * 0.02), duration: 0.4 })
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
    swingTween = null;
    showShadowHint(false);
    ghostContainer.removeChildren();
    clearIdleTimer();
    gsap.killTweensOf(instrText);
    gsap.to(instrText, { alpha: 0, duration: 0.2 });

    const blk    = activeBlk;
    const blkIdx = PRE_PLACED + tapCount;

    // blk is in activeLayer (screen coords). Its x is the screen x.
    const tapScreenX = blk.x;

    // Convert to world x: worldX = screenX - towerWorld.x (towerWorld.x = w/2 always)
    const worldW2 = window.innerWidth / 2;
    const worldLowerCx = placed.length > 0 ? placed[placed.length - 1].cx : 0;
    const offset  = (tapScreenX - worldW2) - worldLowerCx;
    const isPerfect = Math.abs(offset) <= 8;

    // Magnet forgiveness
    const magnetDist = Math.abs(offset);
    const magnetPull = magnetDist <= MAG_TOL ? (offset * 0.25) : offset;
    const magnetStrength = Math.min(1, magnetDist / MAG_TOL);
    const finalWorldX = worldLowerCx + magnetPull;

    // Target screen coords for the landed block
    const landScreenX = worldW2 + finalWorldX;

    // The block should land at towerTopY - BH (one block above current top)
    // In screen coords: towerWorld.y + (towerTopY - BH) - BH/2
    const landWorldTopY = towerTopY - BH; // world y of top surface of new block
    const landScreenY   = towerWorld.y + landWorldTopY - BH / 2; // screen y of center

    const dist = Math.abs(landScreenY - blk.y);
    const dropDur = Math.max(0.22, dist / 2200 + 0.14);

    // Use a single tween to move x + y together — avoids race between two tweens on same target
    gsap.to(blk, {
      x: landScreenX,
      y: landScreenY,
      duration: dropDur,
      ease: "power1.in",
      onComplete: () => {
        if (!blk || blk.destroyed) { dropping = false; return; }
        landBlock(blk, blkIdx, finalWorldX, isPerfect, magnetStrength);
      },
    });
  }

  function landBlock(blk: Container, blkIdx: number, finalWorldX: number, isPerfect: boolean, magnetStrength: number): void {
    if (!blk || blk.destroyed) { dropping = false; return; }

    // Kill ALL tweens on this block and all its children before destroying
    // (prevents GSAP from writing x/y/alpha to destroyed objects)
    gsap.killTweensOf(blk);
    for (let ci = 0; ci < blk.children.length; ci++) {
      gsap.killTweensOf(blk.children[ci]);
    }

    // Block was in activeLayer. Place equivalent block in towerWorld.
    activeLayer.removeChild(blk);
    blk.destroy({ children: true });
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
      // Use a wrapper container for pivot rotation so towerWorld.y doesn't fight camera
      gsap.to(towerWorld, {
        rotation: (Math.random() > 0.5 ? 1 : -1) * 0.052,
        duration: 0.18,
        ease: "power2.out",
        yoyo: true,
        repeat: 3,
        onComplete: () => {
          gsap.to(towerWorld, { rotation: 0, duration: 0.2, ease: "sine.inOut", onComplete: () => {
            towerWorld.rotation = 0;
            gsap.to(towerWorld, { y: camTargetY(), duration: 0.25, ease: "power2.out" });
          }});
        },
      });
      sparkleAt(window.innerWidth / 2 + finalWorldX, towerWorld.y + towerTopY, 0xFFB100);
    } else {
      // Wind gust — subtle horizontal oscillation of fx particles
      windGust();
      sparkleAt(window.innerWidth / 2 + finalWorldX, towerWorld.y + towerTopY, COL_ACC);
    }

    // Camera rise — smooth scroll up as tower grows
    gsap.to(towerWorld, { y: camTargetY(), duration: 0.42, ease: "power2.out" });

    tapCount++;
    drawMeter(PRE_PLACED + tapCount);

    if (tapCount >= PLAYER_TAPS) {
      // Win!
      gsap.delayedCall(0.35, triggerWin);
    } else {
      gsap.delayedCall(0.3, () => {
        if (phase !== "play") return;
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
        onComplete: () => { if (!s.destroyed) { fxLayer.removeChild(s); s.destroy(); } },
      });
    }
  }

  function windGust(): void {
    const w2 = window.innerWidth;
    for (let i = 0; i < 6; i++) {
      const g = new Graphics().rect(0, -2, 30 + Math.random() * 40, 3).fill({ color: 0xffffff, alpha: 0.25 });
      // Near the tower top in screen space
      const gY = towerWorld.y + towerTopY - 20 - Math.random() * 60;
      g.position.set(Math.random() * w2, gY);
      fxLayer.addChild(g);
      gsap.to(g, { x: g.x + 80, alpha: 0, duration: 0.5 + Math.random() * 0.3, ease: "power1.out",
        onComplete: () => { if (!g.destroyed) { fxLayer.removeChild(g); g.destroy(); } } });
    }
  }

  // ── Confetti burst ────────────────────────────────────────────────────────
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
      // Single tween for all properties — avoids multi-tween race where one completes+destroys
      // the piece while siblings are still running the same frame.
      gsap.to(piece, {
        y: h + 30,
        x: sx + (Math.random() < 0.5 ? -sway : sway),
        rotation: piece.rotation + (Math.random() - 0.5) * 12,
        duration: dur,
        ease: "power1.in",
        onComplete: () => {
          if (!piece.destroyed) { fxLayer.removeChild(piece); piece.destroy(); }
        },
      });
    }
  }

  // ── Streak flame (flicker) ────────────────────────────────────────────────
  function showStreakFlame(): void {
    const w = window.innerWidth;
    for (let f = 0; f < 5; f++) {
      const flame = new Container();
      const fx = w / 2 + (f - 2) * 22;
      // Position at tower top in screen space
      const fy = towerWorld.y + towerTopY;

      const body = new Graphics()
        .poly([0, 0, 12, -30, -12, -30, 0, -55])
        .fill({ color: 0xFF6B00, alpha: 0.9 });
      const inner = new Graphics()
        .poly([0, -5, 7, -25, -7, -25, 0, -42])
        .fill({ color: 0xFFD700, alpha: 0.85 });
      flame.addChild(body, inner);
      flame.position.set(fx, fy);
      fxLayer.addChild(flame);

      // Flicker — use scale ObservablePoint directly (no scaleX/scaleY in Pixi v8)
      const targetScaleY = 1.2 + Math.random() * 0.3;
      const targetScaleX = 0.85 + Math.random() * 0.2;
      gsap.to(flame.scale, {
        y: targetScaleY,
        x: targetScaleX,
        duration: 0.12,
        yoyo: true,
        repeat: 20,
        ease: "sine.inOut",
        onComplete: () => { if (!flame.destroyed) { gsap.killTweensOf(flame.scale); fxLayer.removeChild(flame); flame.destroy(); } },
      });
    }
  }

  // ── Win flow ──────────────────────────────────────────────────────────────
  function triggerWin(): void {
    if (phase === "win" || phase === "endcard") return;
    phase = "win";
    swingTween?.kill();
    swingTween = null;
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
    // Position in middle of play area
    winText.position.set(w / 2, HUD_H + (h - HUD_H - BOTTOM_STRIP_H) * 0.35);
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

    // Brand logo (procedural stacked blocks + sun silhouette)
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

  // ── Ticker: crane rope update + dt safety ────────────────────────────────
  app.ticker.add(() => {
    if (activeBlk && !activeBlk.destroyed) {
      drawCrane(activeBlk.x);
    } else {
      drawCrane();
    }
  });

  // ── Layout / resize ────────────────────────────────────────────────────────
  function layout(): void {
    const w = window.innerWidth, h = window.innerHeight;
    app.renderer.resize(w, h);
    app.canvas.style.width  = w + "px";
    app.canvas.style.height = h + "px";
    app.stage.hitArea = { x: 0, y: 0, width: w, height: h, contains: () => true } as any;
    drawBg();
    drawHudBg();
    drawCrane(activeBlk && !activeBlk.destroyed ? activeBlk.x : undefined);
    // Re-center towerWorld horizontally; update camera Y
    towerWorld.position.set(w / 2, camTargetY());
  }

  // ── Boot sequence ─────────────────────────────────────────────────────────
  buildPrePlaced();
  drawBg();
  drawHudBg();
  drawMeter(PRE_PLACED);
  towerWorld.position.set(window.innerWidth / 2, camTargetY());
  drawCrane();

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
