// Dream Kitchen — Three Picks
// Quiz-picker 3-step kitchen configurator (PixiJS v8 + GSAP).
// Step 1: Kitchen Style (Modern / Farmhouse) — crossfade between full-frame sprites
// Step 2: Countertop (Quartz / Marble) — tinted overlay on countertop band
// Step 3: Backsplash (Herringbone / Subway) — tinted overlay on backsplash band
// Reveal: zoom-out + warm light wash + floating dust particles
// Endcard: composed final scene + CTA
import { Application, Container, Graphics, Text, Texture, Sprite } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// ── Tunables ─────────────────────────────────────────────────────────────────
const IDLE_HINT = Number(cfg.params.idleHintMs ?? 2500);
const AUTO_DEMO_AFTER = Number(cfg.params.autoDemoAfterIdles ?? 2);
const STEP = Number(cfg.params.stepAnimMs ?? 450) / 1000;
const REVEAL_HOLD = Number(cfg.params.revealHoldMs ?? 2200) / 1000;
const WIPE_SPEED = Number(cfg.params.wipeSpeedMs ?? 1200) / 1000;
void STEP;

// ── Color helpers ─────────────────────────────────────────────────────────────
function num(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}
function shade(c: number, f: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const t = f > 0 ? 255 : 0, a = Math.abs(f);
  return (
    (Math.round(r + (t - r) * a) << 16) |
    (Math.round(g + (t - g) * a) << 8) |
    Math.round(b + (t - b) * a)
  );
}

const PRIMARY = num(cfg.style.colors.primary);
const ACCENT = num(cfg.style.colors.accent);
const TXT = cfg.style.colors.text;
const FONT = cfg.style.font.family;

// ── Design canvas — portrait 9:16 ─────────────────────────────────────────────
const DW = 540, DH = 960;

// The kitchen scene occupies the top ~83% (y 0..800); bottom ~17% = swatch zone.
const KITCHEN_H = 800;
const SWATCH_ZONE_Y = KITCHEN_H; // 800

// ── Art-measured band fractions (from visual inspection of the webp sprites) ──
// These fractions describe where the countertop and backsplash sit in the sprite.
// kitchen-modern / kitchen-farmhouse share the same camera.
//   backsplash: from just below upper-cabinet bottoms to top of countertop
//     → approx 0.27 .. 0.44 of image height
//   countertop: the thin horizontal band
//     → approx 0.44 .. 0.48 of image height
const SPLASH_Y_FRAC  = 0.27;
const SPLASH_H_FRAC  = 0.17;   // 0.44 - 0.27
const COUNTER_Y_FRAC = 0.44;
const COUNTER_H_FRAC = 0.055;  // 0.44..0.495

// ── Texture store ─────────────────────────────────────────────────────────────
const TEX: Record<string, Texture> = {};

async function preloadTextures(): Promise<void> {
  await Promise.all(
    Object.entries(cfg.assets).map(async ([k, uri]) => {
      if (!/\.(webp|png)$/i.test(k)) return;
      const img = new Image();
      img.src = uri as string;
      try { await img.decode(); } catch { return; }
      TEX[k] = Texture.from(img);
    }),
  );
}

function tex(key: string): Texture | null {
  return TEX[key] ?? null;
}

// ── Kitchen palette per combination (fallback only) ───────────────────────────
interface KitchenPalette {
  wall: number; cabinet: number; cabinetDark: number; cabinetLight: number;
  counter: number; counterVein: number; floor: number;
}

function kitchenPalette(styleIdx: number, ctIdx: number): KitchenPalette {
  const isModern = styleIdx === 0;
  const isQuartz = ctIdx === 0;
  return {
    wall:         isModern ? num("#E8E4E0") : num("#F2ECE0"),
    cabinet:      isModern ? num("#2E2E2E") : num("#E8E0D0"),
    cabinetDark:  isModern ? num("#1A1A1A") : num("#D4C8B0"),
    cabinetLight: isModern ? num("#3D3D3D") : num("#F0EAD8"),
    counter:      isQuartz
                    ? (isModern ? num("#F0EEEC") : num("#F5EDE0"))
                    : (isModern ? num("#C8B8A8") : num("#D4C4A8")),
    counterVein:  isQuartz
                    ? (isModern ? num("#C8C4C0") : num("#D8C8B0"))
                    : (isModern ? num("#8A7060") : num("#A08060")),
    floor:        isModern ? num("#C8B89A") : num("#B8A880"),
  };
}

function tileColors(tileIdx: number, styleIdx: number): [number, number] {
  const isModern = styleIdx === 0;
  if (tileIdx === 0) {
    return isModern ? [num("#F5F0EB"), num("#E0D8D0")] : [num("#E8DDD0"), num("#D4C8B8")];
  }
  return isModern ? [num("#F8F6F4"), num("#D8D0C8")] : [num("#F0E8DC"), num("#C8B8A4")];
}

// ── Step / archetype labels ───────────────────────────────────────────────────
const STYLE_NAMES  = ["Modern", "Farmhouse"];
const CT_NAMES     = ["Quartz", "Marble"];
const TILE_NAMES   = ["Herringbone", "Subway"];
const ARCHETYPES: string[][][] = [
  [["The Modern Purist",    "The Clean Liner"      ], ["The Stone Modernist", "The Urban Minimalist"]],
  [["The Cottage Dreamer",  "The Classic Homemaker"], ["The Rustic Romantic",  "The Warm Traditionalist"]],
];

