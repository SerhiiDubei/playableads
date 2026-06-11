// Dream Kitchen — Three Picks
// Quiz-picker 3-step kitchen configurator (PixiJS v8 + GSAP).
// Step 1: Kitchen Style (Modern / Farmhouse)
// Step 2: Countertop (Quartz / Marble) — shimmer + push-in camera
// Step 3: Backsplash (Herringbone / Subway) — tile cascade + lighting shift
// Reveal: bonus-delta (pendant lights, steam, golden-hour glow) + archetype name
// Endcard: exact user kitchen + CTA
import { Application, Container, Graphics, Text } from "pixi.js";
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

// The kitchen scene occupies the top ~67% (y 0..640); bottom ~33% = swatch zone.
// Increased kitchen height so scene fills more of the screen; bottom strip = 160px.
const KITCHEN_H = 800;
// Swatch zone starts just below kitchen scene (160px reserved for swatches).
const SWATCH_ZONE_Y = KITCHEN_H; // 800

// ── Kitchen palette per combination ──────────────────────────────────────────
interface KitchenPalette {
  wall: number;
  cabinet: number;
  cabinetDark: number;
  cabinetLight: number;
  counter: number;
  counterVein: number;
  floor: number;
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
  if (tileIdx === 0) { // Herringbone
    return isModern ? [num("#F5F0EB"), num("#E0D8D0")] : [num("#E8DDD0"), num("#D4C8B8")];
  }
  // Subway
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

  function shimmer(w: number, h: number): void {
    const shine = new Graphics().rect(0, 0, 50, h).fill({ color: 0xffffff, alpha: 0.32 });
    shine.position.set(-60, 0);
    fxLayer.addChild(shine);
    gsap.to(shine, {
      x: w + 60, duration: 0.55, ease: "power1.inOut",
      onComplete: () => { fxLayer.removeChild(shine); shine.destroy(); },
    });
  }

  // ── Kitchen scene ─────────────────────────────────────────────────────────
  // Kitchen is rendered into KITCHEN_H pixels at y=0; floor takes the bottom portion.
  let kitchenCont = new Container();
  kitchenLayer.addChild(kitchenCont);

  // Safe horizontal padding keeps scene away from left/right edges
  const SAFE_PAD = 10;
  // Kitchen scene inner width (with safe padding applied)
  const KW = DW - SAFE_PAD * 2;

