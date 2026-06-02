import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

// Injected at build time by esbuild `define` (see src/build/bundler.ts).
declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// ── Tunables (brief params override manifest defaults) ────────────────────────
const SPAWN_W = Number(cfg.params.spawnWidth ?? 190);
const BH = Number(cfg.params.blockHeight ?? 54);
const BASE_SWING = Number(cfg.params.baseSwingDur ?? 1.6);
const MIN_SWING = Number(cfg.params.minSwingDur ?? 0.62);
const PERFECT_TOL = Number(cfg.params.perfectTol ?? 11);
const SWING_PAD = Number(cfg.params.swingPad ?? 26);

// ── Color helpers ─────────────────────────────────────────────────────────────
function num(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}
// Blend a 0xRRGGBB color toward white (f>0) or black (f<0) by |f| in [0..1].
function shade(c: number, f: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const t = f > 0 ? 255 : 0;
  const a = Math.abs(f);
  const nr = Math.round(r + (t - r) * a);
  const ng = Math.round(g + (t - g) * a);
  const nb = Math.round(b + (t - b) * a);
  return (nr << 16) | (ng << 8) | nb;
}

const TXT = cfg.style.colors.text;
const FONT = cfg.style.font.family;

// ── Floor catalog (claymation fantasy floors). type 0 = foundation. ──────────
interface FloorDef {
  body: number;
  decor: "door" | "window" | "potion" | "mushroom" | "crystal" | "books" | "balcony";
}
const FLOORS: FloorDef[] = [
  { body: 0xc7a06a, decor: "door" }, // 0 stone foundation
  { body: 0x7fb7d9, decor: "window" }, // 1 mage study
  { body: 0x9b7fd0, decor: "potion" }, // 2 potion lab
  { body: 0x6fbf8b, decor: "mushroom" }, // 3 mushroom room
  { body: 0x59a9d6, decor: "crystal" }, // 4 crystal hall
  { body: 0xd08a5a, decor: "books" }, // 5 library
  { body: 0xe0a85a, decor: "balcony" }, // 6 greenhouse balcony
];

// Generated sprite key for a floor type (swaps in when assets present).
function floorTexKey(type: number): string {
  return `floor-${type}.webp`;
}
// Decoded textures for every inlined asset (filled once by preloadTextures()).
const TEX: Record<string, Texture> = {};
async function preloadTextures(): Promise<void> {
  await Promise.all(
    Object.entries(cfg.assets).map(async ([k, uri]) => {
      const img = new Image();
      img.src = uri;
      try {
        await img.decode();
      } catch {
        /* ignore decode errors; fall back to procedural */
      }
      TEX[k] = Texture.from(img);
    }),
  );
}
function tex(key: string): Texture | null {
  return TEX[key] ?? null;
}