type State = "hook" | "step1" | "step2" | "step3" | "reveal" | "end";

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width:      window.innerWidth,
    height:     window.innerHeight,
    background: num(cfg.style.colors.background),
    antialias:  false,
    preference: "webgl",
    resolution: 1,
    autoDensity: false,
  });
  app.canvas.style.width  = window.innerWidth  + "px";
  app.canvas.style.height = window.innerHeight + "px";
  document.body.appendChild(app.canvas);

  // ── Preload textures ──────────────────────────────────────────────────────
  await preloadTextures();

  // ── Layers ────────────────────────────────────────────────────────────────
  const root    = new Container();
  app.stage.addChild(root);
  const bgLayer      = new Container();   // bg/wipe effects
  const kitchenLayer = new Container();   // main kitchen scene
  const fxLayer      = new Container();   // sparkles / shimmer overlays
  const uiLayer      = new Container();   // HUD progress bar + step label (top)
  const swatchLayer  = new Container();   // swatch cards (bottom zone)
  const overlayLayer = new Container();   // reveal banner + endcard
  root.addChild(bgLayer, kitchenLayer, fxLayer, uiLayer, swatchLayer, overlayLayer);

  // ── Pointer setup — stage owns all input ─────────────────────────────────
  app.stage.eventMode = "static";
  app.stage.hitArea   = app.screen;
  kitchenLayer.interactiveChildren = false;
  bgLayer.interactiveChildren      = false;

  // ── State ────────────────────────────────────────────────────────────────
  let state: State = "hook";
  let busy         = false;
  let idleAccum    = 0;
  let idleCount    = 0;
  let pickStyle    = 0;
  let pickCt       = 0;
  let pickTile     = 0;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fit(t: Text, maxW: number): void {
    t.scale.set(1);
    if (t.width > maxW) t.scale.set(maxW / t.width);
  }

  function sparkle(x: number, y: number, n = 8): void {
    for (let i = 0; i < n; i++) {
      const g = new Graphics().circle(0, 0, 3 + Math.random() * 5).fill({ color: PRIMARY, alpha: 0.9 });
      const angle = (Math.PI * 2 * i) / n;
      const dist  = 28 + Math.random() * 22;
      g.position.set(x, y);
      fxLayer.addChild(g);
      gsap.to(g, {
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 0.5 + Math.random() * 0.2,
        ease: "power1.out",
        onComplete: () => { fxLayer.removeChild(g); g.destroy(); },
      });
    }
  }

  function shimmerBand(bandY: number, bandH: number): void {
    const shine = new Graphics().rect(0, bandY, 60, bandH).fill({ color: 0xffffff, alpha: 0.38 });
    shine.position.set(-70, 0);
    fxLayer.addChild(shine);
    gsap.to(shine, {
      x: DW + 70, duration: 0.6, ease: "power1.inOut",
      onComplete: () => { fxLayer.removeChild(shine); shine.destroy(); },
    });
  }

  // ── Sprite helpers ────────────────────────────────────────────────────────
  // Cover-fit a texture into rect (w × h), centred.
  function makeCoverSprite(texture: Texture, w: number, h: number): Sprite {
    const sp = new Sprite(texture);
    sp.anchor.set(0.5);
    const scaleX = w / texture.width;
    const scaleY = h / texture.height;
    const s = Math.max(scaleX, scaleY);
    sp.scale.set(s);
    sp.position.set(w / 2, h / 2);
    return sp;
  }

  // ── Kitchen sprite layer — two cover sprites stacked, crossfade by alpha ──
  // This container always sits at 0,0 and occupies DW × KITCHEN_H.
  const kitchenSpriteCont = new Container();
  kitchenLayer.addChild(kitchenSpriteCont);

  // Mask to clip sprites to kitchen zone (no bleed into swatch strip)
  const kitchenMask = new Graphics().rect(0, 0, DW, KITCHEN_H).fill({ color: 0xffffff });
  kitchenSpriteCont.addChild(kitchenMask);
  kitchenSpriteCont.mask = kitchenMask;

  // Build the two base sprites (or procedural fallbacks)
  const tModern    = tex("kitchen-modern.webp");
  const tFarmhouse = tex("kitchen-farmhouse.webp");

  let sprModern: Sprite | null = null;
  let sprFarmhouse: Sprite | null = null;

  if (tModern) {
    sprModern = makeCoverSprite(tModern, DW, KITCHEN_H);
    sprModern.alpha = 1;
    kitchenSpriteCont.addChild(sprModern);
  }
  if (tFarmhouse) {
    sprFarmhouse = makeCoverSprite(tFarmhouse, DW, KITCHEN_H);
    sprFarmhouse.alpha = 0;
    kitchenSpriteCont.addChild(sprFarmhouse);
  }

  // Active style index for sprite crossfade
  let activeStyle = 0; // 0 = modern visible, 1 = farmhouse visible

  function crossfadeToStyle(targetIdx: number, duration = 0.5, onDone?: () => void): void {
    if (targetIdx === activeStyle) { onDone?.(); return; }
    activeStyle = targetIdx;
    if (targetIdx === 0) {
      // Fade farmhouse out → modern shows
      gsap.to(sprFarmhouse, { alpha: 0, duration, ease: "power2.inOut", onComplete: onDone });
    } else {
      // Fade farmhouse in over modern
      gsap.to(sprFarmhouse, { alpha: 1, duration, ease: "power2.inOut", onComplete: onDone });
    }
  }

  // ── Band overlay container — sits above sprites, below HUD/swatches ───────
  // Two overlays: countertopOverlay (step 2) and backsplashOverlay (step 3).
  const bandOverlayCont = new Container();
  kitchenLayer.addChild(bandOverlayCont);

  // Reusable overlay graphics that can be re-tinted on each pick
  let counterOverlay: Graphics | null = null;
  let splashOverlay: Container | null = null;

  // ── Computed overlay band positions (absolute px in design canvas) ─────────
  const SPLASH_Y  = Math.round(KITCHEN_H * SPLASH_Y_FRAC);
  const SPLASH_H  = Math.round(KITCHEN_H * SPLASH_H_FRAC);
  const COUNTER_Y = Math.round(KITCHEN_H * COUNTER_Y_FRAC);
  const COUNTER_H = Math.round(KITCHEN_H * COUNTER_H_FRAC);

  // Soft-edged radial mask helper — drawn as a rect with feathered top/bottom
  function drawSoftBand(g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha: number): void {
    // Central solid rect
    g.rect(x, y + 6, w, h - 12).fill({ color, alpha });
    // Top feather strips
    for (let i = 0; i < 6; i++) {
      g.rect(x, y + i, w, 1).fill({ color, alpha: alpha * (i / 6) * 0.7 });
    }
    // Bottom feather strips
    for (let i = 0; i < 6; i++) {
      g.rect(x, y + h - 6 + i, w, 1).fill({ color, alpha: alpha * (1 - i / 6) * 0.7 });
    }
  }

  // ── Countertop overlay (step 2 pick) ─────────────────────────────────────
  // ctIdx 0 = Quartz-white (#F0EEEC, very light), ctIdx 1 = Marble-warm (#C8B8A8)
  function setCounterOverlay(ctIdx: number): void {
    if (counterOverlay) {
      bandOverlayCont.removeChild(counterOverlay);
      counterOverlay.destroy();
    }
    const color = ctIdx === 0 ? num("#EDECEA") : num("#C8B09A");
    counterOverlay = new Graphics();
    drawSoftBand(counterOverlay, 0, COUNTER_Y, DW, COUNTER_H, color, 0.55);
    // Vein lines for marble
    if (ctIdx === 1) {
      for (let i = 0; i < 5; i++) {
        const vx = 40 + i * Math.round(DW / 6) + Math.sin(i * 2.1) * 20;
        counterOverlay.moveTo(vx, COUNTER_Y + 2)
          .lineTo(vx + 28 + i * 4, COUNTER_Y + COUNTER_H - 2)
          .stroke({ width: 1.2, color: num("#8A7060"), alpha: 0.45 });
      }
    }
    counterOverlay.alpha = 0;
    bandOverlayCont.addChild(counterOverlay);
    gsap.to(counterOverlay, { alpha: 1, duration: 0.4, ease: "power2.out" });
  }

  // ── Backsplash overlay (step 3 pick) — tile lines drawn on band ───────────
  // tIdx 0 = Herringbone (warm diagonal pattern), tIdx 1 = Subway (horizontal grid)
  function buildSplashOverlay(tIdx: number, sIdx: number): Container {
    const oc = new Container();
    const baseColor = tIdx === 0
      ? (sIdx === 0 ? num("#F0EDE8") : num("#E8DDD0"))   // herringbone warm
      : (sIdx === 0 ? num("#F2F0EE") : num("#EDE8E0"));  // subway clean
    const lineColor = tIdx === 0
      ? (sIdx === 0 ? num("#C8C0B8") : num("#C0B0A0"))
      : (sIdx === 0 ? num("#D8D0C8") : num("#C8B8A4"));

    // Base tinted fill
    const bg = new Graphics();
    drawSoftBand(bg, 0, SPLASH_Y, DW, SPLASH_H, baseColor, 0.55);
    oc.addChild(bg);

    // Pattern lines clipped to band
    const lineCont = new Container();
    const lineG = new Graphics();

    if (tIdx === 0) {
      // Herringbone: diagonal bricks
      const bw = 32, bh = 12;
      for (let row = 0; row < Math.ceil(SPLASH_H / bh) + 2; row++) {
        for (let col = -1; col < Math.ceil(DW / bw) + 2; col++) {
          const xo = row % 2 === 0 ? 0 : bw / 2;
          lineG.roundRect(col * bw + xo + 1, SPLASH_Y + row * bh + 1, bw - 2, bh - 2, 2)
            .stroke({ width: 0.8, color: lineColor, alpha: 0.4 });
        }
      }
    } else {
      // Subway: horizontal bricks
      const bw = 60, bh = 24;
      for (let row = 0; row < Math.ceil(SPLASH_H / bh) + 2; row++) {
        const xo = row % 2 === 0 ? 0 : bw / 2;
        for (let col = -1; col < Math.ceil(DW / bw) + 2; col++) {
          lineG.roundRect(col * bw + xo + 1, SPLASH_Y + row * bh + 2, bw - 2, bh - 4, 3)
            .stroke({ width: 0.8, color: lineColor, alpha: 0.4 });
        }
      }
    }
    lineCont.addChild(lineG);
    // Mask line container to splash band
    const splashMaskG = new Graphics().rect(0, SPLASH_Y, DW, SPLASH_H).fill({ color: 0xffffff });
    lineCont.mask = splashMaskG;
    oc.addChild(splashMaskG, lineCont);
    return oc;
  }

  function setSplashOverlay(tIdx: number, sIdx: number, stagger = false): void {
    if (splashOverlay) {
      bandOverlayCont.removeChild(splashOverlay);
      splashOverlay.destroy({ children: true });
    }
    splashOverlay = buildSplashOverlay(tIdx, sIdx);
    splashOverlay.alpha = 0;
    bandOverlayCont.addChild(splashOverlay);

    if (stagger) {
      // Tile-lines draw in one-by-one with stagger 40ms
      const lineCont = splashOverlay.children[2] as Container | undefined;
      if (lineCont) {
        const lineG = lineCont.children[0] as Graphics;
        lineG.alpha = 0;
        gsap.to(splashOverlay, { alpha: 1, duration: 0.3, ease: "power2.out" });
        gsap.to(lineG, { alpha: 1, duration: 0.6, delay: 0.1, ease: "power2.inOut" });
      } else {
        gsap.to(splashOverlay, { alpha: 1, duration: 0.4, ease: "power2.out" });
      }
    } else {
      gsap.to(splashOverlay, { alpha: 1, duration: 0.4, ease: "power2.out" });
    }
  }

  // ── Procedural fallback kitchen (used if sprites fail to load) ────────────
  const SAFE_PAD = 10;
  const KW = DW - SAFE_PAD * 2;
  let kitchenFallbackCont: Container | null = null;

  function buildKitchenFallback(sIdx: number, cIdx: number, tIdx: number, withBonus = false): Container {
    const pal  = kitchenPalette(sIdx, cIdx);
    const [tA, tB] = tileColors(tIdx, sIdx);
    const isModern = sIdx === 0;
    const c = new Container();
    c.x = SAFE_PAD;

    const floorY = Math.round(KITCHEN_H * 0.67);
    const floorG = new Graphics();
    floorG.rect(0, floorY, KW, KITCHEN_H - floorY).fill({ color: pal.floor });
    floorG.rect(0, floorY, KW, 8).fill({ color: shade(pal.floor, -0.12) });
    c.addChild(floorG);

    const wallG = new Graphics().rect(0, 0, KW, floorY).fill({ color: pal.wall });
    c.addChild(wallG);

    if (withBonus) {
      c.addChild(new Graphics().rect(0, 0, KW, KITCHEN_H).fill({ color: num("#FFD080"), alpha: 0.16 }));
    }

    const winW = Math.round(KW * 0.30), winH = Math.round(KITCHEN_H * 0.15);
    const winX = Math.round(KW / 2 - winW / 2), winY = 10;
    const winG = new Graphics();
    winG.roundRect(winX, winY, winW, winH, 6).fill({ color: num("#B8D8F0"), alpha: 0.88 });
    winG.roundRect(winX, winY, winW, winH, 6).stroke({ width: 7, color: isModern ? num("#DDDBD8") : num("#F0E8D8") });
    winG.rect(winX + winW / 2 - 3, winY, 6, winH).fill({ color: isModern ? num("#DDDBD8") : num("#F0E8D8") });
    winG.rect(winX, winY + winH / 2 - 3, winW, 6).fill({ color: isModern ? num("#DDDBD8") : num("#F0E8D8") });
    c.addChild(new Graphics()
      .poly([winX + 10, winY + winH, winX + winW - 10, winY + winH, winX + winW + 50, floorY, winX - 50, floorY])
      .fill({ color: num("#FFF5E0"), alpha: withBonus ? 0.20 : 0.12 }));
    c.addChild(winG);

    if (withBonus) {
      for (let p = 0; p < 2; p++) {
        const px = KW * 0.32 + p * KW * 0.36;
        const pendTopY = Math.round(KITCHEN_H * 0.07);
        const pendMidY = Math.round(KITCHEN_H * 0.20);
        const pendBotY = Math.round(KITCHEN_H * 0.25);
        const pendEndY = Math.round(KITCHEN_H * 0.265);
        const pg = new Graphics();
        pg.moveTo(px, pendTopY).lineTo(px, pendMidY).stroke({ width: 2.5, color: num("#8A7A6A") });
        pg.poly([px - 22, pendMidY, px + 22, pendMidY, px + 16, pendBotY, px - 16, pendBotY]).fill({ color: num("#C8A860") });
        pg.poly([px - 16, pendBotY, px + 16, pendBotY, px + 11, pendEndY, px - 11, pendEndY]).fill({ color: num("#9A7A30") });
        c.addChild(new Graphics().ellipse(px, pendEndY + 16, 68, 22).fill({ color: num("#FFE080"), alpha: 0.22 }));
        c.addChild(pg);
      }
    }

    const splashY = Math.round(KITCHEN_H * 0.285), splashH = Math.round(KITCHEN_H * 0.17);
    const splashCont = new Container();
    const tileG = new Graphics();
    if (tIdx === 0) {
      const bw = 36, bh = 14;
      for (let row = 0; row < Math.ceil(splashH / bh) + 1; row++) {
        for (let col = -1; col < Math.ceil(KW / bw) + 2; col++) {
          const xo = row % 2 === 0 ? 0 : bw / 2;
          tileG.roundRect(col * bw + xo + 1, row * bh + 1, bw - 2, bh - 2, 2)
            .fill({ color: (col + row) % 2 === 0 ? tA : tB });
        }
      }
    } else {
      const bw = 64, bh = 28;
      for (let row = 0; row < Math.ceil(splashH / bh) + 1; row++) {
        const xo = row % 2 === 0 ? 0 : bw / 2;
        for (let col = -1; col < Math.ceil(KW / bw) + 2; col++) {
          tileG.roundRect(col * bw + xo + 1, row * bh + 2, bw - 2, bh - 4, 3)
            .fill({ color: (col + row) % 2 === 0 ? tA : tB });
        }
      }
    }
    splashCont.addChild(tileG);
    splashCont.position.set(0, splashY);
    const sM = new Graphics().rect(0, splashY, KW, splashH).fill({ color: 0xffffff });
    splashCont.mask = sM;
    c.addChild(sM, splashCont);

    const ucY = Math.round(KITCHEN_H * 0.07);
    const ucH = Math.round(KITCHEN_H * 0.20);
    const ucG = new Graphics();
    ucG.roundRect(0, ucY, KW * 0.28, ucH, isModern ? 2 : 8).fill({ color: pal.cabinet });
    ucG.moveTo(KW * 0.14, ucY + 10).lineTo(KW * 0.14, ucY + ucH - 10).stroke({ width: 2, color: pal.cabinetDark, alpha: 0.35 });
    ucG.roundRect(KW * 0.72, ucY, KW * 0.28, ucH, isModern ? 2 : 8).fill({ color: pal.cabinet });
    ucG.moveTo(KW * 0.86, ucY + 10).lineTo(KW * 0.86, ucY + ucH - 10).stroke({ width: 2, color: pal.cabinetDark, alpha: 0.35 });
    if (isModern) {
      ucG.roundRect(KW * 0.08, ucY + ucH / 2 - 3, 40, 6, 3).fill({ color: num("#B5915A") });
      ucG.roundRect(KW * 0.76, ucY + ucH / 2 - 3, 40, 6, 3).fill({ color: num("#B5915A") });
    } else {
      ucG.circle(KW * 0.14, ucY + ucH / 2, 8).fill({ color: num("#B5915A") });
      ucG.circle(KW * 0.86, ucY + ucH / 2, 8).fill({ color: num("#B5915A") });
    }
    ucG.rect(0, ucY + ucH, KW * 0.28, 5).fill({ color: num("#FFF5E0"), alpha: 0.65 });
    ucG.rect(KW * 0.72, ucY + ucH, KW * 0.28, 5).fill({ color: num("#FFF5E0"), alpha: 0.65 });
    c.addChild(ucG);

    const ctY = Math.round(KITCHEN_H * 0.455), ctH = 26;
    const ctG = new Graphics();
    ctG.roundRect(0, ctY, KW, ctH, 3).fill({ color: pal.counter });
    for (let i = 0; i < 7; i++) {
      const vx = 30 + i * Math.round(KW / 8) + Math.sin(i * 1.9) * 18;
      ctG.moveTo(vx, ctY + 2).lineTo(vx + 32 + i * 6, ctY + ctH - 2)
        .stroke({ width: 1 + (i % 2), color: pal.counterVein, alpha: 0.5 });
    }
    ctG.rect(0, ctY + ctH, KW, 7).fill({ color: shade(pal.counter, -0.14) });
    c.addChild(ctG);

    const lcY = ctY + ctH + 7, lcH = floorY - lcY;
    const lcG = new Graphics();
    lcG.rect(0, lcY, KW, lcH).fill({ color: pal.cabinet });
    const dw = (KW - 32) / 4;
    for (let d = 0; d < 4; d++) {
      const dx = 8 + d * (dw + 8);
      lcG.roundRect(dx + 4, lcY + 10, dw - 8, lcH - 20, isModern ? 2 : 6)
        .stroke({ width: 1.5, color: pal.cabinetDark, alpha: 0.28 });
      if (isModern) {
        lcG.roundRect(dx + dw / 2 - 18, lcY + 16, 36, 5, 2.5).fill({ color: num("#B5915A") });
      } else {
        lcG.circle(dx + dw / 2, lcY + 22, 8).fill({ color: num("#B5915A") });
      }
    }
    lcG.rect(0, lcY + lcH - 10, KW, 10).fill({ color: shade(pal.cabinet, -0.18) });
    c.addChild(lcG);

    const sk = new Graphics();
    sk.roundRect(KW / 2 - 72, ctY - 12, 144, 28, 4).fill({ color: shade(pal.counter, -0.07) });
    sk.roundRect(KW / 2 - 68, ctY - 8, 136, 22, 3).fill({ color: num("#C0BCBA"), alpha: 0.55 });
    sk.rect(KW / 2 - 4, ctY - 38, 8, 30).fill({ color: isModern ? num("#909090") : num("#B5915A") });
    sk.ellipse(KW / 2, ctY - 38, 16, 7).fill({ color: isModern ? num("#808080") : num("#9A7840") });
    c.addChild(sk);

    const stove = new Graphics();
    const stX = Math.round(KW * 0.10);
    stove.roundRect(stX, ctY - 10, 120, 26, 3).fill({ color: isModern ? num("#3A3A3A") : num("#EEE6D8") });
    stove.circle(stX + 30, ctY + 3, 14).fill({ color: isModern ? num("#252525") : num("#D8D0C0") });
    stove.circle(stX + 90, ctY + 3, 14).fill({ color: isModern ? num("#252525") : num("#D8D0C0") });
    stove.circle(stX + 30, ctY + 3, 8).fill({ color: isModern ? num("#181818") : num("#C8C0B0") });
    stove.circle(stX + 90, ctY + 3, 8).fill({ color: isModern ? num("#181818") : num("#C8C0B0") });
    c.addChild(stove);

    if (withBonus) {
      const cupX = KW - 110, cupY = ctY - 48;
      const cupG = new Graphics();
      cupG.roundRect(cupX, cupY + 22, 42, 32, 4).fill({ color: isModern ? num("#2E2E2E") : num("#F0E8D8") });
      cupG.roundRect(cupX, cupY + 22, 42, 32, 4).stroke({ width: 2, color: num("#B5915A") });
      cupG.ellipse(cupX + 21, cupY + 54, 21, 7).fill({ color: shade(pal.counter, 0.08) });
      cupG.moveTo(cupX + 40, cupY + 30).quadraticCurveTo(cupX + 55, cupY + 38, cupX + 40, cupY + 50)
        .stroke({ width: 3, color: num("#B5915A") });
      c.addChild(cupG);
      for (let s = 0; s < 3; s++) {
        const sg = new Graphics();
        const sx = cupX + 10 + s * 10;
        sg.moveTo(sx, cupY + 18).quadraticCurveTo(sx - 7 + s * 8, cupY + 6, sx, cupY - 4)
          .quadraticCurveTo(sx + 7 - s * 6, cupY - 16, sx, cupY - 26)
          .stroke({ width: 2, color: num("#F5EFE3"), alpha: 0.48 });
        c.addChild(sg);
      }
    }
    return c;
  }

  // Switch to show sprites or fallback.
  // When sprites loaded: only update crossfade + overlays; no need to rebuild.
  // When no sprites: rebuild full procedural container.
  const hasSprites = !!(tModern && tFarmhouse);

  function setKitchen(sIdx: number, _cIdx: number, _tIdx: number, _withBonus = false): void {
    if (hasSprites) {
      // Crossfade to chosen style immediately (no animation here — animations are called separately)
      if (sIdx !== activeStyle) {
        crossfadeToStyle(sIdx, 0.01);
      }
    } else {
      // Procedural fallback
      if (kitchenFallbackCont) {
        kitchenLayer.removeChild(kitchenFallbackCont);
        kitchenFallbackCont.destroy({ children: true });
      }
      kitchenFallbackCont = buildKitchenFallback(sIdx, _cIdx, _tIdx, _withBonus);
      // Insert below bandOverlayCont but above sprites (sprites are empty)
      kitchenLayer.addChildAt(kitchenFallbackCont, 1);
    }
  }

  // ── Wipe line (hook split: Modern left, Farmhouse right) ──────────────────
  // With sprites: we show both stacked sprites with a vertical mask/clip wipe.
  // The farmhouse sprite is revealed on the right via a rect mask on a separate
  // container that mirrors the old wipe approach.
  const wipeCont = new Container();
  bgLayer.addChild(wipeCont);

  // Wipe-specific second sprite container (farmhouse half shown to the right)
  const wipeFarmCont = new Container();
  if (tFarmhouse) {
    const wipeFarmSpr = makeCoverSprite(tFarmhouse, DW, KITCHEN_H);
    wipeFarmCont.addChild(wipeFarmSpr);
  }
  const wipeFarmMask = new Graphics();
  wipeFarmCont.mask = wipeFarmMask;
  // We'll add wipeFarmCont above kitchenSpriteCont during wipe
  kitchenLayer.addChild(wipeFarmCont);
  kitchenLayer.addChild(wipeFarmMask); // mask must also be in the scene

  // Divider/label overlay (always in wipeCont)
  function buildWipeDivider(splitX: number): void {
    wipeCont.removeChildren().forEach(cc => (cc as Container).destroy?.());
    if (splitX >= DW - 4) return;
    // Divider line + arrow
    const line = new Graphics();
    line.rect(splitX - 2, 0, 4, KITCHEN_H).fill({ color: PRIMARY });
    line.poly([splitX - 14, KITCHEN_H / 2 - 22, splitX + 14, KITCHEN_H / 2, splitX - 14, KITCHEN_H / 2 + 22])
      .fill({ color: 0xffffff, alpha: 0.85 });
    wipeCont.addChild(line);
    // Style labels
    const mkLabel = (txt: string, x: number): void => {
      const pill = new Graphics().roundRect(0, 0, 100, 34, 17).fill({ color: 0x000000, alpha: 0.45 });
      const t = new Text({ text: txt, style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 18 } });
      t.anchor.set(0.5);
      t.position.set(50, 17);
      const lc = new Container();
      lc.addChild(pill, t);
      lc.position.set(x - 50, KITCHEN_H / 2 + 36);
      wipeCont.addChild(lc);
    };
    if (splitX > 60)       mkLabel("Modern",    splitX / 2);
    if (splitX < DW - 60)  mkLabel("Farmhouse", splitX + (DW - splitX) / 2);
  }

  // Update mask + divider for current splitX (absolute DW coords)
  function buildWipeRight(splitX: number): void {
    // Update farmhouse right-half mask
    wipeFarmMask.clear();
    wipeFarmMask.rect(splitX, 0, DW - splitX, KITCHEN_H).fill({ color: 0xffffff });
    buildWipeDivider(splitX);
  }

  let wipeX = DW / 2;
  let wipeTween: gsap.core.Tween | null = null;

  function startWipe(): void {
    wipeX = DW / 2;
    wipeFarmCont.visible = true;
    buildWipeRight(wipeX);
    const proxy = { x: wipeX };
    wipeTween = gsap.to(proxy, {
      x: DW * 0.28,
      duration: WIPE_SPEED,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      onUpdate: () => { wipeX = proxy.x; buildWipeRight(wipeX); },
    });
  }

  function stopWipe(): void {
    wipeTween?.kill();
    wipeTween = null;
    wipeFarmCont.visible = false;
    wipeFarmMask.clear();
    wipeCont.removeChildren().forEach(cc => (cc as Container).destroy?.());
  }

  // ── White flash for crossfade assist ─────────────────────────────────────
  function whiteFlash(onDone?: () => void): void {
    const flash = new Graphics().rect(0, 0, DW, KITCHEN_H).fill({ color: 0xffffff, alpha: 0 });
    fxLayer.addChild(flash);
    gsap.timeline({ onComplete: () => { fxLayer.removeChild(flash); flash.destroy(); onDone?.(); } })
      .to(flash, { alpha: 0.72, duration: 0.14, ease: "power2.out" })
      .to(flash, { alpha: 0, duration: 0.28, ease: "power2.in" });
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  const hudCont   = new Container();
  const progBg    = new Graphics();
  const progFill  = new Graphics();
  const stepLabel = new Text({
    text: "",
    style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 24, align: "center", wordWrap: true, wordWrapWidth: DW - 48 },
  });
  stepLabel.anchor.set(0.5, 0.5);

  function buildHud(): void {
    hudCont.removeChildren();
    progBg.clear();
    progFill.clear();
    const barBg = new Graphics().roundRect(0, 0, DW, 8, 0).fill({ color: 0x000000, alpha: 0.35 });
    hudCont.addChild(barBg);
    progBg.roundRect(0, 0, DW, 8, 0).fill({ color: 0x000000, alpha: 0.22 });
    hudCont.addChild(progBg, progFill);
    uiLayer.addChild(hudCont);
    stepLabel.position.set(DW / 2, SWATCH_ZONE_Y + 22);
    uiLayer.addChild(stepLabel);
  }

  function drawProgress(pct: number): void {
    progFill.clear();
    if (pct > 0) progFill.roundRect(0, 0, Math.max(8, DW * pct), 8, 0).fill({ color: PRIMARY });
  }

  function setHint(msg: string): void {
    stepLabel.text = msg;
    fit(stepLabel, DW - 48);
    gsap.fromTo(stepLabel, { alpha: 0.4 }, { alpha: 1, duration: 0.25 });
  }

  // ── Bottom zone background ────────────────────────────────────────────────
  const bottomZoneBg = new Graphics();
  bottomZoneBg.rect(0, KITCHEN_H, DW, DH - KITCHEN_H).fill({ color: num("#1E1E1E") });
  bottomZoneBg.rect(0, KITCHEN_H, DW, 4).fill({ color: PRIMARY, alpha: 0.55 });
  bgLayer.addChild(bottomZoneBg);

  // ── Ambient dust particles (for reveal / coziness) ────────────────────────
  let dustInterval: ReturnType<typeof setInterval> | null = null;

  function startDust(): void {
    if (dustInterval) return;
    dustInterval = setInterval(() => {
      const n = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const g = new Graphics().circle(0, 0, 1.5 + Math.random() * 2.5)
          .fill({ color: num("#FFE0A0"), alpha: 0.7 });
        const startX = Math.random() * DW;
        const startY = KITCHEN_H + 20;
        g.position.set(startX, startY);
        fxLayer.addChild(g);
        gsap.to(g, {
          x: startX + (Math.random() - 0.5) * 80,
          y: startY - (60 + Math.random() * 200),
          alpha: 0,
          duration: 2.5 + Math.random() * 2,
          ease: "power1.out",
          onComplete: () => { fxLayer.removeChild(g); g.destroy(); },
        });
      }
    }, 120);
  }

  function stopDust(): void {
    if (dustInterval) { clearInterval(dustInterval); dustInterval = null; }
  }

  // ── Swatch cards (bottom zone) ────────────────────────────────────────────
  let swatchCont: Container | null = null;
  let _pickHandler: ((e: { global: { x: number; y: number } }) => void) | null = null;

  const CARD_H = 80;
  const CARD_GAP = 14;
  const CARD_W = Math.floor((DW - 40 - CARD_GAP) / 2);
  const CARDS_Y = SWATCH_ZONE_Y + 46;
  const CARD_L_X = 20;
  const CARD_R_X = CARD_L_X + CARD_W + CARD_GAP;

  function buildSwatchCard(idx: number, step: number): Container {
    const sC = new Container();
    const x = idx === 0 ? CARD_L_X : CARD_R_X;
    sC.position.set(x, CARDS_Y);

    let label: string, col: number, subCol: number;
    if (step === 1) {
      label  = STYLE_NAMES[idx];
      col    = idx === 0 ? num("#2E2E2E") : num("#E8E0D0");
      subCol = idx === 0 ? num("#B5915A") : num("#C96F4A");
    } else if (step === 2) {
      label  = CT_NAMES[idx];
      col    = idx === 0 ? num("#F0EEEC") : num("#C8B8A8");
      subCol = idx === 0 ? num("#C8C4C0") : num("#8A7060");
    } else {
      label  = TILE_NAMES[idx];
      col    = idx === 0 ? num("#F5F0EB") : num("#F8F6F4");
      subCol = idx === 0 ? num("#C8C0B8") : num("#D8D0C8");
    }

    const bg = new Graphics()
      .roundRect(0, 0, CARD_W, CARD_H, 10)
      .fill({ color: num("#F5EFE3"), alpha: 0.18 })
      .stroke({ width: 2.5, color: PRIMARY });
    sC.addChild(bg);

    const swatchW = Math.round(CARD_W * 0.38);
    const sG = new Graphics().roundRect(6, 6, swatchW, CARD_H - 12, 6).fill({ color: col });
    if (step === 1 && idx === 0) {
      for (let l = 0; l < 3; l++)
        sG.moveTo(10, 16 + l * 18).lineTo(swatchW - 4, 16 + l * 18)
          .stroke({ width: 1.5, color: subCol, alpha: 0.38 });
    } else if (step === 1 && idx === 1) {
      sG.roundRect(10, 12, swatchW - 16, CARD_H - 36, 4).stroke({ width: 1.5, color: subCol, alpha: 0.45 });
    } else if (step === 2) {
      for (let v = 0; v < 4; v++)
        sG.moveTo(8 + v * 24, 8).lineTo(14 + v * 22, CARD_H - 20)
          .stroke({ width: 1.5, color: subCol, alpha: 0.52 });
    } else if (step === 3 && idx === 0) {
      const bw = 18, bh = 8;
      for (let r = 0; r < Math.ceil((CARD_H - 12) / bh) + 1; r++)
        for (let cc = -1; cc < Math.ceil(swatchW / bw) + 1; cc++) {
          const xo = r % 2 === 0 ? 0 : bw / 2;
          sG.roundRect(cc * bw + xo, r * bh, bw - 1, bh - 1, 1)
            .fill({ color: (cc + r) % 2 === 0 ? subCol : shade(subCol, 0.12), alpha: 0.55 });
        }
    } else if (step === 3 && idx === 1) {
      const bw = 28, bh = 12;
      for (let r = 0; r < Math.ceil((CARD_H - 12) / bh) + 1; r++) {
        const xo = r % 2 === 0 ? 0 : bw / 2;
        for (let cc = -1; cc < Math.ceil(swatchW / bw) + 1; cc++)
          sG.roundRect(cc * bw + xo + 1, r * bh + 2, bw - 2, bh - 4, 2)
            .fill({ color: subCol, alpha: 0.5 });
      }
    }
    sC.addChild(sG);

    const lblX = swatchW + 10;
    const lblAreaW = CARD_W - swatchW - 16;
    const lbl = new Text({ text: label, style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 20, align: "center" } });
    lbl.anchor.set(0.5, 0.5);
    lbl.position.set(lblX + lblAreaW / 2, CARD_H / 2 - 8);
    fit(lbl, lblAreaW);
    sC.addChild(lbl);

    const tapLbl = new Text({ text: "Tap to pick", style: { fill: TXT, fontFamily: FONT, fontSize: 12, align: "center" } });
    tapLbl.alpha = 0.68;
    tapLbl.anchor.set(0.5, 0);
    tapLbl.position.set(lblX + lblAreaW / 2, CARD_H / 2 + 10);
    sC.addChild(tapLbl);

    gsap.to(sC.scale, { x: 1.04, y: 1.04, duration: 0.75 + idx * 0.18, yoyo: true, repeat: -1, ease: "sine.inOut" });
    return sC;
  }

  function showSwatches(step: number, onPick: (idx: number) => void): void {
    clearSwatches();
    swatchCont = new Container();
    swatchCont.addChild(buildSwatchCard(0, step));
    swatchCont.addChild(buildSwatchCard(1, step));
    swatchCont.alpha = 0;
    swatchLayer.addChild(swatchCont);
    gsap.to(swatchCont, { alpha: 1, duration: 0.35 });

    _pickHandler = (e: { global: { x: number; y: number } }) => {
      if (busy || !swatchCont) return;
      const scale = root.scale.x || 1;
      const offX  = root.x || 0;
      const offY  = root.y || 0;
      const dx = (e.global.x - offX) / scale;
      const dy = (e.global.y - offY) / scale;
      for (let idx = 0; idx <= 1; idx++) {
        const cx = idx === 0 ? CARD_L_X : CARD_R_X;
        if (dx >= cx && dx <= cx + CARD_W && dy >= CARDS_Y && dy <= CARDS_Y + CARD_H) {
          onPick(idx);
          return;
        }
      }
      onPick(dx < DW / 2 ? 0 : 1);
    };
    app.stage.on("pointertap", _pickHandler as (e: unknown) => void);
  }

  function clearSwatches(): void {
    if (swatchCont) {
      gsap.killTweensOf(swatchCont);
      swatchCont.children.forEach(ch => gsap.killTweensOf(ch.scale));
      swatchLayer.removeChild(swatchCont);
      swatchCont.destroy({ children: true });
      swatchCont = null;
    }
    if (_pickHandler) {
      app.stage.off("pointertap", _pickHandler as (e: unknown) => void);
      _pickHandler = null;
    }
  }

  // ── Ghost-finger hint ─────────────────────────────────────────────────────
  let ghostFinger: Container | null = null;

  function showGhostFinger(tx: number, ty: number): void {
    hideGhostFinger();
    const g = new Container();
    const circle = new Graphics().circle(0, 0, 24).fill({ color: 0xffffff, alpha: 0.50 });
    g.addChild(circle);
    g.position.set(tx, ty - 50);
    fxLayer.addChild(g);
    ghostFinger = g;
    gsap.timeline({ repeat: -1, repeatDelay: 0.7 })
      .to(g, { y: ty, duration: 0.4, ease: "power2.out" })
      .to(circle.scale, { x: 0.72, y: 0.72, duration: 0.11, ease: "power2.in" }, ">")
      .to(circle.scale, { x: 1, y: 1, duration: 0.18, ease: "power2.out" }, ">")
      .to(g, { y: ty - 50, duration: 0.28, ease: "power2.in" }, "+=0.18");
  }

  function hideGhostFinger(): void {
    if (ghostFinger) {
      gsap.killTweensOf(ghostFinger);
      ghostFinger.children.forEach(ch => gsap.killTweensOf(ch.scale));
      fxLayer.removeChild(ghostFinger);
      ghostFinger.destroy({ children: true });
      ghostFinger = null;
    }
  }

  // ── Camera push-in / pull-back on kitchenLayer ─────────────────────────────
  function cameraPushIn(onDone: () => void): void {
    gsap.timeline({ onComplete: onDone })
      .to(kitchenLayer.scale, { x: 1.06, y: 1.06, duration: 0.24, ease: "power2.out" })
      .to(kitchenLayer, { x: -(DW * 0.03), y: -(DH * 0.02), duration: 0.24, ease: "power2.out" }, 0)
      .to(kitchenLayer.scale, { x: 1, y: 1, duration: 0.28, ease: "power2.inOut" }, 0.24)
      .to(kitchenLayer, { x: 0, y: 0, duration: 0.28, ease: "power2.inOut" }, 0.24);
  }

  // Reveal slow zoom-out: 1.06 → 1.0 per spec
  function cameraRevealZoomOut(onDone: () => void): void {
    kitchenLayer.scale.set(1.06);
    kitchenLayer.position.set(-(DW * 0.03), -(DH * 0.03));
    gsap.timeline({ onComplete: onDone })
      .to(kitchenLayer.scale, { x: 1, y: 1, duration: 1.4, ease: "power2.inOut" })
      .to(kitchenLayer, { x: 0, y: 0, duration: 1.4, ease: "power2.inOut" }, 0);
  }

  // ── Tile cascade (step 3 transition FX) ───────────────────────────────────
  function tileCascade(onDone: () => void): void {
    const tw = 50, th = 20;
    const cols = Math.ceil(DW / tw) + 1;
    const rows = Math.ceil(SPLASH_H / th) + 1;
    const total = rows * cols;
    let done = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const t = new Graphics()
          .roundRect(1, 1, tw - 2, th - 2, 2)
          .fill({ color: (col + row) % 2 === 0 ? num("#F5F0EB") : num("#E0D8D0") });
        t.position.set(col * tw, SPLASH_Y - th - 40);
        t.alpha = 0;
        fxLayer.addChild(t);
        const delay = (row * cols + col) * 0.040; // 40ms stagger per spec
        gsap.to(t, { y: SPLASH_Y + row * th, alpha: 1, duration: 0.25, delay, ease: "bounce.out" });
        gsap.to(t, {
          alpha: 0, duration: 0.25, delay: delay + 0.40,
          onComplete: () => {
            fxLayer.removeChild(t); t.destroy();
            done++;
            if (done === total) onDone();
          },
        });
      }
    }
  }

  // ── Warm light wash (golden overlay flash) ────────────────────────────────
  function warmLightWash(onDone?: () => void): void {
    const warm = new Graphics().rect(0, 0, DW, KITCHEN_H).fill({ color: num("#FFE080"), alpha: 0 });
    fxLayer.addChild(warm);
    gsap.timeline({ onComplete: () => { fxLayer.removeChild(warm); warm.destroy(); onDone?.(); } })
      .to(warm, { alpha: 0.22, duration: 0.55, ease: "power2.out" })
      .to(warm, { alpha: 0, duration: 0.80, ease: "power2.in" });
  }

  // ── FSM ───────────────────────────────────────────────────────────────────
  function goStep1(): void {
    state    = "step1";
    busy     = false;
    idleAccum = idleCount = 0;
    stopWipe();
    stopDust();
    swatchLayer.removeChildren().forEach(cc => cc.destroy());
    drawProgress(0.05);
    setHint("Tap your favorite style");
    setKitchen(0, 0, 0);
    showSwatches(1, (idx) => {
      if (busy || state !== "step1") return;
      busy = true;
      hideGhostFinger();
      pickStyle = idx;
      clearSwatches();
      // Crossfade with white-flash assist
      if (hasSprites) {
        whiteFlash(() => {
          crossfadeToStyle(pickStyle, 0.35, () => {
            sparkle(DW / 2, KITCHEN_H / 2);
            drawProgress(0.33);
            gsap.delayedCall(0.2, goStep2);
          });
        });
      } else {
        setKitchen(pickStyle, 0, 0);
        sparkle(DW / 2, KITCHEN_H / 2);
        drawProgress(0.33);
        gsap.delayedCall(0.2, goStep2);
      }
    });
  }

  function goStep2(): void {
    state    = "step2";
    busy     = false;
    idleAccum = idleCount = 0;
    setHint("Pick your countertop (2/3)");
    showSwatches(2, (idx) => {
      if (busy || state !== "step2") return;
      busy = true;
      hideGhostFinger();
      pickCt = idx;
      clearSwatches();
      // Camera push-in pulse + shimmer on countertop band
      cameraPushIn(() => {
        setCounterOverlay(pickCt);
        shimmerBand(COUNTER_Y, COUNTER_H);
        sparkle(DW / 2, COUNTER_Y + COUNTER_H / 2);
        drawProgress(0.66);
        gsap.delayedCall(0.3, goStep3);
      });
    });
  }

  function goStep3(): void {
    state    = "step3";
    busy     = false;
    idleAccum = idleCount = 0;
    setHint("Choose your backsplash (3/3)");
    showSwatches(3, (idx) => {
      if (busy || state !== "step3") return;
      busy = true;
      hideGhostFinger();
      pickTile = idx;
      clearSwatches();
      // Tile cascade → set overlay with stagger draw-in → shimmer band
      tileCascade(() => {
        setSplashOverlay(pickTile, pickStyle, true);
        shimmerBand(SPLASH_Y, SPLASH_H);
        sparkle(DW / 2, SPLASH_Y + SPLASH_H / 2);
        warmLightWash();
        drawProgress(1.0);
        setHint("Your kitchen is ready!");
        gsap.delayedCall(0.7, goReveal);
      });
    });
  }

  function goReveal(): void {
    state = "reveal";
    busy  = true;
    clearSwatches();
    hideGhostFinger();

    // Reveal: slow zoom-out 1.06 → 1.0 + warm light wash + dust particles
    cameraRevealZoomOut(() => {
      busy = false;
      stopDust();
      gsap.delayedCall(REVEAL_HOLD, showEndcard);
    });
    warmLightWash();
    startDust();

    // Reveal banner
    const archetypeName = ARCHETYPES[pickStyle]?.[pickCt]?.[pickTile] ?? "The Modern Purist";
    const choiceLine    = `${STYLE_NAMES[pickStyle]} · ${CT_NAMES[pickCt]} · ${TILE_NAMES[pickTile]}`;
    const bH = 140;
    const bannerG = new Container();
    bannerG.addChild(new Graphics().rect(0, KITCHEN_H / 2 - bH / 2, DW, bH).fill({ color: 0x000000, alpha: 0.70 }));

    const arcTxt = new Text({ text: archetypeName,
      style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 34, align: "center" } });
    arcTxt.anchor.set(0.5);
    arcTxt.position.set(DW / 2, KITCHEN_H / 2 - 18);
    fit(arcTxt, DW - 48);
    bannerG.addChild(arcTxt);

    const choiceTxt = new Text({ text: choiceLine,
      style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: 22, align: "center" } });
    choiceTxt.anchor.set(0.5);
    choiceTxt.position.set(DW / 2, KITCHEN_H / 2 + 30);
    fit(choiceTxt, DW - 64);
    bannerG.addChild(choiceTxt);

    bannerG.alpha = 0;
    overlayLayer.addChild(bannerG);
    gsap.to(bannerG, { alpha: 1, duration: 0.4, delay: 0.25 });
    gsap.to(bannerG, {
      alpha: 0, duration: 0.3, delay: 0.25 + REVEAL_HOLD,
      onComplete: () => { overlayLayer.removeChild(bannerG); bannerG.destroy({ children: true }); },
    });
  }

  function showEndcard(): void {
    if (state === "end") return;
    state = "end";
    busy  = true;
    stopDust();
    hideGhostFinger();
    clearSwatches();
    overlayLayer.removeChildren().forEach(cc => cc.destroy());

    // Endcard bg = final composed scene (sprites already showing correct style + overlays)
    // Just dim the scrim over it
    overlayLayer.addChild(new Graphics().rect(0, 0, DW, DH).fill({ color: 0x000000, alpha: 0.52 }));

    const pw = 470, ph = 560;
    const panel = new Container();
    panel.addChild(new Graphics()
      .roundRect(-pw / 2, -ph / 2, pw, ph, 22)
      .fill({ color: num("#F5EFE3") })
      .stroke({ width: 4, color: PRIMARY }));
    panel.position.set(DW / 2, DH / 2);

    // Brand header
    panel.addChild(new Graphics().roundRect(-pw / 2 + 20, -ph / 2 + 16, pw - 40, 54, 10).fill({ color: PRIMARY }));
    const brandTxt = new Text({ text: "DreamSlate Kitchens",
      style: { fill: "#F5EFE3", fontFamily: FONT, fontWeight: "bold", fontSize: 22, align: "center" } });
    brandTxt.anchor.set(0.5);
    brandTxt.position.set(0, -ph / 2 + 43);
    fit(brandTxt, pw - 50);
    panel.addChild(brandTxt);

    // Kitchen thumbnail — mini procedural snapshot of chosen combo
    const thumbW = pw - 50, thumbH = 118;
    const thumbY = -ph / 2 + 90;
    const pal = kitchenPalette(pickStyle, pickCt);
    const [tA] = tileColors(pickTile, pickStyle);
    const th2 = new Graphics();
    th2.roundRect(0, 0, thumbW, thumbH, 8).fill({ color: pal.wall });
    th2.roundRect(0, 4, thumbW * 0.26, thumbH * 0.48, 4).fill({ color: pal.cabinet });
    th2.roundRect(thumbW * 0.74, 4, thumbW * 0.26, thumbH * 0.48, 4).fill({ color: pal.cabinet });
    th2.rect(0, thumbH * 0.37, thumbW, thumbH * 0.25).fill({ color: tA, alpha: 0.75 });
    th2.roundRect(0, thumbH * 0.62, thumbW, thumbH * 0.09, 2).fill({ color: pal.counter });
    th2.rect(0, thumbH * 0.71, thumbW, thumbH * 0.14).fill({ color: pal.cabinet });
    th2.rect(0, thumbH * 0.85, thumbW, thumbH * 0.15).fill({ color: pal.floor });
    const thumbCont = new Container();
    thumbCont.addChild(th2);
    thumbCont.position.set(-thumbW / 2, thumbY);
    panel.addChild(thumbCont);

    // Archetype name
    const arcL = new Text({ text: ARCHETYPES[pickStyle]?.[pickCt]?.[pickTile] ?? "The Modern Purist",
      style: { fill: num(cfg.style.colors.background), fontFamily: FONT, fontWeight: "bold", fontSize: 26, align: "center" } });
    arcL.anchor.set(0.5);
    arcL.position.set(0, thumbY + thumbH + 24);
    fit(arcL, pw - 48);
    panel.addChild(arcL);

    const choiceL = new Text({ text: `${STYLE_NAMES[pickStyle]} · ${CT_NAMES[pickCt]} · ${TILE_NAMES[pickTile]}`,
      style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: 19, align: "center" } });
    choiceL.anchor.set(0.5);
    choiceL.position.set(0, thumbY + thumbH + 58);
    fit(choiceL, pw - 60);
    panel.addChild(choiceL);

    const endL = new Text({ text: "Designed with professional designers — book your free consult.",
      style: { fill: num(cfg.style.colors.background), fontFamily: FONT, fontSize: 16, align: "center", wordWrap: true, wordWrapWidth: pw - 60 } });
    endL.anchor.set(0.5);
    endL.position.set(0, thumbY + thumbH + 94);
    fit(endL, pw - 60);
    panel.addChild(endL);

    const mkTrust = (txt: string, yOff: number) => {
      const t = new Text({ text: txt,
        style: { fill: num("#2E6B2E"), fontFamily: FONT, fontWeight: "bold", fontSize: 15, align: "center" } });
      t.anchor.set(0.5);
      t.position.set(0, yOff);
      panel.addChild(t);
    };
    mkTrust("✓ professional designers",      ph / 2 - 178);
    mkTrust("✓ free consult, no obligation", ph / 2 - 156);

    const ctaW = pw - 44, ctaH = 76;
    const ctaBg = new Graphics()
      .roundRect(-ctaW / 2, -ctaH / 2, ctaW, ctaH, 38)
      .fill({ color: ACCENT })
      .stroke({ width: 3, color: shade(ACCENT, -0.22) });
    const ctaTxt = new Text({ text: cfg.copy.cta,
      style: { fill: "#FFFFFF", fontFamily: FONT, fontWeight: "bold", fontSize: 28, align: "center" } });
    ctaTxt.anchor.set(0.5);
    fit(ctaTxt, ctaW - 28);
    const ctaCont = new Container();
    ctaCont.addChild(ctaBg, ctaTxt);
    ctaCont.position.set(0, ph / 2 - 100);
    ctaCont.eventMode = "static";
    ctaCont.cursor    = "pointer";
    ctaCont.on("pointertap", (e) => { e.stopPropagation(); window.FbPlayableAd.onCTAClick(); });
    panel.addChild(ctaCont);
    gsap.to(ctaCont.scale, { x: 1.04, y: 1.04, duration: 0.65, yoyo: true, repeat: -1, ease: "sine.inOut" });

    const disc = new Text({ text: "Free consult, no obligation. Visualization is illustrative.",
      style: { fill: num(cfg.style.colors.background), fontFamily: FONT, fontSize: 13, align: "center", wordWrap: true, wordWrapWidth: pw - 44 } });
    disc.alpha = 0.72;
    disc.anchor.set(0.5);
    disc.position.set(0, ph / 2 - 24);
    panel.addChild(disc);

    panel.scale.set(0.72);
    overlayLayer.addChild(panel);
    gsap.to(panel.scale, { x: 1, y: 1, duration: 0.44, ease: "back.out(1.6)" });
  }

  // ── Idle / auto-demo ticker ────────────────────────────────────────────────
  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    if (state === "hook" || state === "reveal" || state === "end") return;
    if (busy) { idleAccum = 0; return; }
    idleAccum += dt;
    if (idleAccum < IDLE_HINT / 1000) return;
    idleAccum = 0;
    idleCount++;
    setHint(
      state === "step1" ? "Tap your favorite style" :
      state === "step2" ? "Pick your countertop (2/3)" :
                          "Choose your backsplash (3/3)",
    );
    if (idleCount >= AUTO_DEMO_AFTER && ghostFinger === null) {
      const gfX = CARD_L_X + CARD_W / 2;
      const gfY = CARDS_Y + CARD_H / 2;
      showGhostFinger(gfX, gfY);
    }
    if (idleCount >= AUTO_DEMO_AFTER + 1 && !/dbg/.test(location.search)) {
      idleCount = 0;
      hideGhostFinger();
      _pickHandler?.({ global: { x: 0, y: CARDS_Y + CARD_H / 2 } });
    }
  });

  // ── Hook ──────────────────────────────────────────────────────────────────
  function startHook(): void {
    state     = "step1";
    busy      = false;
    idleAccum = idleCount = 0;
    clearSwatches();
    hideGhostFinger();
    stopDust();
    overlayLayer.removeChildren().forEach(cc => cc.destroy());
    uiLayer.removeChildren();
    swatchLayer.removeChildren();

    buildHud();
    // Ensure modern is shown
    if (hasSprites && activeStyle !== 0) crossfadeToStyle(0, 0.01);
    setKitchen(0, 0, 0);
    drawProgress(0.05);
    setHint("Tap your favorite style");
    startWipe();

    showSwatches(1, (idx) => {
      if (busy || state !== "step1") return;
      busy = true;
      hideGhostFinger();
      pickStyle = idx;
      clearSwatches();
      stopWipe();
      if (hasSprites) {
        whiteFlash(() => {
          crossfadeToStyle(pickStyle, 0.35, () => {
            sparkle(DW / 2, KITCHEN_H / 2);
            drawProgress(0.33);
            gsap.delayedCall(0.2, goStep2);
          });
        });
      } else {
        setKitchen(pickStyle, 0, 0);
        sparkle(DW / 2, KITCHEN_H / 2);
        drawProgress(0.33);
        gsap.delayedCall(0.2, goStep2);
      }
    });
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  function layout(): void {
    const w = window.innerWidth, h = window.innerHeight;
    app.canvas.style.width  = w + "px";
    app.canvas.style.height = h + "px";
    const s = Math.min(w / DW, h / DH);
    root.scale.set(s);
    root.position.set((w - DW * s) / 2, (h - DH * s) / 2);
  }

  layout();
  window.addEventListener("resize", layout);

  // ── Build + start ─────────────────────────────────────────────────────────
  buildHud();
  startHook();

  app.renderer.render(app.stage);
  requestAnimationFrame(() => { layout(); app.renderer.render(app.stage); });
}

void (() => window.FbPlayableAd.onCTAClick);

main().catch((e) => {
  console.error("Dream Kitchen Three Picks boot error:", e);
});
