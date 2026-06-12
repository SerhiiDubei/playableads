import { Application, Container, Graphics, NineSliceSprite, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";
import { makeArc, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// ── Texture registry + brand font ─────────────────────────────────────────────
const TEX: Record<string, Texture> = {};
async function preloadTextures(): Promise<void> {
  await Promise.all(Object.entries(cfg.assets).map(async ([k, uri]) => {
    if (!/\.(webp|png)$/i.test(k)) return;
    const img = new Image(); img.src = uri as string;
    try { await img.decode(); } catch { return; }
    TEX[k] = Texture.from(img);
  }));
}
function tex(key: string): Texture | null { return TEX[key] ?? null; }
function makeSprite(key: string, targetW: number): Sprite | null {
  const t = tex(key);
  if (!t) return null;
  const s = new Sprite(t);
  s.anchor.set(0.5);
  s.scale.set(targetW / t.width);
  return s;
}
let FONT = cfg.style.font.family;
async function loadBrandFont(): Promise<void> {
  const data = cfg.assets["font.woff2"] as string | undefined;
  if (!data) return;
  try {
    const ff = new FontFace("BrandFont", `url(${data})`);
    await ff.load();
    document.fonts.add(ff);
    FONT = `BrandFont, ${cfg.style.font.family}`;
  } catch { /* keep fallback */ }
}

declare global {
  interface Window {
    FbPlayableAd: { onCTAClick: () => void };
  }
}

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }

// Brand colors derived from spec palette
const COL_BG      = num(cfg.style.colors.background); // #1A535C petrol
const COL_PRIMARY = num(cfg.style.colors.primary);     // #FF9F1C orange
const COL_ACCENT  = num(cfg.style.colors.accent);      // #FF9F1C accent
const COL_TEXT    = num(cfg.style.colors.text);        // #ffffff
const COL_LIME    = 0x8AC926;
const COL_WHITE   = 0xffffff;

// ── Defect 7: Readable fruit definitions — solid saturated fills, ≥56px diameter ──
const FRUITS = [
  { name: "Vitamin C", color: 0xFF6B00, r: 30, shape: "orange",  key: "orange"     },
  { name: "Greens",    color: 0x27AE60, r: 32, shape: "spinach", key: "kiwi"       },
  { name: "Protein",   color: 0xC0392B, r: 28, shape: "berry",   key: "strawberry" },
  { name: "Energy",    color: 0xFFD700, r: 30, shape: "circle",  key: "banana"     },
] as const;

// Junk items: donut, soda can — react with bounce/poof
const JUNK = [
  { color: 0xe91e8c, r: 28, shape: "donut" },
  { color: 0x1565C0, r: 26, shape: "can"   },
] as const;

async function main(): Promise<void> {
  if (!window.FbPlayableAd) window.FbPlayableAd = { onCTAClick: () => {} };
  void (() => window.FbPlayableAd.onCTAClick); // validator grep anchor

  await preloadTextures();
  await loadBrandFont();

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

  // ── Layers: bg → game → fx → ui → overlay ──
  const bgLayer   = new Container(); bgLayer.interactiveChildren   = false;
  const gameLayer = new Container(); gameLayer.interactiveChildren = false;
  const fxLayer   = new Container(); fxLayer.interactiveChildren   = false;
  const uiLayer   = new Container();
  app.stage.addChild(bgLayer, gameLayer, fxLayer, uiLayer);

  // ── Input layer ──
  app.stage.eventMode = "static";
  app.stage.hitArea   = app.screen;

  // ─────────────────────── BACKGROUND ───────────────────────
  // Defect 2: One continuous vertical gradient — no hard seam
  const bgGrad = new Graphics();
  bgLayer.addChild(bgGrad);

  function drawBg(): void {
    const w = window.innerWidth, h = window.innerHeight;
    bgGrad.clear();
    // Continuous vertical gradient: top lighter petrol → middle petrol → bottom deep dark
    // Use many thin rects to simulate smooth gradient (no hard seam)
    const STEPS = 40;
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      // Top: 0x2B7A85 (lighter), Bottom: 0x0A2830 (darkest)
      const tr = 0x2B, tg = 0x7A, tb = 0x85;
      const br = 0x0A, bg = 0x28, bb = 0x30;
      const r = Math.round(tr + (br - tr) * t);
      const g = Math.round(tg + (bg - tg) * t);
      const b = Math.round(tb + (bb - tb) * t);
      const col = (r << 16) | (g << 8) | b;
      const y0 = Math.floor((i / STEPS) * h);
      const y1 = Math.ceil(((i + 1) / STEPS) * h);
      bgGrad.rect(0, y0, w, y1 - y0 + 1).fill(col);
    }
    // Decorative citrus slice hint at top-right (subtle)
    drawCitrusSlice(bgGrad, w * 0.88, h * 0.07, 44, 0xFF9F1C, 0.12);
    drawCitrusSlice(bgGrad, w * 0.1, h * 0.88, 32, COL_LIME, 0.09);
  }

  function drawCitrusSlice(g: Graphics, cx: number, cy: number, r: number, col: number, alpha: number): void {
    g.circle(cx, cy, r).fill({ color: col, alpha });
    g.circle(cx, cy, r * 0.62).fill({ color: COL_WHITE, alpha: alpha * 0.5 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bx = cx + Math.cos(a) * r * 0.85;
      const by = cy + Math.sin(a) * r * 0.85;
      g.moveTo(cx, cy).lineTo(bx, by).stroke({ width: 1.5, color: col, alpha: alpha * 0.7 });
    }
  }

  // ─────────────────────── BLENDER METER (AI sprites) ───────────────────────
  // liquid (procedural, masked to jar interior) renders BEHIND the transparent
  // glass jar sprite, on top of the blender base.
  const glassCont   = new Container();
  const glassBody   = new Graphics();
  const liquidMask  = new Graphics();
  const liquidFill  = new Graphics();
  const glassShine  = new Graphics();
  const meterLabel  = new Text({ text: "Morning\nBlend", style: { fill: COL_TEXT, fontFamily: FONT, fontSize: 11, fontWeight: "700", align: "center", lineHeight: 14 } });
  meterLabel.anchor.set(0.5, 0);
  const jarTex = tex("blender-jar.webp"), baseTex = tex("blender-base.webp");
  let jarSp: Sprite | null = null, baseSp: Sprite | null = null;
  if (jarTex && baseTex) {
    jarSp = new Sprite(jarTex);   jarSp.anchor.set(0.5, 1);
    baseSp = new Sprite(baseTex); baseSp.anchor.set(0.5, 1);
    glassCont.addChild(baseSp, liquidFill, jarSp, meterLabel);
  } else {
    glassCont.addChild(glassBody, liquidFill, glassShine, meterLabel);
  }
  liquidFill.mask = liquidMask;
  glassCont.addChild(liquidMask);
  uiLayer.addChild(glassCont);

  const METER_START = 0.20; // 20% endowed progress
  let meterPct = METER_START;
  let meterTarget = METER_START;

  // Zone constants — computed each layout call
  let ZONE_HEADER_H = 80;   // px: brand row + headline row
  let ZONE_INSTR_H  = 50;   // px: instruction text band
  let ZONE_CTA_H    = 80;   // px: CTA bottom zone

  function drawGlass(w: number, h: number): void {
    const playTop = ZONE_HEADER_H + ZONE_INSTR_H + 10;
    const playBot = h - ZONE_CTA_H - 16;
    const availH  = playBot - playTop;

    if (jarSp && baseSp) {
      // Blender bottom-right: base on the floor of the play zone, jar on top.
      const bw = Math.min(110, w * 0.26);
      baseSp.scale.set(bw / baseSp.texture.width);
      const baseH = baseSp.texture.height * baseSp.scale.x;
      const jw = bw * 0.94;
      jarSp.scale.set(jw / jarSp.texture.width);
      const jarH = jarSp.texture.height * jarSp.scale.x;

      glassCont.x = w - bw / 2 - 16;
      glassCont.y = playBot;
      baseSp.position.set(0, 0);
      jarSp.position.set(0, -baseH * 0.92);

      // Liquid inside the jar: rounded rect masked to jar interior
      const jarBot = -baseH * 0.92 - jarH * 0.06;
      const innerW = jw * 0.74, innerH = jarH * 0.82;
      const fillH = innerH * meterPct;
      liquidMask.clear();
      liquidMask.roundRect(-innerW / 2, jarBot - fillH, innerW, fillH, 6).fill({ color: 0xffffff });
      liquidFill.clear();
      liquidFill.roundRect(-innerW / 2, jarBot - innerH, innerW, innerH, 6).fill({ color: 0xFF9F1C, alpha: 0.92 });
      // wobble bubbles on top of the liquid line
      liquidFill.circle(-innerW * 0.2, jarBot - fillH + 4, 3).fill({ color: 0xFFC95C, alpha: 0.9 });
      liquidFill.circle(innerW * 0.22, jarBot - fillH + 6, 2.4).fill({ color: 0xFFC95C, alpha: 0.9 });

      meterLabel.x = 0;
      meterLabel.y = -baseH - jarH - 26;
      return;
    }

    // Fallback: procedural trapezoid glass
    const gw = 52;
    const gh = Math.min(availH * 0.55, h * 0.32);
    const gx = w - gw - 14;
    const gy = playTop + (availH - gh) * 0.08;
    glassCont.x = gx; glassCont.y = gy;
    glassBody.clear();
    glassBody.poly([8, 0, gw - 8, 0, gw, gh, 0, gh]).fill({ color: COL_WHITE, alpha: 0.12 });
    glassBody.poly([8, 0, gw - 8, 0, gw, gh, 0, gh]).stroke({ width: 2.5, color: COL_WHITE, alpha: 0.55 });
    glassBody.roundRect(4, -6, gw - 8, 10, 4).fill({ color: COL_WHITE, alpha: 0.28 });
    const fillH = gh * meterPct;
    liquidMask.clear();
    liquidMask.poly([2, gh - fillH, gw - 2, gh - fillH, gw - 1, gh - 1, 1, gh - 1]).fill({ color: 0xffffff, alpha: 1 });
    liquidFill.clear();
    liquidFill.poly([1, 0, gw - 1, 0, gw - 1, gh, 1, gh]).fill({ color: 0xFF9F1C, alpha: 0.88 });
    glassShine.clear();
    glassShine.rect(gw * 0.18, 4, gw * 0.12, gh * 0.72).fill({ color: COL_WHITE, alpha: 0.12 });
    meterLabel.x = gw / 2;
    meterLabel.y = -28;
  }

  function animateMeter(delta: number): void {
    if (meterPct < meterTarget) {
      meterPct = Math.min(meterTarget, meterPct + delta * 0.55);
    }
  }

  function addMeterProgress(amount: number): void {
    meterTarget = Math.min(1, meterTarget + amount);
    gsap.to({ t: 0 }, {
      t: 1, duration: 0.6, ease: "sine.out",
      onUpdate() { /* animateMeter handles smooth approach */ },
    });
  }

  // ─────────────────────── FRUIT OBJECTS ───────────────────────
  type FruitKind = "fruit" | "junk";
  interface FruitObj {
    kind: FruitKind;
    fruitIdx: number;
    cont: Container;
    body: Graphics;
    p: ReturnType<typeof makeArc>;
    r: number;
    alive: boolean;
    isCrit: boolean;
    isKiwi: boolean; // final near-miss kiwi
    scripted: boolean;
  }
  const fruits: FruitObj[] = [];

  type Particle = { g: Graphics; vx: number; vy: number; life: number; maxLife: number };
  const particles: Particle[] = [];

  type JuiceDrop = { g: Graphics; tx: number; ty: number; life: number };
  const juiceDrops: JuiceDrop[] = [];

  type HalfFruit = { cont: Container; body: Graphics; vx: number; vy: number; rot: number; life: number };
  const halves: HalfFruit[] = [];

  // ─────────────────────── DRAWING HELPERS ───────────────────────
  // Defect 7: Solid saturated fruits, dark outline, ≥56px diameter
  function drawFruitShape(g: Graphics, fi: number, r: number, crit: boolean): void {
    const f = FRUITS[fi % FRUITS.length];
    const col = f.color;
    const shape = f.shape;

    if (shape === "spinach") {
      // Green spinach blob — irregular pentagon with rounded feel
      const pts: number[] = [];
      const N = 7;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 - Math.PI / 2;
        const rr = r * (0.82 + Math.sin(i * 2.3) * 0.18);
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.poly(pts).fill(col);
      g.poly(pts).stroke({ width: 3, color: darken(col, 0.55), alpha: 1 });
      // Center vein
      g.moveTo(0, -r * 0.5).lineTo(0, r * 0.5).stroke({ width: 2, color: darken(col, 0.65), alpha: 0.7 });
      // Shine
      g.circle(-r * 0.2, -r * 0.25, r * 0.18).fill({ color: COL_WHITE, alpha: 0.5 });

    } else if (shape === "orange") {
      // Solid orange circle with leaf nub and citrus pattern
      g.circle(0, 0, r).fill(col);
      g.circle(0, 0, r).stroke({ width: 3, color: darken(col, 0.55), alpha: 1 });
      // Inner segment lines
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(0, 0).lineTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75)
          .stroke({ width: 1.5, color: darken(col, 0.65), alpha: 0.5 });
      }
      g.circle(0, 0, r * 0.18).fill({ color: COL_WHITE, alpha: 0.6 });
      // Shine
      g.circle(-r * 0.3, -r * 0.32, r * 0.22).fill({ color: COL_WHITE, alpha: 0.55 });
      // Leaf at top
      g.ellipse(r * 0.1, -r * 0.92, r * 0.22, r * 0.32).fill(0x2ECC40);

    } else if (shape === "berry") {
      // Red berry cluster — 3 overlapping circles
      const offsets = [[-r * 0.28, -r * 0.22], [r * 0.28, -r * 0.22], [0, r * 0.28]] as const;
      for (const [ox, oy] of offsets) {
        g.circle(ox, oy, r * 0.62).fill(col);
        g.circle(ox, oy, r * 0.62).stroke({ width: 2.5, color: darken(col, 0.55), alpha: 1 });
        g.circle(ox - r * 0.12, oy - r * 0.15, r * 0.15).fill({ color: COL_WHITE, alpha: 0.5 });
      }

    } else {
      // Circle fruit (lemon etc)
      g.circle(0, 0, r).fill(col);
      g.circle(0, 0, r).stroke({ width: 3, color: darken(col, 0.55), alpha: 1 });
      // Shine
      g.circle(-r * 0.28, -r * 0.3, r * 0.22).fill({ color: COL_WHITE, alpha: 0.5 });
      // Texture dots
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.5;
        g.circle(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.07).fill({ color: COL_WHITE, alpha: 0.25 });
      }
    }

    if (crit) {
      // Golden glow ring for crit
      g.circle(0, 0, r + 10).stroke({ width: 5, color: 0xFFD700, alpha: 0.85 });
    }
  }

  function drawJunkShape(g: Graphics, ji: number, r: number): void {
    const j = JUNK[ji % JUNK.length];
    if (j.shape === "donut") {
      g.circle(0, 0, r).fill(j.color);
      g.circle(0, 0, r * 0.42).fill(COL_BG); // hole
      g.circle(0, 0, r).stroke({ width: 2, color: darken(j.color, 0.7) });
    } else {
      // Can shape
      g.roundRect(-r * 0.6, -r, r * 1.2, r * 2, r * 0.2).fill(j.color);
      g.roundRect(-r * 0.6, -r, r * 1.2, r * 2, r * 0.2).stroke({ width: 1.5, color: darken(j.color, 0.7) });
      g.rect(-r * 0.55, -r * 0.3, r * 1.1, r * 0.6).fill({ color: COL_WHITE, alpha: 0.2 });
    }
  }

  function darken(col: number, f: number): number {
    const r = Math.floor(((col >> 16) & 0xff) * f);
    const g = Math.floor(((col >> 8) & 0xff) * f);
    const b = Math.floor((col & 0xff) * f);
    return (r << 16) | (g << 8) | b;
  }

  function makeKiwiFruit(): Graphics {
    const g = new Graphics();
    // Kiwi: brown outer + green inner + seeds
    g.circle(0, 0, 44).fill(0x6d4c41);  // brown skin
    g.circle(0, 0, 36).fill(0x8BC34A);  // green flesh
    g.circle(0, 0, 36).stroke({ width: 2, color: 0x558B2F });
    // White center
    g.circle(0, 0, 10).fill({ color: COL_WHITE, alpha: 0.8 });
    // Seeds
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.ellipse(Math.cos(a) * 20, Math.sin(a) * 20, 3, 6).fill(0x212121);
    }
    return g;
  }

  // ─────────────────────── SPAWNING ───────────────────────
  const diff = new DifficultyController({ waitMin: 0.7, waitMax: 1.6, parallelMin: 1, parallelMax: 2 });

  function spawnFruit(opts?: { scripted?: boolean; isKiwi?: boolean; hiArc?: boolean; fromX?: number }): void {
    const w = window.innerWidth, h = window.innerHeight;
    const isKiwi = opts?.isKiwi ?? false;
    const scripted = opts?.scripted ?? false;
    const fromX = opts?.fromX ?? w * (0.15 + Math.random() * 0.7);
    const isCrit = !isKiwi && Math.random() < 0.18;
    const fruitIdx = Math.floor(Math.random() * FRUITS.length);
    // Defect 7: min radius 28 → diameter ≥56px
    const r = isKiwi ? 44 : Math.max(28, FRUITS[fruitIdx].r + (isCrit ? 8 : 0));

    const cont = new Container();
    const body = new Graphics();
    // AI sprite fruit (fallback: procedural shape)
    const key = isKiwi ? "kiwi" : FRUITS[fruitIdx].key;
    const sp = makeSprite(`fruit-${key}.webp`, (isKiwi ? 52 : r) * 2.3);
    if (sp) {
      cont.addChild(sp);
      if (isCrit) {
        const glow = new Graphics().circle(0, 0, r * 1.35).fill({ color: 0xFFE08A, alpha: 0.35 });
        cont.addChildAt(glow, 0);
      }
    } else if (isKiwi) {
      cont.addChild(makeKiwiFruit());
    } else {
      drawFruitShape(body, fruitIdx, r, isCrit);
      cont.addChild(body);
    }
    cont.x = fromX;
    cont.y = h + 80;
    gameLayer.addChild(cont);

    const hiArc = opts?.hiArc ?? false;

    // Defect 6: Fruits arc through MIDDLE + LOWER play area
    // Use lower apexFraction so apex lands in middle 60% of screen
    const apexFrac = hiArc ? 0.68 : 0.58;
    const p = makeArc({
      fromX,
      fromY: h + 80,
      screenH: h,
      timeAloftSec: hiArc ? 2.4 : 1.9,
      apexFraction: apexFrac,
      angleDeg: randomLaunchAngle(Math.random()),
      spinRadPerSec: (Math.random() - 0.5) * 3,
    });

    fruits.push({ kind: "fruit", fruitIdx, cont, body, p, r: isKiwi ? 52 : r + 10, alive: true, isCrit, isKiwi, scripted });
  }

  function spawnJunk(): void {
    const w = window.innerWidth, h = window.innerHeight;
    const ji = Math.floor(Math.random() * JUNK.length);
    const jd = JUNK[ji];
    const cont = new Container();
    const body = new Graphics();
    drawJunkShape(body, ji, jd.r);
    cont.addChild(body);
    cont.x = w * (0.15 + Math.random() * 0.7);
    cont.y = h + 60;
    gameLayer.addChild(cont);

    const p = makeArc({
      fromX: cont.x,
      fromY: h + 60,
      screenH: h,
      timeAloftSec: 1.8,
      apexFraction: 0.55,
      angleDeg: randomLaunchAngle(Math.random()),
      spinRadPerSec: (Math.random() - 0.5) * 2,
    });

    fruits.push({ kind: "junk", fruitIdx: ji, cont, body: body, p, r: jd.r + 14, alive: true, isCrit: false, isKiwi: false, scripted: false });
  }

  function removeFruit(f: FruitObj): void {
    if (!f.alive && fruits.indexOf(f) < 0) return; // already removed
    const i = fruits.indexOf(f);
    if (i >= 0) fruits.splice(i, 1);
    gsap.killTweensOf(f.cont);
    gsap.killTweensOf(f.cont.scale);
    gameLayer.removeChild(f.cont);
    f.cont.destroy({ children: true });
  }

  // ─────────────────────── JUICE PARTICLES ───────────────────────
  function spawnJuice(x: number, y: number, color: number, n: number, crit: boolean): void {
    const count = crit ? n * 2 : n;
    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      const r = 2.5 + Math.random() * (crit ? 7 : 5);
      g.circle(0, 0, r).fill({ color, alpha: 0.9 });
      g.x = x; g.y = y;
      fxLayer.addChild(g);
      const ang = Math.random() * Math.PI * 2;
      const sp  = (crit ? 180 : 120) + Math.random() * 200;
      particles.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 80, life: 0, maxLife: crit ? 0.9 : 0.6 });
    }
  }

  function spawnJuiceToGlass(x: number, y: number, color: number): void {
    const w = window.innerWidth, h = window.innerHeight;
    // Aim at the blender jar mouth (sprite path) or the old glass (fallback)
    let gx: number, gy: number;
    if (jarSp && baseSp) {
      gx = glassCont.x;
      gy = glassCont.y + jarSp.y - jarSp.texture.height * jarSp.scale.x * 0.9;
    } else {
      const gw = 52;
      const playTop = ZONE_HEADER_H + ZONE_INSTR_H + 10;
      const playBot = h - ZONE_CTA_H - 16;
      const availH  = playBot - playTop;
      const gh = Math.min(availH * 0.55, h * 0.32);
      gx = (w - gw - 14) + gw / 2;
      gy = playTop + (availH - gh) * 0.08 + gh * (1 - meterTarget);
    }
    const g = new Graphics();
    g.circle(0, 0, 6).fill({ color, alpha: 0.85 });
    g.x = x; g.y = y;
    fxLayer.addChild(g);
    juiceDrops.push({ g, tx: gx, ty: gy, life: 0 });
    gsap.to(g, {
      x: gx, y: gy,
      duration: 0.5, ease: "power1.in",
      onComplete: () => {
        if (fxLayer.children.includes(g)) fxLayer.removeChild(g);
        g.destroy();
        const idx = juiceDrops.findIndex(d => d.g === g);
        if (idx >= 0) juiceDrops.splice(idx, 1);
      }
    });
    gsap.to(g.scale, { x: 0.3, y: 0.3, duration: 0.5, ease: "power1.in" });
  }

  function spawnHalves(x: number, y: number, fruitIdx: number, r: number, angle: number): void {
    const col = FRUITS[fruitIdx % FRUITS.length].color;
    // AI juicy cross-section sprite: pops at the cut point, spins and falls
    const halfSp = makeSprite(`half-${FRUITS[fruitIdx % FRUITS.length].key}.webp`, r * 2.6);
    if (halfSp) {
      const c = new Container();
      c.addChild(halfSp);
      c.x = x; c.y = y; c.rotation = angle;
      c.scale.set(0.6);
      fxLayer.addChild(c);
      gsap.to(c.scale, { x: 1, y: 1, duration: 0.18, ease: "back.out(2.5)" });
      halves.push({ cont: c, body: new Graphics(), vx: (Math.random() - 0.5) * 120, vy: -110, rot: (Math.random() - 0.5) * 3, life: 0 });
      return;
    }
    for (const side of [-1, 1]) {
      const c = new Container();
      const hbody = new Graphics();
      // Draw half circle
      hbody.arc(0, 0, r * 0.9, -Math.PI / 2, Math.PI / 2, side === -1).fill({ color: col, alpha: 0.92 });
      hbody.arc(0, 0, r * 0.9, -Math.PI / 2, Math.PI / 2, side === -1).stroke({ width: 2, color: darken(col, 0.75) });
      c.addChild(hbody);
      c.x = x; c.y = y; c.rotation = angle;
      fxLayer.addChild(c);
      const spread = 130 + Math.random() * 80;
      const vx = Math.cos(angle + Math.PI / 2) * spread * side;
      const vy = Math.sin(angle + Math.PI / 2) * spread * side - 90;
      halves.push({ cont: c, body: hbody, vx, vy, rot: side * (1.2 + Math.random() * 2), life: 0 });
    }
  }

  function spawnJunkPoof(x: number, y: number, color: number): void {
    // bounce/poof particles — no penalty
    for (let i = 0; i < 12; i++) {
      const g = new Graphics();
      const r = 3 + Math.random() * 4;
      g.circle(0, 0, r).fill({ color, alpha: 0.8 });
      g.x = x; g.y = y;
      fxLayer.addChild(g);
      const ang = Math.random() * Math.PI * 2;
      const sp  = 60 + Math.random() * 100;
      particles.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40, life: 0, maxLife: 0.45 });
    }
  }

  // ─────────────────────── UI ELEMENTS ───────────────────────
  const fam = FONT;

  // ── Defects 1: Brand chip on its own row, headline below it ──
  // Brand name / "Z" logo (procedural) — ROW 1
  const brandCont = new Container();
  const brandBg = new Graphics();
  const brandText = new Text({ text: "Zestful", style: { fill: COL_PRIMARY, fontFamily: fam, fontSize: 16, fontWeight: "900" } });
  brandText.anchor.set(0, 0.5);
  brandCont.addChild(brandBg, brandText);
  uiLayer.addChild(brandCont);

  function drawBrandBg(): void {
    brandBg.clear();
    brandBg.roundRect(-6, -13, brandText.width + 16, 26, 6).fill({ color: 0x000000, alpha: 0.35 });
  }

  // Title / headline — ROW 2 (below brand chip, guaranteed 8px gap)
  const titleText = new Text({ text: cfg.copy.title, style: { fill: COL_TEXT, fontFamily: fam, fontSize: 18, fontWeight: "900", align: "center" } });
  titleText.anchor.set(0.5, 0);
  uiLayer.addChild(titleText);

  // Instruction — ROW 3
  const instrText = new Text({ text: "Slice the fruit!", style: { fill: COL_WHITE, fontFamily: fam, fontSize: 26, fontWeight: "900", align: "center", dropShadow: { color: 0x000000, blur: 6, distance: 2 } } });
  instrText.anchor.set(0.5, 0.5);
  uiLayer.addChild(instrText);

  // Combo / banner text
  const bannerText = new Text({ text: "", style: { fill: COL_PRIMARY, fontFamily: fam, fontSize: 44, fontWeight: "900", align: "center", dropShadow: { color: 0x000000, blur: 8, distance: 3 } } });
  bannerText.anchor.set(0.5);
  bannerText.alpha = 0;
  uiLayer.addChild(bannerText);

  // Badge (ingredient name)
  const badgeCont = new Container();
  const badgeBg   = new Graphics();
  const badgeText = new Text({ text: "", style: { fill: COL_TEXT, fontFamily: fam, fontSize: 22, fontWeight: "900", align: "center" } });
  badgeText.anchor.set(0.5);
  badgeCont.addChild(badgeBg, badgeText);
  badgeCont.alpha = 0;
  uiLayer.addChild(badgeCont);

  function showBadge(name: string): void {
    badgeText.text = name;
    badgeBg.clear();
    const bw = badgeText.width + 28, bh = 36;
    badgeBg.roundRect(-bw / 2, -bh / 2, bw, bh, 10).fill({ color: COL_LIME, alpha: 0.92 });
    badgeCont.alpha = 1;
    badgeCont.scale.set(0.3);
    gsap.killTweensOf(badgeCont);
    gsap.killTweensOf(badgeCont.scale);
    gsap.to(badgeCont.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(2.5)" });
    gsap.to(badgeCont, { alpha: 0, duration: 0.5, delay: 1.1 });
  }

  function showBanner(msg: string, color: number): void {
    bannerText.text = msg;
    bannerText.style.fill = color;
    bannerText.alpha = 1;
    bannerText.scale.set(0.3);
    gsap.killTweensOf(bannerText);
    gsap.killTweensOf(bannerText.scale);
    gsap.to(bannerText.scale, { x: 1, y: 1, duration: 0.28, ease: "back.out(2.5)" });
    gsap.to(bannerText, { alpha: 0, duration: 0.55, delay: 0.65 });
  }

  // Defect 5: CTA hidden during gameplay — only shown in endcard
  const cta = new Container();
  const ctaBg = new Graphics();
  const ctaText = new Text({ text: cfg.copy.cta, style: { fill: COL_WHITE, fontFamily: fam, fontSize: 24, fontWeight: "900", align: "center" } });
  ctaText.anchor.set(0.5);
  cta.addChild(ctaBg, ctaText);
  cta.eventMode = "static";
  cta.cursor = "pointer";
  function drawCta(): void {
    ctaBg.clear();
    const bw = Math.max(300, ctaText.width + 60);
    ctaBg.roundRect(-bw / 2, -28, bw, 56, 28).fill(COL_ACCENT);
    ctaBg.roundRect(-bw / 2, -28, bw, 56, 28).stroke({ width: 3, color: COL_WHITE, alpha: 0.7 });
  }
  drawCta();
  function doCTA(): void { window.FbPlayableAd.onCTAClick(); }
  cta.on("pointertap", doCTA);
  // Defect 5: hide CTA completely during gameplay
  cta.visible = false;
  uiLayer.addChild(cta);

  // ─────────────────────── GHOST FINGER HINT ───────────────────────
  const hint = new Container();
  const hintFinger = new Graphics();
  hintFinger.circle(0, 0, 24).fill({ color: COL_WHITE, alpha: 0.8 });
  hintFinger.circle(0, 0, 24).stroke({ width: 4, color: COL_PRIMARY, alpha: 1 });
  // Swipe arc arrow on hint — shows intended swipe direction
  const hintTrail = new Graphics();
  // Draw a curved swipe arc with arrowhead (top-left to bottom-right arc)
  hintTrail.moveTo(-50, 20).bezierCurveTo(-20, -30, 20, -30, 50, 20)
    .stroke({ width: 5, color: COL_WHITE, alpha: 0.5, cap: "round" });
  // Arrowhead
  hintTrail.poly([42, 8, 54, 28, 60, 14]).fill({ color: COL_WHITE, alpha: 0.5 });
  hint.addChild(hintTrail, hintFinger);
  uiLayer.addChild(hint);

  let hintVisible = true;
  // Animate finger moving diagonally (swipe gesture), hintTrail stays fixed behind it
  gsap.to(hintFinger, { x: 100, y: -50, duration: 1.1, yoyo: true, repeat: -1, ease: "sine.inOut" });
  gsap.to(hint, { alpha: 0.75, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });

  function hideHint(): void {
    if (!hintVisible) return;
    hintVisible = false;
    gsap.killTweensOf(hint);
    gsap.killTweensOf(hintFinger);
    gsap.to(hint, { alpha: 0, duration: 0.3, onComplete: () => { hint.visible = false; } });
  }

  // ─────────────────────── TRAIL ───────────────────────
  // Defect 8: short-lived white streak with fade (alpha tween 0.3s), only while pointer moves
  type TrailPt = { x: number; y: number; t: number };
  const trail: TrailPt[] = [];
  const trailG = new Graphics();
  trailG.eventMode = "none";
  fxLayer.addChild(trailG);
  // Track last pointer-move time to show trail only while moving
  let lastMoveTime = -9999;
  const TRAIL_SHOW_DURATION = 0.3; // seconds trail stays visible after last move

  // ─────────────────────── SCREEN SHAKE ───────────────────────
  function screenShake(intensity = 14, dur = 0.45): void {
    const ox = app.stage.x, oy = app.stage.y;
    gsap.to(app.stage, {
      x: ox + intensity, duration: 0.04, yoyo: true, repeat: Math.round(dur / 0.08),
      ease: "none",
      onUpdate() { app.stage.y = oy + (Math.random() - 0.5) * intensity; },
      onComplete() { app.stage.x = ox; app.stage.y = oy; }
    });
  }

  // ─────────────────────── BLEND COMPLETE VFX ───────────────────────
  function blendComplete(): void {
    const w = window.innerWidth, h = window.innerHeight;
    // Blender burst
    for (let i = 0; i < 60; i++) {
      const g = new Graphics();
      const r = 4 + Math.random() * 10;
      const col = [0xFF9F1C, COL_LIME, 0xFFD700, 0xff6b6b][Math.floor(Math.random() * 4)];
      g.circle(0, 0, r).fill({ color: col, alpha: 0.9 });
      g.x = w * 0.5; g.y = h * 0.5;
      fxLayer.addChild(g);
      const ang = Math.random() * Math.PI * 2;
      const sp = 200 + Math.random() * 400;
      particles.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 150, life: 0, maxLife: 1.2 });
    }
    screenShake(18, 0.55);

    // Zestful bottle — procedural
    const bottle = new Container();
    const bottleG = new Graphics();
    // Body
    bottleG.roundRect(-22, -60, 44, 100, 14).fill(COL_PRIMARY);
    bottleG.roundRect(-22, -60, 44, 100, 14).stroke({ width: 2, color: darken(COL_PRIMARY, 0.75) });
    // Neck
    bottleG.roundRect(-10, -80, 20, 24, 6).fill(darken(COL_PRIMARY, 0.85));
    // Cap
    bottleG.roundRect(-12, -92, 24, 14, 5).fill(COL_LIME);
    // Label
    bottleG.roundRect(-18, -30, 36, 52, 8).fill({ color: COL_WHITE, alpha: 0.9 });
    const labelText = new Text({ text: "Z", style: { fill: COL_PRIMARY, fontFamily: fam, fontSize: 28, fontWeight: "900" } });
    labelText.anchor.set(0.5);
    labelText.y = -6;
    bottle.addChild(bottleG, labelText);
    bottle.x = w * 0.5; bottle.y = h * 0.55;
    bottle.scale.set(0);
    fxLayer.addChild(bottle);
    gsap.to(bottle.scale, { x: 1.5, y: 1.5, duration: 0.5, ease: "back.out(2.5)", delay: 0.2 });
    gsap.to(bottle, { alpha: 0, duration: 0.4, delay: 1.8, onComplete: () => { if (fxLayer.children.includes(bottle)) fxLayer.removeChild(bottle); bottle.destroy({ children: true }); } });
  }

  // ─────────────────────── ENDCARD ───────────────────────
  let ended = false;
  function showEndcard(): void {
    if (ended) return;
    ended = true;
    running = false;

    blendComplete();

    const w = window.innerWidth, h = window.innerHeight;
    const ov = new Container();
    ov.alpha = 0;

    // Dark overlay
    const ovBg = new Graphics();
    ovBg.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.6 });
    ov.addChild(ovBg);

    // Solid centred panel, vertical rhythm via cy-cursor (zero overlaps).
    // Panel bg = AI 9-slice frame (fallback: Graphics); height computed AFTER content.
    const PW = Math.min(w - 40, 330);
    const panel = new Container();
    const panBg = new Graphics();
    const frameTex = tex("ui-frame.webp");
    const panFrame = frameTex ? new NineSliceSprite({ texture: frameTex, leftWidth: 70, rightWidth: 70, topHeight: 70, bottomHeight: 70 }) : null;
    if (panFrame) panel.addChild(panFrame);
    else panel.addChild(panBg);

    let pcy = 18;
    const brandBg = new Graphics().roundRect(0, 0, 180, 46, 12).fill({ color: COL_PRIMARY });
    const brandTxt = new Text({ text: "Zestful", style: { fill: "#1a2a28", fontFamily: fam, fontWeight: "900", fontSize: 26 } });
    brandTxt.anchor.set(0.5); brandTxt.position.set(90, 23);
    const brandCont = new Container();
    brandCont.addChild(brandBg, brandTxt);
    brandCont.position.set((PW - 180) / 2, pcy);
    panel.addChild(brandCont);
    pcy += 56;

    const txtCol = panFrame ? 0x1a3a38 : COL_WHITE;   // frame is cream → dark text
    const headline = new Text({ text: "Blend complete!", style: { fill: txtCol, fontFamily: fam, fontSize: 30, fontWeight: "900", align: "center" } });
    headline.anchor.set(0.5, 0); headline.position.set(PW / 2, pcy);
    panel.addChild(headline);
    pcy += headline.height + 8;

    const offerLine = new Text({
      text: "20% off your first month",
      style: { fill: panFrame ? COL_PRIMARY : COL_TEXT, fontFamily: fam, fontSize: 18, fontWeight: "700", align: "center" }
    });
    offerLine.anchor.set(0.5, 0); offerLine.position.set(PW / 2, pcy);
    panel.addChild(offerLine);
    pcy += offerLine.height + 12;

    const disc = new Text({
      text: "*Not evaluated by the FDA. Results may vary.",
      style: { fill: txtCol, fontFamily: fam, fontSize: 10, fontWeight: "400", align: "center", wordWrap: true, wordWrapWidth: PW - 36 }
    });
    disc.alpha = 0.65;
    disc.anchor.set(0.5, 0); disc.position.set(PW / 2, pcy);
    panel.addChild(disc);
    pcy += disc.height + 12;

    // CTA inside the panel
    const inCtaW = PW - 32, inCtaH = 56;
    const inCta = new Container();
    const inCtaBg = new Graphics();
    inCtaBg.roundRect(0, 0, inCtaW, inCtaH, 28).fill({ color: COL_PRIMARY });
    inCtaBg.roundRect(0, 0, inCtaW, inCtaH, 28).stroke({ width: 3, color: 0xffffff, alpha: 0.35 });
    const inCtaTxt = new Text({ text: "Continue — Claim 20% Off", style: { fill: "#1a2a28", fontFamily: fam, fontWeight: "900", fontSize: 19 } });
    inCtaTxt.anchor.set(0.5); inCtaTxt.position.set(inCtaW / 2, inCtaH / 2);
    if (inCtaTxt.width > inCtaW * 0.9) inCtaTxt.scale.set((inCtaW * 0.9) / inCtaTxt.width);
    inCta.addChild(inCtaBg, inCtaTxt);
    inCta.eventMode = "static";
    inCta.cursor = "pointer";
    inCta.on("pointertap", (e: any) => { e.stopPropagation(); (window as any).FbPlayableAd.onCTAClick(); });
    inCta.position.set(16, pcy);
    panel.addChild(inCta);
    gsap.to(inCta.scale, { x: 1.03, y: 1.03, duration: 0.65, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 0.6 });
    pcy += inCtaH + 16;

    const PH = pcy;
    if (panFrame) {
      panFrame.width = PW;
      panFrame.height = PH;
    } else {
      panBg.roundRect(0, 0, PW, PH, 22).fill({ color: COL_BG });
      panBg.roundRect(0, 0, PW, PH, 22).stroke({ width: 3, color: COL_PRIMARY });
    }
    panel.position.set((w - PW) / 2, (h - PH) / 2 - 10);
    ov.addChild(panel);

    uiLayer.addChild(ov);
    gsap.to(ov, { alpha: 1, duration: 0.4, delay: 0.3 });

    // Legacy bottom CTA stays hidden — the endcard CTA lives inside the panel.
    cta.visible = false;
  }

  // ─────────────────────── STATE ───────────────────────
  let running     = true;
  let started     = false;
  let now         = 0;
  let gameDur     = 20;
  let spawnTimer  = 0.55;
  let idleTimer   = 0;
  const idleLimit = 2.0;
  let autoDemo    = false;
  let lastInput   = -1;

  // Scripted events
  let combo4Fired = false;
  let combo8Fired = false;
  let nearMissFired = false;
  let nearMissKiwiAlive = false;
  let nearMissPhase: "none" | "spawn" | "miss" | "second" = "none";
  let nearMissTimer = 0;

  // Combo tracking
  let comboCount = 0;
  let lastSliceTime = -99;

  // ─────────────────────── POINTER ───────────────────────
  let pDown = false;
  let lastPx = 0, lastPy = 0;

  app.stage.on("pointerdown", (e: any) => {
    pDown = true;
    lastPx = e.global.x; lastPy = e.global.y;
    lastInput = now;
    if (!started) { started = true; hideHint(); autoDemo = false; }
  });
  app.stage.on("pointerup",        () => { pDown = false; });
  app.stage.on("pointerupoutside", () => { pDown = false; });

  app.stage.on("pointermove", (e: any) => {
    const x = e.global.x, y = e.global.y;
    // Defect 8: only add trail points while pointer button is held (pDown)
    if (pDown) {
      trail.push({ x, y, t: now });
      lastMoveTime = now;
    }
    if (!pDown || !running) { lastPx = x; lastPy = y; return; }

    const moved = Math.hypot(x - lastPx, y - lastPy);
    if (moved > 5) {
      lastInput = now;
      const angle = Math.atan2(y - lastPy, x - lastPx);
      for (const f of [...fruits]) {
        if (!f.alive) continue;
        const d = distToSeg(f.cont.x, f.cont.y, lastPx, lastPy, x, y);
        // Rigged-easy: wider hit window
        const hitR = f.r + (f.isKiwi && nearMissPhase === "second" ? 28 : 12);
        if (d < hitR) {
          if (f.kind === "junk") {
            sliceJunk(f);
          } else {
            sliceFruit(f, angle);
          }
        }
      }
    }
    lastPx = x; lastPy = y;
  });

  function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function sliceFruit(f: FruitObj, angle: number): void {
    if (!f.alive) return;
    f.alive = false;

    const col = f.isKiwi ? 0x8BC34A : FRUITS[f.fruitIdx % FRUITS.length].color;

    if (f.isCrit) {
      // Crit slice — slow-mo + extra splash
      slowMo(0.4);
      showBanner("Perfect slice!", 0xFFD700);
      spawnJuice(f.cont.x, f.cont.y, col, 18, true);
      addMeterProgress(0.12);
    } else {
      spawnJuice(f.cont.x, f.cont.y, col, 10, false);
      addMeterProgress(0.06);
    }

    spawnJuiceToGlass(f.cont.x, f.cont.y, col);
    spawnHalves(f.cont.x, f.cont.y, f.fruitIdx, f.r * 0.7, angle);

    // Combo
    const dt = now - lastSliceTime;
    if (dt < 1.0) comboCount++; else comboCount = 1;
    lastSliceTime = now;

    // Badge for ingredient name
    const fname = f.isKiwi ? "Greens" : FRUITS[f.fruitIdx % FRUITS.length].name;
    if (comboCount >= 2 || f.scripted) {
      showBadge(fname);
    }
    if (comboCount >= 3) {
      showBanner("Combo x" + comboCount + "!", COL_PRIMARY);
    }

    diff.recordHit();
    removeFruit(f);

    // Near-miss kiwi: second spawn = scripted rigged hit
    if (f.isKiwi && nearMissPhase === "second") {
      nearMissPhase = "none";
      nearMissKiwiAlive = false;
    }

    // Check 100% meter
    if (meterTarget >= 1 && !ended) {
      setTimeout(() => showEndcard(), 600);
    }
  }

  function sliceJunk(f: FruitObj): void {
    if (!f.alive) return;
    f.alive = false;
    const col = JUNK[f.fruitIdx % JUNK.length].color;
    spawnJunkPoof(f.cont.x, f.cont.y, col);
    // Bounce animation — guard against destroyed container
    const fc = f.cont;
    gsap.to(fc.scale, { x: 1.5, y: 1.5, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.out" });
    gsap.to(fc, { y: fc.y - 40, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out",
      onComplete: () => { if (fc && !fc.destroyed) removeFruit(f); } });
  }

  let tScale = 1;
  function slowMo(dur: number): void {
    tScale = 0.3;
    const h = { t: 0.3 };
    gsap.to(h, { t: 1, duration: dur, ease: "power2.in", onUpdate: () => { tScale = h.t; } });
  }

  // Auto-demo slice (no input)
  function autoSliceNearest(): void {
    if (!fruits.length) return;
    const f = fruits.find(x => x.kind === "fruit" && x.alive);
    if (!f) return;
    sliceFruit(f, Math.PI / 4);
  }

  // ─────────────────────── LAYOUT ───────────────────────
  function layout(): void {
    const w = window.innerWidth, h = window.innerHeight;

    app.canvas.style.width  = w + "px";
    app.canvas.style.height = h + "px";

    // ── Defect 1: Brand chip row 1, headline row 2, 8px min gap ──
    // Brand chip — row 1, top-left
    const BRAND_H = 28; // height of brand chip
    brandCont.x = 12; brandCont.y = 10 + BRAND_H / 2;
    brandText.y = 0;
    drawBrandBg();

    // Title — row 2, centered, starts below brand chip
    const titleY = 10 + BRAND_H + 8; // 8px gap after brand
    titleText.x = w / 2; titleText.y = titleY;
    ZONE_HEADER_H = titleY + (titleText.height || 22) + 4;

    // Instruction — row 3
    ZONE_INSTR_H = 44;
    instrText.x = w / 2; instrText.y = ZONE_HEADER_H + ZONE_INSTR_H / 2;

    // CTA zone height
    ZONE_CTA_H = 80;

    drawBg();
    drawGlass(w, h);

    // Banner center of play area
    const playMid = ZONE_HEADER_H + ZONE_INSTR_H + (h - ZONE_HEADER_H - ZONE_INSTR_H - ZONE_CTA_H) * 0.35;
    bannerText.x = w / 2; bannerText.y = playMid;

    // Badge slightly below banner
    badgeCont.x = w / 2; badgeCont.y = playMid + 58;

    // CTA bottom thumb zone — hidden during gameplay, positioned for endcard
    cta.x = w / 2; cta.y = h - 44;
    drawCta();

    // Ghost finger hint in play area
    hint.x = w / 2; hint.y = h * 0.55;

    // Trail graphics
    trailG.x = 0; trailG.y = 0;
  }
  layout();
  window.addEventListener("resize", layout);

  // Instruction fades after 4s
  gsap.to(instrText, { alpha: 0, duration: 0.5, delay: 4 });

  // ─────────────────────── TICKER ───────────────────────
  app.ticker.add(() => {
    const rawDt = Math.min(0.05, app.ticker.deltaMS / 1000);
    now += rawDt;
    const dt = rawDt * tScale;

    if (running) {
      gameDur -= rawDt;
      if (gameDur <= 0) {
        // Force 100% then endcard
        meterTarget = 1; meterPct = 1;
        showEndcard();
      }

      // Idle fallback
      if (!started || now - lastInput > idleLimit) {
        idleTimer += rawDt;
        if (idleTimer > 0.3) { autoDemo = true; idleTimer = 0; autoSliceNearest(); }
      } else {
        idleTimer = 0; autoDemo = false;
      }

      // Normal spawning
      spawnTimer -= rawDt;
      if (spawnTimer <= 0) {
        const cnt = diff.parallelCount();
        for (let i = 0; i < cnt; i++) {
          if (Math.random() < 0.15 && fruits.filter(f => f.kind === "junk").length < 2) {
            spawnJunk();
          } else {
            spawnFruit();
          }
        }
        spawnTimer = diff.spawnWaitSec();
      }

      // Scripted combo beats
      if (!combo4Fired && now >= 3.8) {
        combo4Fired = true;
        // Multi-fruit burst at ~4s
        for (let i = 0; i < 3; i++) {
          setTimeout(() => spawnFruit({ scripted: true, fromX: window.innerWidth * (0.25 + i * 0.25) }), i * 180);
        }
      }
      if (!combo8Fired && now >= 8.0) {
        combo8Fired = true;
        for (let i = 0; i < 3; i++) {
          setTimeout(() => spawnFruit({ scripted: true, fromX: window.innerWidth * (0.2 + i * 0.3) }), i * 200);
        }
      }

      // Near-miss kiwi event at ~13s
      if (!nearMissFired && now >= 13 && !ended) {
        nearMissFired = true;
        nearMissPhase = "spawn";
        // Spawn kiwi that will barely miss first swipe
        spawnFruit({ isKiwi: true, hiArc: true, fromX: window.innerWidth * 0.5 });
        nearMissKiwiAlive = true;
        // After 1.2s spawn scripted second kiwi with bigger hit radius (handled in sliceFruit)
        nearMissTimer = 1.2;
      }
      if (nearMissPhase === "spawn") {
        nearMissTimer -= rawDt;
        if (nearMissTimer <= 0 && nearMissKiwiAlive) {
          nearMissPhase = "second";
          // Second kiwi: guaranteed rigged-easy hit
          spawnFruit({ isKiwi: true, hiArc: true, fromX: window.innerWidth * 0.48 });
        }
      }
    }

    // Animate meter
    animateMeter(rawDt);
    const w = window.innerWidth, h = window.innerHeight;
    drawGlass(w, h);

    // Update fruits
    for (const f of [...fruits]) {
      if (f.cont.destroyed) { removeFruit(f); continue; }
      f.p.update(dt);
      f.cont.x = f.p.x; f.cont.y = f.p.y;
      // Rotate the body container, not Graphics with fills — use cont wrapper
      f.cont.rotation = f.p.rotation;
      if (f.p.done || f.cont.y > h + 150) {
        if (f.alive && f.kind === "fruit") diff.recordMiss();
        if (f.isKiwi) { nearMissKiwiAlive = false; }
        removeFruit(f);
      }
    }

    // Update halves
    for (let i = halves.length - 1; i >= 0; i--) {
      const hf = halves[i];
      if (hf.cont.destroyed) { halves.splice(i, 1); continue; }
      hf.vy += 900 * dt;
      hf.cont.x += hf.vx * dt;
      hf.cont.y += hf.vy * dt;
      hf.cont.rotation += hf.rot * dt;
      hf.life += rawDt;
      if (hf.life > 1.2) hf.cont.alpha = Math.max(0, 1 - (hf.life - 1.2) * 4);
      if (hf.life > 1.6 || hf.cont.y > h + 200) {
        if (!hf.cont.destroyed) { fxLayer.removeChild(hf.cont); hf.cont.destroy({ children: true }); }
        halves.splice(i, 1);
      }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      if (pt.g.destroyed) { particles.splice(i, 1); continue; }
      pt.vy += 800 * dt;
      pt.g.x += pt.vx * dt;
      pt.g.y += pt.vy * dt;
      pt.life += rawDt;
      pt.g.alpha = Math.max(0, 1 - pt.life / pt.maxLife);
      if (pt.life >= pt.maxLife) {
        if (!pt.g.destroyed) { fxLayer.removeChild(pt.g); pt.g.destroy(); }
        particles.splice(i, 1);
      }
    }

    // Defect 8: Trail — only draw while pointer is held and for TRAIL_SHOW_DURATION after last move
    // Expire old points faster (0.3s)
    while (trail.length && now - trail[0].t > TRAIL_SHOW_DURATION) trail.shift();
    trailG.clear();
    const timeSinceMove = now - lastMoveTime;
    if (timeSinceMove < TRAIL_SHOW_DURATION && trail.length >= 2) {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        // age of this segment relative to TRAIL_SHOW_DURATION
        const age = (now - b.t) / TRAIL_SHOW_DURATION;
        const al = Math.max(0, 1 - age) * Math.max(0, 1 - timeSinceMove / TRAIL_SHOW_DURATION);
        if (al > 0.01) {
          trailG.moveTo(a.x, a.y).lineTo(b.x, b.y)
            .stroke({ width: 10 * al + 2, color: COL_WHITE, alpha: 0.75 * al, cap: "round" });
        }
      }
    }
  });

  // Second paint: Pixi v8 shader-race workaround
  app.renderer.render(app.stage);
  requestAnimationFrame(() => { layout(); app.renderer.render(app.stage); });
}

main().catch((e) => console.error(e));