  function buildKitchen(sIdx: number, cIdx: number, tIdx: number, withBonus = false): Container {
    const pal  = kitchenPalette(sIdx, cIdx);
    const [tA, tB] = tileColors(tIdx, sIdx);
    const isModern = sIdx === 0;
    const c = new Container();

    // Kitchen scene rendered at full DW × KITCHEN_H, then clipped and offset inward by SAFE_PAD.
    // We draw in local [0..KW] × [0..KITCHEN_H] coords, then shift the container right by SAFE_PAD.
    c.x = SAFE_PAD;

    // Floor (bottom ~30% of kitchen zone)
    const floorY = Math.round(KITCHEN_H * 0.67);
    const floorG = new Graphics();
    floorG.rect(0, floorY, KW, KITCHEN_H - floorY).fill({ color: pal.floor });
    floorG.rect(0, floorY, KW, 8).fill({ color: shade(pal.floor, -0.12) }); // baseboard shadow
    c.addChild(floorG);

    // Wall
    const wallG = new Graphics().rect(0, 0, KW, floorY).fill({ color: pal.wall });
    c.addChild(wallG);

    // Golden-hour bonus overlay
    if (withBonus) {
      c.addChild(new Graphics().rect(0, 0, KW, KITCHEN_H).fill({ color: num("#FFD080"), alpha: 0.16 }));
    }

    // Window (upper centre) — scaled proportionally to KW
    const winW = Math.round(KW * 0.30), winH = Math.round(KITCHEN_H * 0.15);
    const winX = Math.round(KW / 2 - winW / 2), winY = 10;
    const winG = new Graphics();
    winG.roundRect(winX, winY, winW, winH, 6).fill({ color: num("#B8D8F0"), alpha: 0.88 });
    winG.roundRect(winX, winY, winW, winH, 6).stroke({ width: 7, color: isModern ? num("#DDDBD8") : num("#F0E8D8") });
    winG.rect(winX + winW / 2 - 3, winY, 6, winH).fill({ color: isModern ? num("#DDDBD8") : num("#F0E8D8") });
    winG.rect(winX, winY + winH / 2 - 3, winW, 6).fill({ color: isModern ? num("#DDDBD8") : num("#F0E8D8") });
    // Window light spill onto counter area
    c.addChild(new Graphics()
      .poly([winX + 10, winY + winH, winX + winW - 10, winY + winH, winX + winW + 50, floorY, winX - 50, floorY])
      .fill({ color: num("#FFF5E0"), alpha: withBonus ? 0.20 : 0.12 }));
    c.addChild(winG);

    // Pendant lights (bonus delta)
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

    // Backsplash zone (between upper cabinets and counter)
    // Scale relative positions to KITCHEN_H
    const splashY = Math.round(KITCHEN_H * 0.285), splashH = Math.round(KITCHEN_H * 0.17);
    const splashCont = new Container();
    const tileG = new Graphics();
    if (tIdx === 0) {
      // Herringbone
      const bw = 36, bh = 14;
      for (let row = 0; row < Math.ceil(splashH / bh) + 1; row++) {
        for (let col = -1; col < Math.ceil(KW / bw) + 2; col++) {
          const xo = row % 2 === 0 ? 0 : bw / 2;
          tileG.roundRect(col * bw + xo + 1, row * bh + 1, bw - 2, bh - 2, 2)
            .fill({ color: (col + row) % 2 === 0 ? tA : tB });
        }
      }
    } else {
      // Subway
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

    // Upper cabinets — flanking the window
    const ucY = Math.round(KITCHEN_H * 0.07);
    const ucH = Math.round(KITCHEN_H * 0.20);
    const ucG = new Graphics();
    // Left block (does NOT reach left edge — inset 0, already SAFE_PAD away from screen edge)
    ucG.roundRect(0, ucY, KW * 0.28, ucH, isModern ? 2 : 8).fill({ color: pal.cabinet });
    ucG.moveTo(KW * 0.14, ucY + 10).lineTo(KW * 0.14, ucY + ucH - 10).stroke({ width: 2, color: pal.cabinetDark, alpha: 0.35 });
    // Right block (does NOT reach right edge — ends at KW = DW - 2*SAFE_PAD)
    ucG.roundRect(KW * 0.72, ucY, KW * 0.28, ucH, isModern ? 2 : 8).fill({ color: pal.cabinet });
    ucG.moveTo(KW * 0.86, ucY + 10).lineTo(KW * 0.86, ucY + ucH - 10).stroke({ width: 2, color: pal.cabinetDark, alpha: 0.35 });
    // Handles
    if (isModern) {
      ucG.roundRect(KW * 0.08, ucY + ucH / 2 - 3, 40, 6, 3).fill({ color: num("#B5915A") });
      ucG.roundRect(KW * 0.76, ucY + ucH / 2 - 3, 40, 6, 3).fill({ color: num("#B5915A") });
    } else {
      ucG.circle(KW * 0.14, ucY + ucH / 2, 8).fill({ color: num("#B5915A") });
      ucG.circle(KW * 0.86, ucY + ucH / 2, 8).fill({ color: num("#B5915A") });
    }
    // Under-cabinet light strip
    ucG.rect(0, ucY + ucH, KW * 0.28, 5).fill({ color: num("#FFF5E0"), alpha: 0.65 });
    ucG.rect(KW * 0.72, ucY + ucH, KW * 0.28, 5).fill({ color: num("#FFF5E0"), alpha: 0.65 });
    c.addChild(ucG);

    // Countertop — y proportional to KITCHEN_H
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

    // Lower cabinets
    const lcY = ctY + ctH + 7, lcH = floorY - lcY;
    const lcG = new Graphics();
    lcG.rect(0, lcY, KW, lcH).fill({ color: pal.cabinet });
    // Door panels (4 evenly spaced)
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
    lcG.rect(0, lcY + lcH - 10, KW, 10).fill({ color: shade(pal.cabinet, -0.18) }); // kickboard
    c.addChild(lcG);

    // Sink (centre)
    const sk = new Graphics();
    sk.roundRect(KW / 2 - 72, ctY - 12, 144, 28, 4).fill({ color: shade(pal.counter, -0.07) });
    sk.roundRect(KW / 2 - 68, ctY - 8, 136, 22, 3).fill({ color: num("#C0BCBA"), alpha: 0.55 });
    // Faucet
    sk.rect(KW / 2 - 4, ctY - 38, 8, 30).fill({ color: isModern ? num("#909090") : num("#B5915A") });
    sk.ellipse(KW / 2, ctY - 38, 16, 7).fill({ color: isModern ? num("#808080") : num("#9A7840") });
    c.addChild(sk);

    // Stove (left of sink)
    const stove = new Graphics();
    const stX = Math.round(KW * 0.10);
    stove.roundRect(stX, ctY - 10, 120, 26, 3).fill({ color: isModern ? num("#3A3A3A") : num("#EEE6D8") });
    stove.circle(stX + 30, ctY + 3, 14).fill({ color: isModern ? num("#252525") : num("#D8D0C0") });
    stove.circle(stX + 90, ctY + 3, 14).fill({ color: isModern ? num("#252525") : num("#D8D0C0") });
    stove.circle(stX + 30, ctY + 3, 8).fill({ color: isModern ? num("#181818") : num("#C8C0B0") });
    stove.circle(stX + 90, ctY + 3, 8).fill({ color: isModern ? num("#181818") : num("#C8C0B0") });
    c.addChild(stove);

    // Cup with steam (bonus delta)
    if (withBonus) {
      const cupX = KW - 110, cupY = ctY - 48;
      const cupG = new Graphics();
      cupG.roundRect(cupX, cupY + 22, 42, 32, 4).fill({ color: isModern ? num("#2E2E2E") : num("#F0E8D8") });
      cupG.roundRect(cupX, cupY + 22, 42, 32, 4).stroke({ width: 2, color: num("#B5915A") });
      cupG.ellipse(cupX + 21, cupY + 54, 21, 7).fill({ color: shade(pal.counter, 0.08) });
      cupG.moveTo(cupX + 40, cupY + 30).quadraticCurveTo(cupX + 55, cupY + 38, cupX + 40, cupY + 50)
        .stroke({ width: 3, color: num("#B5915A") });
      c.addChild(cupG);
      // Steam
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

  function setKitchen(sIdx: number, cIdx: number, tIdx: number, withBonus = false): void {
    kitchenLayer.removeChild(kitchenCont);
    kitchenCont.destroy({ children: true });
    kitchenCont = buildKitchen(sIdx, cIdx, tIdx, withBonus);
    kitchenLayer.addChild(kitchenCont);
  }

  // ── Wipe line (hook split: Modern left, Farmhouse right) ──────────────────
  const wipeCont = new Container();
  bgLayer.addChild(wipeCont);

  function buildWipeRight(splitX: number): void {
    wipeCont.removeChildren().forEach(cc => cc.destroy());
    // splitX is in local kitchen scene coords (KW wide, offset SAFE_PAD from left)
    // We draw the wipe overlay on top of the kitchen at offset SAFE_PAD
    const absX = splitX + SAFE_PAD; // absolute x in DW coords
    if (absX >= DW - 4) return;
    const sliceW = KW - splitX;
    // Farmhouse wall slice — drawn in local KW coords, positioned at SAFE_PAD
    const g = new Graphics();
    g.rect(splitX, 0, sliceW, KITCHEN_H).fill({ color: num("#F2ECE0") });
    // Upper cabinets hint (cream shaker)
    const ucY  = Math.round(KITCHEN_H * 0.07);
    const ucH  = Math.round(KITCHEN_H * 0.20);
    g.roundRect(KW * 0.72, ucY, KW * 0.28, ucH, 8).fill({ color: num("#E8E0D0") });
    // Backsplash hint (subway tile)
    const splY = Math.round(KITCHEN_H * 0.285), splH = Math.round(KITCHEN_H * 0.17);
    const sw = 64, sh = 28;
    for (let row = 0; row <= Math.ceil(splH / sh); row++) {
      const xo = row % 2 === 0 ? 0 : sw / 2;
      for (let col = -1; col <= Math.ceil(KW / sw) + 1; col++) {
        const bx = col * sw + xo + 1;
        if (bx + sw - 2 < splitX) continue;
        g.roundRect(bx + 1, splY + row * sh + 2, sw - 2, sh - 4, 3)
          .fill({ color: (col + row) % 2 === 0 ? num("#F0E8DC") : num("#C8B8A4") });
      }
    }
    // Counter
    const ctY = Math.round(KITCHEN_H * 0.455);
    g.roundRect(splitX, ctY, sliceW, 26, 0).fill({ color: num("#F5EDE0") });
    // Lower cabs
    const floorY = Math.round(KITCHEN_H * 0.67);
    g.rect(splitX, ctY + 26 + 7, sliceW, floorY - (ctY + 26 + 7)).fill({ color: num("#E8E0D0") });
    // Floor
    g.rect(splitX, floorY, sliceW, KITCHEN_H - floorY).fill({ color: num("#B8A880") });
    // Position the overlay to match the kitchen scene (which is also offset by SAFE_PAD)
    g.x = SAFE_PAD;
    wipeCont.addChild(g);
    // Divider line + arrow (in absolute DW coords)
    const line = new Graphics();
    line.rect(absX - 2, 0, 4, KITCHEN_H).fill({ color: PRIMARY });
    line.poly([absX - 14, KITCHEN_H / 2 - 22, absX + 14, KITCHEN_H / 2, absX - 14, KITCHEN_H / 2 + 22])
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
    if (absX > 60 + SAFE_PAD)  mkLabel("Modern",    absX / 2);
    if (absX < DW - 60 - SAFE_PAD) mkLabel("Farmhouse", absX + (DW - SAFE_PAD - absX) / 2);
  }

  // wipeX is in KW (local kitchen scene) coords: 0..KW
  let wipeX = KW / 2;
  let wipeTween: gsap.core.Tween | null = null;

  function startWipe(): void {
    wipeX = KW / 2;
    buildWipeRight(wipeX);
    // Proxy object so we can tween wipeX (in local KW coords)
    const proxy = { x: wipeX };
    wipeTween = gsap.to(proxy, {
      x: KW * 0.28,
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
    wipeCont.removeChildren().forEach(cc => cc.destroy());
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  // Top thin bar: just the progress track (keeps the kitchen unobscured).
  // Step label: shown in the bottom zone above the swatches.
  const hudCont   = new Container();
  const progBg    = new Graphics();
  const progFill  = new Graphics();
  // Step label lives in the bottom zone
  const stepLabel = new Text({
    text: "",
    style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 24, align: "center", wordWrap: true, wordWrapWidth: DW - 48 },
  });
  stepLabel.anchor.set(0.5, 0.5);

  function buildHud(): void {
    hudCont.removeChildren();
    // Top progress bar — very thin, sits above the kitchen (minimal intrusion)
    progBg.clear();
    progFill.clear();
    const barBg = new Graphics().roundRect(0, 0, DW, 8, 0).fill({ color: 0x000000, alpha: 0.35 });
    hudCont.addChild(barBg);
    progBg.roundRect(0, 0, DW, 8, 0).fill({ color: 0x000000, alpha: 0.22 });
    hudCont.addChild(progBg, progFill);
    uiLayer.addChild(hudCont);
    // Step instruction label in the bottom zone — centred between separator and cards
    // SWATCH_ZONE_Y = 800; CARDS_Y = 846; midpoint ≈ 823
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
  // The bottom 160px zone hosts swatches + instruction text.
  const bottomZoneBg = new Graphics();
  bottomZoneBg.rect(0, KITCHEN_H, DW, DH - KITCHEN_H).fill({ color: num("#1E1E1E") });
  // Separator line
  bottomZoneBg.rect(0, KITCHEN_H, DW, 4).fill({ color: PRIMARY, alpha: 0.55 });
  bgLayer.addChild(bottomZoneBg);

  // ── Swatch cards (bottom zone 160px, starts at SWATCH_ZONE_Y = 800) ──────
  let swatchCont: Container | null = null;
  let _pickHandler: ((e: { global: { x: number; y: number } }) => void) | null = null;

  // Bottom zone = 160px (KITCHEN_H to DH = 800..960).
  // Layout: 4px separator → 20px "Tap your favorite" instruction → 8px gap → 72px tall cards → padding.
  // Cards start at SWATCH_ZONE_Y + 28 (label area) + 8 gap = SWATCH_ZONE_Y + 36.
  const CARD_H = 80;   // ≥72px per spec
  const CARD_GAP = 14;
  // Card width: fit two cards with gap inside DW-40 (20px side padding each)
  const CARD_W = Math.floor((DW - 40 - CARD_GAP) / 2);
  const CARDS_Y = SWATCH_ZONE_Y + 46; // leaves ~46px for label+gap above cards
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

    // Card background — full CARD_H height
    const bg = new Graphics()
      .roundRect(0, 0, CARD_W, CARD_H, 10)
      .fill({ color: num("#F5EFE3"), alpha: 0.18 })
      .stroke({ width: 2.5, color: PRIMARY });
    sC.addChild(bg);

    // Horizontal layout: left swatch strip (40px wide) + label on right
    const swatchW = Math.round(CARD_W * 0.38);
    const sG = new Graphics().roundRect(6, 6, swatchW, CARD_H - 12, 6).fill({ color: col });
    // Pattern hint overlay inside swatch
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

    // Label text — right side of card
    const lblX = swatchW + 10;
    const lblAreaW = CARD_W - swatchW - 16;
    const lbl = new Text({ text: label, style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 20, align: "center" } });
    lbl.anchor.set(0.5, 0.5);
    lbl.position.set(lblX + lblAreaW / 2, CARD_H / 2 - 8);
    fit(lbl, lblAreaW);
    sC.addChild(lbl);

    // "Tap to pick" sub-label
    const tapLbl = new Text({ text: "Tap to pick", style: { fill: TXT, fontFamily: FONT, fontSize: 12, align: "center" } });
    tapLbl.alpha = 0.68;
    tapLbl.anchor.set(0.5, 0);
    tapLbl.position.set(lblX + lblAreaW / 2, CARD_H / 2 + 10);
    sC.addChild(tapLbl);

    // Bounce pulse
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
      // Map global pointer to design space
      const scale = root.scale.x || 1;
      const offX  = root.x || 0;
      const offY  = root.y || 0;
      const dx = (e.global.x - offX) / scale;
      const dy = (e.global.y - offY) / scale;
      // Check which card was tapped
      for (let idx = 0; idx <= 1; idx++) {
        const cx = idx === 0 ? CARD_L_X : CARD_R_X;
        if (dx >= cx && dx <= cx + CARD_W && dy >= CARDS_Y && dy <= CARDS_Y + CARD_H) {
          onPick(idx);
          return;
        }
      }
      // Fallback: split at centre of design canvas
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
      .to(circle.scale, { x: 1,    y: 1,    duration: 0.18, ease: "power2.out" }, ">")
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

  // ── Camera push-in / pull-back ─────────────────────────────────────────────
  function cameraPushIn(onDone: () => void): void {
    gsap.timeline({ onComplete: onDone })
      .to(kitchenLayer.scale, { x: 1.06, y: 1.06, duration: 0.24, ease: "power2.out" })
      .to(kitchenLayer, { x: -(DW * 0.03), y: -(DH * 0.02), duration: 0.24, ease: "power2.out" }, 0)
      .to(kitchenLayer.scale, { x: 1, y: 1, duration: 0.28, ease: "power2.inOut" }, 0.24)
      .to(kitchenLayer, { x: 0, y: 0, duration: 0.28, ease: "power2.inOut" }, 0.24);
  }

  function cameraPullBack(onDone: () => void): void {
    gsap.timeline({ onComplete: onDone })
      .to(kitchenLayer.scale, { x: 0.94, y: 0.94, duration: 0.35, ease: "power2.out" })
      .to(kitchenLayer, { x: DW * 0.03, y: DH * 0.03, duration: 0.35, ease: "power2.out" }, 0)
      .to(kitchenLayer.scale, { x: 1, y: 1, duration: 0.3, ease: "power2.inOut" }, 0.35)
      .to(kitchenLayer, { x: 0, y: 0, duration: 0.3, ease: "power2.inOut" }, 0.35);
  }

  // ── Tile cascade effect on backsplash area ─────────────────────────────────
  function tileCascade(onDone: () => void): void {
    const splY = Math.round(KITCHEN_H * 0.285), splH = Math.round(KITCHEN_H * 0.17);
    const tw = 50, th = 20;
    const cols = Math.ceil(DW / tw) + 1;
    const rows = Math.ceil(splH / th) + 1;
    const total = rows * cols;
    let done = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const t = new Graphics()
          .roundRect(1, 1, tw - 2, th - 2, 2)
          .fill({ color: (col + row) % 2 === 0 ? num("#F5F0EB") : num("#E0D8D0") });
        t.position.set(col * tw, splY - th - 40);
        t.alpha = 0;
        fxLayer.addChild(t);
        const delay = (row * cols + col) * 0.016;
        gsap.to(t, { y: splY + row * th, alpha: 1, duration: 0.28, delay, ease: "bounce.out" });
        gsap.to(t, {
          alpha: 0, duration: 0.28, delay: delay + 0.44,
          onComplete: () => {
            fxLayer.removeChild(t); t.destroy();
            done++;
            if (done === total) onDone();
          },
        });
      }
    }
  }

  // ── FSM ───────────────────────────────────────────────────────────────────
  function goStep1(): void {
    state    = "step1";
    busy     = false;
    idleAccum = idleCount = 0;
    stopWipe();
    // Clear any hook-state bottom-zone content (headline, tap button)
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
      setKitchen(pickStyle, 0, 0);
      sparkle(DW / 2, KITCHEN_H / 2);
      gsap.delayedCall(0.3, () => {
        drawProgress(0.33);
        gsap.delayedCall(0.2, goStep2);
      });
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
      shimmer(DW, KITCHEN_H);
      setKitchen(pickStyle, pickCt, 0);
      cameraPushIn(() => {
        sparkle(DW / 2, Math.round(KITCHEN_H * 0.455));
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
      tileCascade(() => {
        setKitchen(pickStyle, pickCt, pickTile);
        sparkle(DW / 2, Math.round(KITCHEN_H * 0.285));
        // Lighting warmth flash
        const warm = new Graphics().rect(0, 0, DW, KITCHEN_H).fill({ color: num("#FFE080"), alpha: 0 });
        fxLayer.addChild(warm);
        gsap.to(warm, { alpha: 0.14, duration: 0.5, yoyo: true, repeat: 1, onComplete: () => { fxLayer.removeChild(warm); warm.destroy(); } });
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
    setKitchen(pickStyle, pickCt, pickTile, true);

    cameraPullBack(() => {
      busy = false;
      gsap.delayedCall(REVEAL_HOLD, showEndcard);
    });

    // Reveal banner — archetype + choice line
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
    hideGhostFinger();
    clearSwatches();
    overlayLayer.removeChildren().forEach(cc => cc.destroy());

    // Dim scrim
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

    // Kitchen thumbnail
    const thumbW = pw - 50, thumbH = 118;
    const thumbY = -ph / 2 + 90;
    const pal = kitchenPalette(pickStyle, pickCt);
    const [tA] = tileColors(pickTile, pickStyle);
    const th = new Graphics();
    th.roundRect(0, 0, thumbW, thumbH, 8).fill({ color: pal.wall });
    // Mini upper cabs
    th.roundRect(0, 4, thumbW * 0.26, thumbH * 0.48, 4).fill({ color: pal.cabinet });
    th.roundRect(thumbW * 0.74, 4, thumbW * 0.26, thumbH * 0.48, 4).fill({ color: pal.cabinet });
    // Mini backsplash
    th.rect(0, thumbH * 0.37, thumbW, thumbH * 0.25).fill({ color: tA, alpha: 0.75 });
    // Countertop
    th.roundRect(0, thumbH * 0.62, thumbW, thumbH * 0.09, 2).fill({ color: pal.counter });
    // Lower cabs + floor
    th.rect(0, thumbH * 0.71, thumbW, thumbH * 0.14).fill({ color: pal.cabinet });
    th.rect(0, thumbH * 0.85, thumbW, thumbH * 0.15).fill({ color: pal.floor });
    const thumbCont = new Container();
    thumbCont.addChild(th);
    thumbCont.position.set(-thumbW / 2, thumbY);
    panel.addChild(thumbCont);

    // Archetype name
    const arcL = new Text({ text: ARCHETYPES[pickStyle]?.[pickCt]?.[pickTile] ?? "The Modern Purist",
      style: { fill: num(cfg.style.colors.background), fontFamily: FONT, fontWeight: "bold", fontSize: 26, align: "center" } });
    arcL.anchor.set(0.5);
    arcL.position.set(0, thumbY + thumbH + 24);
    fit(arcL, pw - 48);
    panel.addChild(arcL);

    // Choice line
    const choiceL = new Text({ text: `${STYLE_NAMES[pickStyle]} · ${CT_NAMES[pickCt]} · ${TILE_NAMES[pickTile]}`,
      style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: 19, align: "center" } });
    choiceL.anchor.set(0.5);
    choiceL.position.set(0, thumbY + thumbH + 58);
    fit(choiceL, pw - 60);
    panel.addChild(choiceL);

    // Endcard copy
    const endL = new Text({ text: "Designed with professional designers — book your free consult.",
      style: { fill: num(cfg.style.colors.background), fontFamily: FONT, fontSize: 16, align: "center", wordWrap: true, wordWrapWidth: pw - 60 } });
    endL.anchor.set(0.5);
    endL.position.set(0, thumbY + thumbH + 94);
    fit(endL, pw - 60);
    panel.addChild(endL);

    // Trust slots (max 2)
    const mkTrust = (txt: string, yOff: number) => {
      const t = new Text({ text: txt,
        style: { fill: num("#2E6B2E"), fontFamily: FONT, fontWeight: "bold", fontSize: 15, align: "center" } });
      t.anchor.set(0.5);
      t.position.set(0, yOff);
      panel.addChild(t);
    };
    mkTrust("✓ professional designers",      ph / 2 - 178);
    mkTrust("✓ free consult, no obligation", ph / 2 - 156);

    // CTA — bottom thumb zone, ≥44px tall
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

    // Disclaimer (≥10px, readable)
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
    // Re-flash the hint
    setHint(
      state === "step1" ? "Tap your favorite style" :
      state === "step2" ? "Pick your countertop (2/3)" :
                          "Choose your backsplash (3/3)",
    );
    // Ghost-finger appears on 2nd idle cycle
    if (idleCount >= AUTO_DEMO_AFTER && ghostFinger === null) {
      const gfX = CARD_L_X + CARD_W / 2;
      const gfY = CARDS_Y + CARD_H / 2;
      showGhostFinger(gfX, gfY);
    }
    // Auto-demo: fire a pick on 3rd+ idle (suppressed in dbg mode so QA screenshots are stable)
    if (idleCount >= AUTO_DEMO_AFTER + 1 && !/dbg/.test(location.search)) {
      idleCount = 0;
      hideGhostFinger();
      _pickHandler?.({ global: { x: 0, y: CARDS_Y + CARD_H / 2 } }); // picks idx 0 (left card)
    }
  });

  // ── Hook: wipe-line split-screen + swatches immediately visible ──────────
  // Per spec: NO intro panel, NO "Tap to Begin". From second 0 the player sees:
  //   - full kitchen with oscillating wipe (Modern ↔ Farmhouse)
  //   - two style swatches in the bottom 160px strip
  //   - ghost finger taps one swatch at ~2.5s idle
  //   - first tap on a swatch applies the style and advances to step 2
  function startHook(): void {
    state     = "step1";   // go straight to step1 (hook IS step1)
    busy      = false;
    idleAccum = idleCount = 0;
    clearSwatches();
    hideGhostFinger();
    overlayLayer.removeChildren().forEach(cc => cc.destroy());
    uiLayer.removeChildren();
    swatchLayer.removeChildren();

    buildHud();
    setKitchen(0, 0, 0);   // Modern as the base (wipe shows Farmhouse half)
    drawProgress(0.05);
    setHint("Tap your favorite style");
    startWipe();             // start oscillating wipe immediately

    // Show swatches right away — tapping one picks the style and advances
    showSwatches(1, (idx) => {
      if (busy || state !== "step1") return;
      busy = true;
      hideGhostFinger();
      pickStyle = idx;
      clearSwatches();
      stopWipe();
      setKitchen(pickStyle, 0, 0);
      sparkle(DW / 2, KITCHEN_H / 2);
      gsap.delayedCall(0.3, () => {
        drawProgress(0.33);
        gsap.delayedCall(0.2, goStep2);
      });
    });
    // Idle ticker handles ghost-finger + auto-demo from here
  }

  // ── Layout (design canvas → viewport, contain) ────────────────────────────
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

  // 2nd-paint workaround (Pixi v8 shader-race)
  app.renderer.render(app.stage);
  requestAnimationFrame(() => { layout(); app.renderer.render(app.stage); });
}

// Static validator: confirm CTA is wired
void (() => window.FbPlayableAd.onCTAClick);

main().catch((e) => {
  console.error("Dream Kitchen Three Picks boot error:", e);
});