// Draw decorations for a floor onto container `c`, sized to w×h centered at 0,0.
function addDecor(c: Container, w: number, h: number, def: FloorDef): void {
  const acc = cfg.style.colors.accent;
  switch (def.decor) {
    case "door": {
      const dw = Math.min(w * 0.3, 40);
      c.addChild(
        new Graphics()
          .roundRect(-dw / 2, h / 2 - h * 0.62, dw, h * 0.62, 8)
          .fill({ color: shade(def.body, -0.5) }),
      );
      c.addChild(
        new Graphics()
          .circle(dw * 0.22, h * 0.06, 2.5)
          .fill({ color: num(acc) }),
      );
      break;
    }
    case "window": {
      const win = new Graphics()
        .roundRect(-w * 0.14, -h * 0.2, w * 0.28, h * 0.46, 6)
        .fill({ color: 0xfff1c2 })
        .stroke({ width: 3, color: shade(def.body, -0.45) });
      c.addChild(win);
      c.addChild(
        new Graphics()
          .rect(-1.5, -h * 0.2, 3, h * 0.46)
          .fill({ color: shade(def.body, -0.45) }),
      );
      break;
    }
    case "potion": {
      const cols = [0xff6f8b, 0x6ff0c0];
      cols.forEach((col, i) => {
        const x = (i - 0.5) * w * 0.34;
        c.addChild(new Graphics().roundRect(x - 7, -h * 0.05, 14, h * 0.34, 5).fill({ color: col }));
        c.addChild(new Graphics().rect(x - 4, -h * 0.12, 8, 6).fill({ color: shade(def.body, -0.4) }));
      });
      break;
    }
    case "mushroom": {
      c.addChild(new Graphics().rect(-5, -h * 0.04, 10, h * 0.3).fill({ color: 0xf3e2c0 }));
      c.addChild(new Graphics().ellipse(0, -h * 0.06, w * 0.18, h * 0.2).fill({ color: 0xe2553f }));
      c.addChild(new Graphics().circle(-w * 0.07, -h * 0.08, 3).fill({ color: 0xfff4e0 }));
      c.addChild(new Graphics().circle(w * 0.06, -h * 0.04, 2.5).fill({ color: 0xfff4e0 }));
      break;
    }
    case "crystal": {
      const s = h * 0.32;
      c.addChild(
        new Graphics()
          .poly([0, -s, s * 0.7, 0, 0, s, -s * 0.7, 0])
          .fill({ color: 0x8fe6ff })
          .stroke({ width: 2.5, color: 0x3a7fae }),
      );
      break;
    }
    case "books": {
      const cols = [0xc0392b, 0x27ae60, 0x2980b9, 0xf1c40f];
      cols.forEach((col, i) => {
        const x = (i - 1.5) * 13;
        c.addChild(new Graphics().roundRect(x - 5, -h * 0.22, 10, h * 0.44, 2).fill({ color: col }));
      });
      break;
    }
    case "balcony": {
      c.addChild(new Graphics().rect(-w * 0.32, h * 0.18, w * 0.64, 5).fill({ color: shade(def.body, -0.4) }));
      for (let i = -2; i <= 2; i++) {
        c.addChild(new Graphics().rect(i * (w * 0.13) - 1.5, h * 0.06, 3, h * 0.16).fill({ color: shade(def.body, -0.4) }));
      }
      c.addChild(new Graphics().circle(0, -h * 0.05, h * 0.16).fill({ color: 0x4caf50 }));
      break;
    }
  }
}

// Build a clay floor block (procedural). Centered at 0,0, size w×h.
function makeBlock(w: number, h: number, type: number): Container {
  const c = new Container();
  const def = FLOORS[type] ?? FLOORS[1];

  // Generated clay sprite if available (baked soft shadow + ledge).
  const t = tex(floorTexKey(type));
  if (t) {
    const sp = new Sprite(t);
    sp.anchor.set(0.5);
    sp.width = w;
    sp.height = h * 1.16; // slightly taller so the baked ledge overlaps the seam
    c.addChild(sp);
    return c;
  }

  // Procedural clay body (fallback). Soft drop shadow first.
  c.addChild(
    new Graphics().roundRect(-w / 2 + 4, -h / 2 + 7, w, h, 13).fill({ color: 0x000000, alpha: 0.15 }),
  );

  const body = new Graphics()
    .roundRect(-w / 2, -h / 2, w, h, 13)
    .fill({ color: def.body })
    .stroke({ width: 3, color: shade(def.body, -0.42), alignment: 1 });
  c.addChild(body);
  // Top highlight + bottom shade for clay volume.
  c.addChild(
    new Graphics().roundRect(-w / 2 + 7, -h / 2 + 6, w - 14, h * 0.32, 8).fill({ color: shade(def.body, 0.34), alpha: 0.55 }),
  );
  c.addChild(
    new Graphics().roundRect(-w / 2 + 7, h * 0.16, w - 14, h * 0.26, 8).fill({ color: shade(def.body, -0.26), alpha: 0.38 }),
  );
  addDecor(c, w, h, def);
  return c;
}

// A wizard mascot. Uses the generated clay sprite when present, else procedural.
// `targetH` is the desired on-screen height in px.
function makeMage(mood: "idle" | "sad", targetH = 150): Container {
  const container = new Container();
  const t = tex(mood === "sad" ? "mage-sad.webp" : "mage-idle.webp");
  if (t) {
    const sp = new Sprite(t);
    sp.anchor.set(0.5);
    sp.height = targetH;
    sp.scale.x = sp.scale.y;
    container.addChild(sp);
    return container;
  }
  const m = new Container();
  const s = 1;
  // Robe.
  m.addChild(new Graphics().poly([-26, 44, 26, 44, 16, 4, -16, 4]).fill({ color: 0x5a4f9e }).stroke({ width: 3, color: 0x3a3170 }));
  // Face.
  m.addChild(new Graphics().circle(0, -4, 16).fill({ color: 0xf2c79a }).stroke({ width: 2.5, color: 0xc89a72 }));
  // Beard.
  m.addChild(new Graphics().poly([-12, 2, 12, 2, 0, 26]).fill({ color: 0xf2efe6 }));
  // Eyes.
  const ey = mood === "sad" ? -2 : -6;
  m.addChild(new Graphics().circle(-6, ey, 2.4).fill({ color: 0x222 }));
  m.addChild(new Graphics().circle(6, ey, 2.4).fill({ color: 0x222 }));
  // Hat.
  m.addChild(new Graphics().poly([-22, -8, 22, -8, 4, -54]).fill({ color: 0x7a3fb0 }).stroke({ width: 3, color: 0x53277a }));
  m.addChild(new Graphics().circle(4, -54, 4).fill({ color: cfg.style.colors.accent }));
  // Mouth.
  if (mood === "sad") {
    m.addChild(new Graphics().poly([-7, 16, 7, 16, 0, 11]).fill({ color: 0x8a4a3a }));
  } else {
    m.addChild(new Graphics().poly([-7, 11, 7, 11, 0, 17]).fill({ color: 0x8a4a3a }));
  }
  m.scale.set((targetH / 110) * s);
  container.addChild(m);
  return container;
}

// Uniformly scale a Text down so it never exceeds maxW (keeps wrap + position).
function fit(t: Text, maxW: number): void {
  t.scale.set(1);
  if (t.width > maxW) t.scale.set(maxW / t.width);
}

interface Placed {
  cx: number; // world center x
  w: number;
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: num(cfg.style.colors.background),
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // Layers.
  const sky = new Graphics();
  const clouds = new Container();
  const tower = new Container(); // world: ground + placed blocks
  const fx = new Container(); // screen-space slices/sparkles
  const ui = new Container(); // crane + active block
  const hud = new Container();
  const overlay = new Container(); // menu + endcard
  app.stage.addChild(sky, clouds, tower, fx, ui, hud, overlay);

  // Sky background sprite (sits behind the gradient fallback).
  const skySprite: Sprite | null = (() => {
    const t = tex("sky-bg.webp");
    if (!t) return null;
    const sp = new Sprite(t);
    sp.anchor.set(0.5);
    app.stage.addChildAt(sp, 0);
    return sp;
  })();

  // ── State ───────────────────────────────────────────────────────────────────
  let state: "menu" | "play" | "over" = "menu";
  let topY = 0; // world y of current tower top surface (smaller = higher)
  let curW = SPAWN_W; // width carried to the next floor
  let floors = 0; // floors successfully placed (excludes foundation)
  let score = 0;
  let combo = 0;
  let active: Container | null = null;
  let activeType = 1;
  let swingTween: gsap.core.Tween | null = null;
  let dropping = false;
  let lower: Placed = { cx: 0, w: SPAWN_W + 24 }; // foundation as first "lower"

  let W = app.screen.width;
  let H = app.screen.height;
  let buildLineY = H * 0.6;

  // ── Sky + clouds ──────────────────────────────────────────────────────────
  function drawSky(): void {
    sky.clear();
    if (skySprite) {
      const tw = skySprite.texture.width || 1;
      const th = skySprite.texture.height || 1;
      const sc = Math.max(W / tw, H / th);
      skySprite.scale.set(sc);
      skySprite.position.set(W / 2, H / 2);
      return;
    }
    const bands = 8;
    const top = num("#9fdcff");
    const bot = num(cfg.style.colors.background);
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const col = shade(top, 0) === 0 ? bot : lerpColor(top, bot, t);
      sky.rect(0, (H / bands) * i, W, H / bands + 1).fill({ color: col });
    }
  }
  function lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (
      (Math.round(ar + (br - ar) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) |
      Math.round(ab + (bb - ab) * t)
    );
  }
  function buildClouds(): void {
    clouds.removeChildren();
    for (let i = 0; i < 5; i++) {
      const c = new Container();
      const ct = tex("cloud.webp");
      if (ct) {
        const sp = new Sprite(ct);
        sp.anchor.set(0.5);
        sp.width = 84 + (i % 3) * 28;
        sp.scale.y = sp.scale.x;
        sp.alpha = 0.92;
        c.addChild(sp);
      } else {
        const r = 18 + (i % 3) * 6;
        c.addChild(new Graphics().circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.85 }));
        c.addChild(new Graphics().circle(r, 4, r * 0.8).fill({ color: 0xffffff, alpha: 0.85 }));
        c.addChild(new Graphics().circle(-r, 5, r * 0.7).fill({ color: 0xffffff, alpha: 0.85 }));
      }
      c.position.set(((i * 137) % (W + 100)) - 50, H * (0.12 + (i % 4) * 0.13));
      clouds.addChild(c);
      const dur = 16 + i * 5;
      gsap.to(c, { x: c.x + W + 120, duration: dur, repeat: -1, ease: "none", modifiers: { x: (x) => `${((parseFloat(x) + W + 120) % (W + 220)) - 100}` } });
    }
  }

  // ── Ground + foundation in world ──────────────────────────────────────────
  function buildWorld(): void {
    tower.removeChildren();
    const fH = BH + 12;
    // Hill ground (clay sprite, else procedural ellipse).
    const gt = tex("ground.webp");
    if (gt) {
      const g = new Sprite(gt);
      g.anchor.set(0.5, 0);
      g.width = Math.max(W * 1.25, (SPAWN_W + 24) * 1.9);
      g.scale.y = g.scale.x;
      g.position.set(0, fH - 20);
      tower.addChild(g);
    } else {
      tower.addChild(new Graphics().ellipse(0, BH + 130, W * 0.9, 150).fill({ color: 0x7bbf6a }));
    }
    // Foundation block (type 0).
    const found = makeBlock(SPAWN_W + 24, fH, 0);
    found.position.set(0, fH / 2); // top at world y = 0
    tower.addChild(found);
  }

  function camTargetY(): number {
    return buildLineY - topY;
  }

  // ── Crane (rail + trolley + rope) ─────────────────────────────────────────
  const craneRail = new Graphics();
  const trolley = new Graphics();
  const rope = new Graphics();
  ui.addChild(craneRail, rope, trolley);
  function drawCrane(): void {
    craneRail.clear().rect(0, H * 0.085, W, 8).fill({ color: 0x6b4a2a });
    craneRail.rect(0, H * 0.085 - 5, W, 5).fill({ color: 0x8a5f37 });
  }
  function updateCraneToActive(): void {
    rope.clear();
    trolley.clear();
    if (!active) return;
    const x = active.x;
    trolley.roundRect(x - 16, H * 0.085 - 4, 32, 18, 4).fill({ color: 0x3a2a1a });
    rope.moveTo(x, H * 0.085 + 12).lineTo(x, active.y - BH / 2).stroke({ width: 3, color: 0x2a1d10 });
    // little hook
    rope.circle(x, active.y - BH / 2, 4).fill({ color: 0x2a1d10 });
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  const scoreText = new Text({ text: "0", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 46 } });
  scoreText.anchor.set(0.5, 0);
  const floorText = new Text({ text: "", style: { fill: shade(num(TXT), 0.2), fontFamily: FONT, fontWeight: "bold", fontSize: 20 } });
  floorText.anchor.set(0.5, 0);
  hud.addChild(scoreText, floorText);
  const comboText = new Text({ text: "", style: { fill: cfg.style.colors.accent, fontFamily: FONT, fontWeight: "bold", fontSize: 40 } });
  comboText.anchor.set(0.5);
  comboText.alpha = 0;
  hud.addChild(comboText);
  const hint = new Text({ text: "Тапни, щоб скинути!", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 24 } });
  hint.anchor.set(0.5);
  hint.alpha = 0;
  hud.addChild(hint);

  function updateHud(): void {
    scoreText.text = String(score);
    floorText.text = `Поверхів: ${floors}`;
  }
  function flashCombo(txt: string): void {
    comboText.text = txt;
    comboText.style.fontSize = Math.min(40, W * 0.1);
    comboText.position.set(W / 2, buildLineY - 70);
    comboText.alpha = 1;
    comboText.scale.set(0.6);
    gsap.killTweensOf(comboText);
    gsap.killTweensOf(comboText.scale);
    gsap.to(comboText.scale, { x: 1.1, y: 1.1, duration: 0.25, ease: "back.out(2)" });
    gsap.to(comboText, { alpha: 0, y: comboText.y - 36, duration: 0.9, delay: 0.35, ease: "power1.in" });
  }

  // ── Persistent CTA pill (always available during menu/play) ────────────────
  const ctaPill = new Container();
  const ctaPillBg = new Graphics();
  const ctaPillTxt = new Text({ text: cfg.copy.cta, style: { fill: "#3a2418", fontFamily: FONT, fontWeight: "bold", fontSize: 26 } });
  ctaPillTxt.anchor.set(0.5);
  ctaPill.addChild(ctaPillBg, ctaPillTxt);
  ctaPill.eventMode = "static";
  ctaPill.cursor = "pointer";
  ctaPill.on("pointertap", (e) => {
    e.stopPropagation();
    window.FbPlayableAd.onCTAClick();
  });
  hud.addChild(ctaPill);
  function drawCtaPill(): void {
    const w = Math.min(W * 0.62, 300);
    ctaPillBg.clear()
      .roundRect(-w / 2, -28, w, 56, 28).fill({ color: cfg.style.colors.accent })
      .roundRect(-w / 2, -28, w, 56, 28).stroke({ width: 3, color: shade(num(cfg.style.colors.accent), -0.3) });
    fit(ctaPillTxt, w * 0.8);
    ctaPillTxt.position.set(0, 0);
    ctaPill.position.set(W / 2, H * 0.93);
  }

  // ── Active block lifecycle ────────────────────────────────────────────────
  function swingBounds(): [number, number] {
    const half = curW / 2;
    return [SWING_PAD + half, W - SWING_PAD - half];
  }
  function spawnActive(): void {
    if (state !== "play") return;
    activeType = 1 + (floors % (FLOORS.length - 1));
    const blk = makeBlock(curW, BH, activeType);
    blk.position.set(swingBounds()[0], H * 0.3);
    ui.addChildAt(blk, ui.getChildIndex(trolley)); // under trolley/rope
    active = blk;
    const [l, r] = swingBounds();
    const dur = Math.max(MIN_SWING, BASE_SWING - floors * 0.06);
    swingTween = gsap.fromTo(blk, { x: l }, { x: r, duration: dur, ease: "sine.inOut", yoyo: true, repeat: -1 });
    if (floors === 0) {
      hint.style.fontSize = Math.min(22, W * 0.058);
      hint.position.set(W / 2, buildLineY - 110);
      fit(hint, W * 0.84);
      hint.alpha = 0.25;
      gsap.killTweensOf(hint);
      gsap.to(hint, { alpha: 1, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }
  }

  function dropActive(): void {
    if (state !== "play" || !active || dropping) return;
    dropping = true;
    swingTween?.kill();
    gsap.killTweensOf(hint);
    gsap.to(hint, { alpha: 0, duration: 0.2 });
    const blk = active;
    const targetY = buildLineY - BH / 2;
    const dist = targetY - blk.y;
    gsap.to(blk, {
      y: targetY,
      duration: Math.max(0.18, dist / 2400 + 0.16),
      ease: "power1.in",
      onComplete: () => land(blk),
    });
  }

  function land(blk: Container): void {
    const screenCx = blk.x;
    const lowerScreenCx = tower.x + lower.cx;
    const aL = screenCx - curW / 2;
    const aR = screenCx + curW / 2;
    const lL = lowerScreenCx - lower.w / 2;
    const lR = lowerScreenCx + lower.w / 2;
    const overlapL = Math.max(aL, lL);
    const overlapR = Math.min(aR, lR);
    const overlap = overlapR - overlapL;

    if (overlap <= 4) {
      // Total miss → topple and game over.
      ui.removeChild(blk);
      tower.addChild(blk);
      blk.position.set(screenCx - tower.x, topY - BH / 2);
      gsap.to(blk, { y: blk.y + H, rotation: (Math.random() - 0.5) * 2, duration: 1.0, ease: "power1.in" });
      active = null;
      gameOver();
      return;
    }

    const offset = screenCx - lowerScreenCx;
    const perfect = Math.abs(offset) <= PERFECT_TOL;
    let newW: number;
    let newCx: number;

    if (perfect) {
      newW = curW;
      newCx = lower.cx; // snap perfectly
      combo++;
      const bonus = 10 + combo * 5;
      score += bonus;
      flashCombo(combo >= 2 ? `PERFECT ×${combo}!` : "PERFECT!");
      sparkle(lowerScreenCx, buildLineY - BH / 2);
    } else {
      combo = 0;
      newW = overlap;
      newCx = (overlapL + overlapR) / 2 - tower.x;
      score += 10;
      // Spawn falling slice(s) for the overhang.
      if (aL < lL) makeSlice(aL, overlapL - aL, blk.x, activeType);
      if (aR > lR) makeSlice(overlapR, aR - overlapR, blk.x, activeType);
      flashCombo("+10");
    }

    // Replace the loose active block with a trimmed, placed clay block in world.
    ui.removeChild(blk);
    const placed = makeBlock(newW, BH, activeType);
    placed.position.set(newCx, topY - BH / 2);
    tower.addChild(placed);
    // Squash-stretch landing pop.
    placed.scale.set(1.06, 0.9);
    gsap.to(placed.scale, { x: 1, y: 1, duration: 0.3, ease: "elastic.out(1,0.5)" });

    // Advance state.
    lower = { cx: newCx, w: newW };
    curW = newW;
    topY -= BH;
    floors++;
    score = Math.max(score, score); // no-op keep
    updateHud();
    if (!perfect) screenShake(Math.min(overlap < curW * 0.5 ? 8 : 5, 9));

    // Camera rises.
    gsap.to(tower, { y: camTargetY(), duration: 0.4, ease: "power2.out" });
    gsap.to(clouds, { y: -(buildLineY - camTargetY()) * 0.18, duration: 0.4, ease: "power2.out" });

    active = null;
    dropping = false;
    gsap.delayedCall(0.26, spawnActive);
  }

  function makeSlice(screenX: number, w: number, _bx: number, type: number): void {
    if (w < 2) return;
    const def = FLOORS[type] ?? FLOORS[1];
    const s = new Graphics()
      .roundRect(0, -BH / 2, w, BH, 8)
      .fill({ color: def.body })
      .stroke({ width: 2, color: shade(def.body, -0.4) });
    s.position.set(screenX, buildLineY - BH / 2);
    fx.addChild(s);
    gsap.to(s, { y: s.y + H * 0.9, rotation: (Math.random() - 0.5) * 1.6, alpha: 0, duration: 0.9, ease: "power1.in", onComplete: () => s.destroy() });
  }

  function sparkle(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      const st = new Graphics().star(0, 0, 5, 7, 3).fill({ color: cfg.style.colors.accent });
      st.position.set(x, y);
      fx.addChild(st);
      const ang = (i / 12) * Math.PI * 2;
      gsap.to(st, { x: x + Math.cos(ang) * 90, y: y + Math.sin(ang) * 90, alpha: 0, rotation: Math.random() * 3, duration: 0.7, ease: "power2.out", onComplete: () => st.destroy() });
    }
  }

  let shakeT = 0;
  function screenShake(amt: number): void {
    shakeT = amt;
  }

  // ── Game over / endcard ────────────────────────────────────────────────────
  function gameOver(): void {
    if (state === "over") return;
    state = "over";
    swingTween?.kill();
    // Crown the finished tower with a clay spire.
    const stx = tex("spire.webp");
    if (stx) {
      const sp = new Sprite(stx);
      sp.anchor.set(0.5, 1);
      const sc = Math.max(lower.w * 0.95, 70) / (stx.width || 1);
      sp.position.set(lower.cx, topY);
      sp.scale.set(0);
      tower.addChild(sp);
      gsap.to(sp.scale, { x: sc, y: sc, duration: 0.4, ease: "back.out(2)" });
    }
    gsap.to(ctaPill, { alpha: 0, duration: 0.2, onComplete: () => (ctaPill.visible = false) });
    gsap.delayedCall(0.6, showEndcard);
  }

  function showEndcard(): void {
    overlay.removeChildren();
    const dim = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.45 });
    overlay.addChild(dim);

    const panel = new Container();
    const pw = Math.min(W * 0.84, 360);
    const ph = 340;
    panel.addChild(new Graphics().roundRect(-pw / 2, -ph / 2, pw, ph, 26).fill({ color: 0xfff4df }).stroke({ width: 5, color: shade(num(cfg.style.colors.primary), 0) }));
    const mage = makeMage("sad", 128);
    mage.position.set(0, -ph / 2 + 64);
    panel.addChild(mage);
    const t1 = new Text({ text: "Вежа впала!", style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: Math.min(34, pw * 0.1) } });
    t1.anchor.set(0.5);
    fit(t1, pw * 0.84);
    t1.position.set(0, -ph / 2 + 130);
    const t2 = new Text({ text: `${floors} поверхів · ${score} очок`, style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 22 } });
    t2.anchor.set(0.5);
    fit(t2, pw * 0.86);
    t2.position.set(0, -ph / 2 + 168);
    panel.addChild(t1, t2);

    // Big primary CTA.
    const cta = new Container();
    const cw = pw - 56;
    cta.addChild(new Graphics().roundRect(-cw / 2, -34, cw, 68, 34).fill({ color: cfg.style.colors.accent }).stroke({ width: 4, color: shade(num(cfg.style.colors.accent), -0.3) }));
    const ctaT = new Text({ text: cfg.copy.cta, style: { fill: "#3a2418", fontFamily: FONT, fontWeight: "bold", fontSize: 30 } });
    ctaT.anchor.set(0.5);
    fit(ctaT, cw * 0.84);
    cta.addChild(ctaT);
    cta.position.set(0, ph / 2 - 96);
    cta.eventMode = "static";
    cta.cursor = "pointer";
    cta.on("pointertap", (e) => {
      e.stopPropagation();
      window.FbPlayableAd.onCTAClick();
    });
    panel.addChild(cta);
    gsap.to(cta.scale, { x: 1.05, y: 1.05, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });

    // Replay.
    const replay = new Text({ text: "↻ Ще раз", style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: 22 } });
    replay.anchor.set(0.5);
    fit(replay, pw * 0.6);
    replay.position.set(0, ph / 2 - 38);
    replay.eventMode = "static";
    replay.cursor = "pointer";
    replay.on("pointertap", (e) => {
      e.stopPropagation();
      resetGame();
    });
    panel.addChild(replay);

    panel.position.set(W / 2, H / 2);
    panel.scale.set(0.6);
    overlay.addChild(panel);
    gsap.to(panel.scale, { x: 1, y: 1, duration: 0.5, ease: "back.out(1.5)" });
  }

  // ── Menu ────────────────────────────────────────────────────────────────────
  function showMenu(): void {
    overlay.removeChildren();
    const panel = new Container();

    // Title (responsive, wrapped, fitted).
    const title = new Text({
      text: cfg.copy.title,
      style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: Math.min(36, W * 0.094), align: "center", wordWrap: true, wordWrapWidth: W * 0.88, lineHeight: Math.min(40, W * 0.1), stroke: { color: "#fff4df", width: 6 } },
    });
    title.anchor.set(0.5);
    fit(title, W * 0.92);

    // Mascot floats above the title.
    const mage = makeMage("idle", Math.min(200, W * 0.52));
    panel.addChild(mage);
    const mageY = -title.height / 2 - mage.height / 2 - 16;
    mage.position.set(0, mageY);
    gsap.to(mage, { y: mageY - 10, duration: 1.0, yoyo: true, repeat: -1, ease: "sine.inOut" });

    title.position.set(0, 0);
    panel.addChild(title);

    const sub = new Text({
      text: "Будуй вежу краном. Тапни — скинь поверх.",
      style: { fill: TXT, fontFamily: FONT, fontSize: Math.min(18, W * 0.048), align: "center", wordWrap: true, wordWrapWidth: W * 0.8 },
    });
    sub.anchor.set(0.5);
    sub.position.set(0, title.height / 2 + 22);
    fit(sub, W * 0.9);
    panel.addChild(sub);

    const start = new Container();
    const sw = Math.min(W * 0.62, 280);
    start.addChild(new Graphics().roundRect(-sw / 2, -40, sw, 80, 40).fill({ color: cfg.style.colors.accent }).stroke({ width: 5, color: shade(num(cfg.style.colors.accent), -0.3) }));
    const st = new Text({ text: "СТАРТ", style: { fill: "#3a2418", fontFamily: FONT, fontWeight: "bold", fontSize: 36 } });
    st.anchor.set(0.5);
    fit(st, sw * 0.7);
    start.addChild(st);
    start.position.set(0, sub.position.y + 78);
    start.eventMode = "static";
    start.cursor = "pointer";
    start.on("pointertap", (e) => {
      e.stopPropagation();
      startGame();
    });
    panel.addChild(start);
    gsap.to(start.scale, { x: 1.06, y: 1.06, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });

    panel.position.set(W / 2, H * 0.44);
    overlay.addChild(panel);
  }

  function startGame(): void {
    overlay.removeChildren();
    state = "play";
    updateHud();
    spawnActive();
  }

  function resetGame(): void {
    overlay.removeChildren();
    gsap.killTweensOf(tower);
    topY = 0;
    curW = SPAWN_W;
    floors = 0;
    score = 0;
    combo = 0;
    active = null;
    dropping = false;
    lower = { cx: 0, w: SPAWN_W + 24 };
    buildWorld();
    tower.position.set(W / 2, camTargetY());
    fx.removeChildren();
    ctaPill.visible = true;
    ctaPill.alpha = 1;
    updateHud();
    state = "play";
    spawnActive();
  }

  // ── Input: tap anywhere drops the floor ────────────────────────────────────
  app.stage.on("pointertap", () => {
    if (state === "play") dropActive();
  });

  // ── Ticker ──────────────────────────────────────────────────────────────────
  app.ticker.add(() => {
    updateCraneToActive();
    if (shakeT > 0.1) {
      tower.x = W / 2 + (Math.random() - 0.5) * shakeT;
      tower.pivot.y = (Math.random() - 0.5) * shakeT;
      shakeT *= 0.86;
    } else if (tower.x !== W / 2) {
      tower.x = W / 2;
      tower.pivot.y = 0;
    }
  });

  // ── Layout / resize ────────────────────────────────────────────────────────
  function layout(): void {
    W = app.screen.width;
    H = app.screen.height;
    buildLineY = H * 0.6;
    drawSky();
    drawCrane();
    drawCtaPill();
    tower.position.set(W / 2, camTargetY());
    // HUD: score sits above the crane rail, floors counter below it.
    scoreText.style.fontSize = Math.min(46, W * 0.12);
    scoreText.position.set(W / 2, H * 0.022);
    floorText.style.fontSize = Math.min(20, W * 0.052);
    floorText.position.set(W / 2, H * 0.108);
    fit(floorText, W * 0.6);
    if (state === "menu") showMenu();
    else if (state === "over") showEndcard();
  }

  // Decode all inlined sprites before first render.
  await preloadTextures();

  // Initial build.
  buildWorld();
  buildClouds();
  layout();
  showMenu();
  window.addEventListener("resize", layout);

  // Ensure validator sees the CTA hook is wired (also called above on taps).
  void (() => window.FbPlayableAd.onCTAClick);
}

void main();
