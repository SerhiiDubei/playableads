// Home Kitchen Hotspot Stamp — insurance hotspot inspection playable.
// PixiJS v8 + GSAP. Sprite-backed visuals with procedural fallback. Portrait 9:16 (540×960).
//
// Mechanic: 5 hotspot points on a painted kitchen view.
//   4 = sudden & accidental damage (TYPICALLY COVERED + qualifier)
//   1 = decoy old slow seep (NOT TYPICALLY COVERED — ask about add-ons)
// Each tap reveals a damage dissolve + stamp. Escalating combo sparks.
// Hook: ceiling stain spreads + drip into bucket in first 800ms.
// Ghost finger after 1.5–2s idle. Endcard: free home review CTA + disclaimer.
//
// Boot hardening: preloadTextures uses onload/onerror (never img.decode()).
// antialias: false — MSAA breaks shader compile in embedded WebGL.
// Layout from window.innerWidth/innerHeight, never app.screen at init time.
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

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

// ── Style tokens ─────────────────────────────────────────────────────────────
const BG = num(cfg.style.colors.background);       // #FAF3E7 cream
const PRIMARY = num(cfg.style.colors.primary);     // #8FA888 sage green
const ACCENT = num(cfg.style.colors.accent);       // #D96C47 terracotta
const TXT = cfg.style.colors.text;                // #3a2418 dark brown
const FONT = cfg.style.font.family;

// ── Neutral ring color (same for ALL hotspots before tap) ────────────────────
const RING_NEUTRAL = num("#A09070");

// ── Tunables ──────────────────────────────────────────────────────────────────
const IDLE_HINT = Number(cfg.params.idleHintMs ?? 2000);
const AUTO_DEMO_AFTER = Number(cfg.params.autoDemoAfterIdles ?? 2);
const REVEAL_HOLD = Number(cfg.params.revealHoldMs ?? 2500);
const GHOST_DELAY = Number(cfg.params.ghostDelayMs ?? 1500);

// ── Design canvas ─────────────────────────────────────────────────────────────
const DW = 540, DH = 960;

// ── Safe padding ──────────────────────────────────────────────────────────────
const SAFE_PAD = 10;

// ── Zone heights ──────────────────────────────────────────────────────────────
const TOP_HUD_H = 80;
const BOT_STRIP_H = 80;

// ── Texture cache ─────────────────────────────────────────────────────────────
const TEX: Record<string, Texture> = {};

async function preloadTextures(): Promise<void> {
  await Promise.all(
    Object.entries(cfg.assets).map(([k, uri]) => {
      if (!/\.(webp|png)$/i.test(k)) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          try { TEX[k] = Texture.from(img); } catch { /* ignore */ }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = uri as string;
      });
    })
  );
}

function tex(key: string): Texture | null {
  return TEX[key] ?? null;
}

// ── Sprite-or-fallback helper ──────────────────────────────────────────────────
// Creates a Sprite from texture if available, scaled to targetW.
// Returns null if texture not available (caller falls back to procedural).
function makeSprite(key: string, targetW: number): Sprite | null {
  const t = tex(key);
  if (!t) return null;
  const sp = new Sprite(t);
  sp.anchor.set(0.5);
  sp.scale.set(targetW / t.width);
  return sp;
}

// Background cover-fit
function makeBgSprite(key: string, canvasW: number, canvasH: number): Sprite | null {
  const t = tex(key);
  if (!t) return null;
  const sp = new Sprite(t);
  sp.anchor.set(0.5);
  const s = Math.max(canvasW / t.width, canvasH / t.height);
  sp.scale.set(s);
  sp.position.set(canvasW / 2, canvasH / 2);
  return sp;
}

// ── Hotspot definitions ────────────────────────────────────────────────────────
// Positions are mapped to the painted art.
// kitchen-bg.webp is 540×960 designed canvas, so 1:1 pixel mapping.
//
// Art landmark reading (from kitchen-bg.webp visual inspection):
//   - Ceiling vent strip: center x≈400, y≈38 (top strip, right-of-center)
//   - Window pane center: x≈380, y≈255 (upper-right)
//   - Sink/faucet center: x≈215, y≈470 (center-left counter)
//   - Lower-left cabinet: x≈75, y≈680 (lower-left base cabinet)
//   - Dishwasher: x≈472, y≈680 (right-side stainless unit)
//
// All y values are in design canvas absolute (not offset by TOP_HUD_H here;
// the hotspot layer is drawn in root space where y=0 is top of canvas).
// We add TOP_HUD_H offset via the play-area position logic.

interface HotspotDef {
  id: string;
  x: number; y: number; r: number;
  type: "covered" | "decoy";
  label: string;
  sublabel: string;
  infoLine: string;
  color: number;
  // damage sprite key + target width
  dmgKey: string;
  dmgW: number;
  // optional rotation for the damage sprite (radians)
  dmgRot?: number;
  // offset from hotspot center for damage sprite
  dmgOX?: number;
  dmgOY?: number;
}

// Hotspot x,y are in DESIGN canvas space (0,0 = top-left of full 540×960 canvas).
//
// kitchen-bg.webp is 540×810. Cover-fit to 540×960 scales it by 960/810 ≈ 1.185,
// centered. Mapping: canvasX = (imgX-270)*1.185+270, canvasY = (imgY-405)*1.185+480.
//
// Art landmark positions (image px → canvas px):
//   ceiling vent strip: img(400,35) → canvas(424, 42)
//   window center:       img(395,215)→ canvas(418, 255)
//   sink/faucet:         img(215,395)→ canvas(205, 468)
//   lower-left cabinet:  img( 80,570)→ canvas( 45, 676)
//   dishwasher front:    img(478,570)→ canvas(517, 676)
const HOTSPOTS: HotspotDef[] = [
  {
    // Ceiling vent strip — at the very top of the art. Hot-spot ring placed just
    // BELOW the HUD bar (y=92) so the ring is tappable; damage stain sprite has
    // a negative dmgOY so it visually sits ON the ceiling vent above the HUD.
    id: "ceiling",
    x: 424, y: 92,
    r: 42,
    type: "covered",
    label: "TYPICALLY COVERED",
    sublabel: "varies by policy",
    infoLine: "Avg. repair: $1,800",
    color: num("#8b7355"),
    dmgKey: "dmg-stain.webp",
    dmgW: 170,
    dmgOX: 0, dmgOY: 20,  // stain center at y=112, clearly below HUD bar
  },
  {
    // Window pane — upper right
    id: "window",
    x: 418, y: 248,
    r: 44,
    type: "covered",
    label: "TYPICALLY COVERED",
    sublabel: "varies by policy",
    infoLine: "Storm damage covered",
    color: num("#a0c4dc"),
    dmgKey: "window-crack.webp",
    dmgW: 105,
    dmgOX: 0, dmgOY: 0,
  },
  {
    // Sink/faucet — center-left on the counter
    id: "pipe",
    x: 210, y: 468,
    r: 46,
    type: "covered",
    label: "TYPICALLY COVERED",
    sublabel: "varies by policy",
    infoLine: "Avg. repair: $2,400",
    color: num("#4a7fc1"),
    dmgKey: "dmg-spray.webp",
    dmgW: 150,
    dmgOX: 0, dmgOY: -15,
  },
  {
    // Lower-left cabinet — keep x≥50 so ring stays on canvas
    id: "seep",
    x: 68, y: 672,
    r: 40,
    type: "decoy",
    label: "NOT TYPICALLY COVERED",
    sublabel: "ask about add-ons",
    infoLine: "Slow seep = maintenance issue",
    color: num("#7a6648"),
    dmgKey: "dmg-puddle.webp",
    dmgW: 100,
    dmgOX: 0, dmgOY: 18,
  },
  {
    // Dishwasher — right side. Pull in from edge so sprite is not clipped.
    id: "dishwasher",
    x: 494, y: 672,
    r: 40,
    type: "covered",
    label: "TYPICALLY COVERED",
    sublabel: "varies by policy",
    infoLine: "Appliance overflow covered",
    color: num("#5b9bd5"),
    dmgKey: "dmg-foam.webp",
    dmgW: 120,
    dmgOX: -12, dmgOY: -24,
  },
];

// ── Game state ────────────────────────────────────────────────────────────────
type GameState = "intro" | "playing" | "reveal" | "end";

async function main(): Promise<void> {
  // Preload before building scene
  await preloadTextures();

  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    background: BG,
    antialias: false,
    preference: "webgl",
    resolution: 1,
    autoDensity: false,
  });
  app.canvas.style.width = window.innerWidth + "px";
  app.canvas.style.height = window.innerHeight + "px";
  document.body.appendChild(app.canvas);

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // ── Layers: bg → kitchen → damage → hotspots → fx → ui → overlay ────────
  const root = new Container();
  app.stage.addChild(root);
  const bgLayer = new Container();
  const kitchenLayer = new Container();
  const damageLayer = new Container();
  const hotspotLayer = new Container();
  const fxLayer = new Container();
  const uiLayer = new Container();
  const overlayLayer = new Container();
  root.addChild(bgLayer, kitchenLayer, damageLayer, hotspotLayer, fxLayer, uiLayer, overlayLayer);

  kitchenLayer.interactiveChildren = false;
  damageLayer.interactiveChildren = false;
  hotspotLayer.interactiveChildren = false;
  fxLayer.interactiveChildren = false;

  // ── State ──────────────────────────────────────────────────────────────────
  let gameState: GameState = "intro";
  let idleAccum = 0;
  let idleCount = 0;
  let tappedCount = 0;
  const tappedIds = new Set<string>();

  // ── Ghost finger ──────────────────────────────────────────────────────────
  let ghostCont: Container | null = null;

  function showGhost(): void {
    if (ghostCont) return;
    const hs = HOTSPOTS.find((h) => !tappedIds.has(h.id));
    if (!hs) return;
    const g = new Container();
    const circle = new Graphics()
      .circle(0, 0, 30)
      .fill({ color: 0xffffff, alpha: 0.5 })
      .circle(0, 0, 22)
      .fill({ color: 0xffffff, alpha: 0.7 });
    const finger = new Graphics()
      .roundRect(-10, -24, 20, 46, 10)
      .fill({ color: num("#f5c9a0"), alpha: 0.92 })
      .roundRect(-10, -24, 20, 22, 10)
      .fill({ color: num("#e8b48a"), alpha: 0.5 });
    finger.position.set(0, -8);
    g.addChild(circle, finger);
    g.position.set(hs.x, hs.y);
    g.alpha = 0;
    fxLayer.addChild(g);
    ghostCont = g;
    gsap.timeline({ repeat: -1 })
      .to(g, { alpha: 1, duration: 0.3 })
      .to(g, { y: hs.y + 10, duration: 0.5, ease: "power2.inOut" })
      .to(g, { y: hs.y, duration: 0.4, ease: "power2.inOut" })
      .to(g, { alpha: 0, duration: 0.3 });
  }

  function hideGhost(): void {
    if (!ghostCont) return;
    gsap.killTweensOf(ghostCont);
    ghostCont.destroy();
    ghostCont = null;
  }

  // ── Background: sprite kitchen or procedural fallback ─────────────────────
  // Ceiling stain Graphics refs for hook animation
  let ceilingStainGfx!: Graphics;
  // Sprite refs
  let ceilingDmgSprite: Sprite | null = null;
  // Drop animation
  let dropGfx!: Graphics;
  let dropY = 0;
  let dropAnimActive = false;
  let bucketSprite: Sprite | null = null;
  // Bucket procedural container
  let dropBucket!: Container;

  // Drip animation: falls from ceiling stain bottom to bucket.
  // Ceiling hs y=92, dmgOY=+20 → stain center y=112. Stain height ~80px → bottom ≈ y=152.
  const DRIP_START_Y = 150;
  const DRIP_END_Y = 640;   // counter level where bucket sits
  const DRIP_X = 424;       // matches ceiling hotspot x

  function buildBackground(): void {
    // ── SPRITE background ──────────────────────────────────────────────────
    const bgSp = makeBgSprite("kitchen-bg.webp", DW, DH);
    if (bgSp) {
      bgLayer.addChild(bgSp);
      // Ambient warm shimmer overlay (subtle)
      const shimmer = new Graphics()
        .rect(0, 0, DW, DH)
        .fill({ color: num("#FFF8E8"), alpha: 0 });
      bgLayer.addChild(shimmer);
      // Subtle ambient pulse so scene never looks static
      gsap.to(shimmer, { alpha: 0.06, duration: 3, yoyo: true, repeat: -1, ease: "sine.inOut" });
    } else {
      // ── PROCEDURAL fallback ────────────────────────────────────────────
      const bg = new Graphics();
      bg.rect(0, 0, DW, DH).fill({ color: num("#F5EDD8") });
      bgLayer.addChild(bg);
    }
  }

  // ── Kitchen layer: bucket sprite and drip setup ──────────────────────────
  function buildKitchen(): void {
    // When using sprite bg, we only need damage overlays and the bucket/drip
    // If no bg sprite — build full procedural kitchen
    const hasBg = !!tex("kitchen-bg.webp");

    if (!hasBg) {
      buildProceduralKitchen();
    }

    // ── Bucket (sprite or procedural) — placed under ceiling drip zone ──
    const bucketSp = makeSprite("bucket.webp", 68);
    if (bucketSp) {
      bucketSp.position.set(DRIP_X, DRIP_END_Y + 28);
      bucketSp.alpha = 1;
      kitchenLayer.addChild(bucketSp);
      bucketSprite = bucketSp;
      // Slight ambient sway
      gsap.to(bucketSp, { rotation: 0.04, duration: 2, yoyo: true, repeat: -1, ease: "sine.inOut" });
    } else {
      // Procedural bucket fallback
      dropBucket = new Container();
      const bucket = new Graphics();
      const bY = DRIP_END_Y;
      bucket.poly([DRIP_X - 22, bY - 28, DRIP_X + 22, bY - 28, DRIP_X + 34, bY, DRIP_X - 34, bY])
        .fill({ color: num("#7A9090") });
      bucket.poly([DRIP_X - 22, bY - 28, DRIP_X + 22, bY - 28, DRIP_X + 26, bY - 32, DRIP_X - 26, bY - 32])
        .fill({ color: num("#A0B8B8") });
      bucket.ellipse(DRIP_X, bY, 34, 9).fill({ color: num("#688080") });
      dropBucket.addChild(bucket);
      kitchenLayer.addChild(dropBucket);
    }

    // Drop graphics
    dropGfx = new Graphics();
    dropY = DRIP_START_Y;
    kitchenLayer.addChild(dropGfx);
  }

  // ── Procedural kitchen (full fallback when no bg sprite) ─────────────────
  const KY = 0;
  const KPAD = SAFE_PAD;

  function buildProceduralKitchen(): void {
    const wall = num("#EDE0C8");
    const cabinetColor = num("#C8B990");
    const cabinetDark = num("#A89870");
    const counterTop = num("#D4C4A0");
    const counterFront = num("#C0AE88");
    const floorColor = num("#C4B898");
    const floorGrout = num("#B0A080");

    const g = new Graphics();
    const playH = DH - BOT_STRIP_H;
    g.rect(KPAD, KY + playH - 200, DW - KPAD * 2, 200).fill({ color: floorColor });
    for (let x = KPAD; x < DW - KPAD; x += 90) {
      g.moveTo(x, KY + playH - 200).lineTo(x, KY + playH).stroke({ width: 1.5, color: floorGrout, alpha: 0.5 });
    }
    for (let y = KY + playH - 200; y < KY + playH; y += 90) {
      g.moveTo(KPAD, y).lineTo(DW - KPAD, y).stroke({ width: 1.5, color: floorGrout, alpha: 0.5 });
    }
    g.rect(KPAD, KY, DW - KPAD * 2, playH - 200).fill({ color: wall });

    // Cabinets
    g.roundRect(KPAD + 20, KY + TOP_HUD_H + 4, 220, 180, 6).fill({ color: cabinetColor });
    g.roundRect(KPAD + 20, KY + TOP_HUD_H + 4, 220, 180, 6).stroke({ width: 3, color: cabinetDark });
    g.roundRect(KPAD + 28, KY + TOP_HUD_H + 12, 100, 164, 4).fill({ color: shade(cabinetColor, 0.07) });
    g.roundRect(KPAD + 132, KY + TOP_HUD_H + 12, 100, 164, 4).fill({ color: shade(cabinetColor, 0.07) });

    // Counter
    g.rect(KPAD, KY + TOP_HUD_H + 360, DW - KPAD * 2, 60).fill({ color: counterTop });
    g.rect(KPAD, KY + TOP_HUD_H + 420, DW - KPAD * 2, 260).fill({ color: counterFront });

    // Window
    const win = new Graphics();
    const WX = DW - KPAD - 160, WY = KY + TOP_HUD_H + 20, WW = 130, WH = 160;
    win.roundRect(WX, WY, WW, WH, 10).fill({ color: num("#B8D8E8") });
    win.roundRect(WX, WY, WW, WH, 10).stroke({ width: 8, color: num("#E0D0B0") });
    win.rect(WX + WW / 2 - 3, WY, 6, WH).fill({ color: num("#E0D0B0") });
    win.rect(WX, WY + WH / 2 - 3, WW, 6).fill({ color: num("#E0D0B0") });

    // Ceiling stain procedural
    ceilingStainGfx = new Graphics();
    ceilingStainGfx.ellipse(DRIP_X, DRIP_START_Y, 60, 14).fill({ color: num("#C4A878"), alpha: 0.55 });

    kitchenLayer.addChild(g, win, ceilingStainGfx);
  }

  // ── Damage overlays (per hotspot) ─────────────────────────────────────────
  // Start VISIBLE (alpha=1), dissolve + particles on tap
  const damageOverlays: Map<string, Container> = new Map();

  function buildDamageOverlays(): void {
    for (const hs of HOTSPOTS) {
      const cont = new Container();

      // Try sprite first
      const sp = makeSprite(hs.dmgKey, hs.dmgW);
      if (sp) {
        if (hs.dmgRot) sp.rotation = hs.dmgRot;
        sp.position.set(hs.dmgOX ?? 0, hs.dmgOY ?? 0);
        sp.alpha = hs.id === "ceiling" ? 0.92 : 0.88;
        cont.addChild(sp);

        // If this is the ceiling stain — store ref for hook animation
        if (hs.id === "ceiling") {
          ceilingDmgSprite = sp;
          // Start at 85% scale, hook grows it to full size
          const t = tex(hs.dmgKey);
          const fullScale = t ? (hs.dmgW / t.width) : 1;
          sp.scale.set(fullScale * 0.85);
        }
      } else {
        // Procedural fallback per hotspot
        const g = new Graphics();
        buildProceduralDamage(hs, g);
        cont.addChild(g);
        if (hs.id === "ceiling") {
          ceilingStainGfx = g;
        }
      }

      cont.position.set(hs.x, hs.y);
      cont.alpha = 1;
      damageLayer.addChild(cont);
      damageOverlays.set(hs.id, cont);
    }
  }

  function buildProceduralDamage(hs: HotspotDef, g: Graphics): void {
    if (hs.id === "pipe") {
      g.ellipse(0, 14, 64, 20).fill({ color: hs.color, alpha: 0.55 });
      g.poly([-8, -4, -28, -30, -4, -22, -34, -44, -16, -18, -40, -54, 0, -30, 8, -4]).fill({ color: hs.color, alpha: 0.6 });
    } else if (hs.id === "window") {
      g.roundRect(-52, -54, 104, 108, 8).fill({ color: num("#4a5a6a"), alpha: 0.28 });
      g.moveTo(-10, -40).lineTo(30, 20).lineTo(-20, 50).stroke({ width: 3, color: num("#1a2a3a"), alpha: 0.75 });
      g.moveTo(-10, -40).lineTo(-40, 30).stroke({ width: 2.5, color: num("#1a2a3a"), alpha: 0.65 });
    } else if (hs.id === "ceiling") {
      g.ellipse(0, 0, 68, 22).fill({ color: hs.color, alpha: 0.6 });
      g.ellipse(0, 0, 50, 15).fill({ color: shade(hs.color, -0.15), alpha: 0.55 });
      for (let i = -2; i <= 2; i++) {
        g.rect(i * 14, 12, 4, 22 + Math.abs(i) * 5).fill({ color: hs.color, alpha: 0.35 });
      }
    } else if (hs.id === "dishwasher") {
      g.ellipse(0, 10, 66, 26).fill({ color: hs.color, alpha: 0.52 });
      g.rect(-54, -10, 108, 16).fill({ color: hs.color, alpha: 0.32 });
      for (let bx = -40; bx <= 40; bx += 14) {
        g.circle(bx, -20 + (Math.abs(bx) / 40) * 8, 7).fill({ color: 0xffffff, alpha: 0.55 });
      }
    } else if (hs.id === "seep") {
      g.ellipse(0, 0, 54, 30).fill({ color: hs.color, alpha: 0.55 });
      g.ellipse(0, 0, 36, 20).fill({ color: shade(hs.color, -0.2), alpha: 0.5 });
      for (let i = -2; i <= 2; i++) {
        g.rect(i * 14 - 2, 18, 5, 34).fill({ color: hs.color, alpha: 0.3 });
      }
    }
  }

  // ── Hotspot pulse rings ────────────────────────────────────────────────────
  const pulseRings: Map<string, Container> = new Map();

  function buildHotspots(): void {
    for (const hs of HOTSPOTS) {
      const cont = new Container();
      const ring = new Graphics()
        .circle(0, 0, hs.r + 10)
        .fill({ color: 0xffffff, alpha: 0 })
        .circle(0, 0, hs.r + 10)
        .stroke({ width: 3, color: RING_NEUTRAL });
      const dot = new Graphics()
        .circle(0, 0, 14)
        .fill({ color: RING_NEUTRAL });
      const tap = new Graphics()
        .circle(0, 0, 20)
        .fill({ color: 0xffffff, alpha: 0.2 });
      cont.addChild(ring, tap, dot);
      cont.position.set(hs.x, hs.y);
      hotspotLayer.addChild(cont);
      pulseRings.set(hs.id, cont);

      gsap.to(ring.scale, { x: 1.25, y: 1.25, duration: 0.8, yoyo: true, repeat: -1, ease: "sine.inOut", delay: Math.random() * 0.4 });
      gsap.to(ring, { alpha: 0.8, duration: 0.8, yoyo: true, repeat: -1, ease: "sine.inOut", delay: Math.random() * 0.4 });
    }
  }

  // ── Stamp reveal ──────────────────────────────────────────────────────────
  function showStamp(hs: HotspotDef, comboN: number): void {
    const covered = hs.type === "covered";
    const stampColor = covered ? PRIMARY : num("#B84020");
    const stampBg = covered ? num("#E8F0E0") : num("#F8E0D8");

    const cont = new Container();
    const pw = 280, ph = 100;

    const bg = new Graphics();
    bg.roundRect(-pw / 2, -ph / 2, pw, ph, 10).fill({ color: stampBg });
    bg.roundRect(-pw / 2, -ph / 2, pw, ph, 10).stroke({ width: 3, color: stampColor });
    cont.addChild(bg);

    const t1 = new Text({
      text: hs.label,
      style: {
        fill: "#" + stampColor.toString(16).padStart(6, "0"),
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: 20,
        align: "center",
      },
    });
    t1.anchor.set(0.5);
    t1.position.set(0, -22);
    if (t1.width > pw - 20) t1.scale.set((pw - 20) / t1.width);
    cont.addChild(t1);

    const t2 = new Text({
      text: hs.sublabel,
      style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 15, align: "center" },
    });
    t2.anchor.set(0.5);
    t2.position.set(0, 4);
    cont.addChild(t2);

    const t3 = new Text({
      text: hs.infoLine,
      style: { fill: TXT, fontFamily: FONT, fontWeight: "700", fontSize: 13, align: "center" },
    });
    t3.anchor.set(0.5);
    t3.position.set(0, 26);
    cont.addChild(t3);

    // Position stamp avoiding edges
    let sx = hs.x;
    let sy = hs.y - 80;
    if (sy < ph / 2 + TOP_HUD_H + 10) sy = hs.y + 80;
    if (sx - pw / 2 < 10) sx = pw / 2 + 10;
    if (sx + pw / 2 > DW - 10) sx = DW - pw / 2 - 10;
    if (sy > DH - BOT_STRIP_H - ph / 2 - 10) sy = DH - BOT_STRIP_H - ph / 2 - 10;
    cont.position.set(sx, sy);
    cont.scale.set(0.5);
    cont.alpha = 0;
    uiLayer.addChild(cont);

    // Back-elastic pop + small screen shake
    gsap.timeline()
      .to(cont, { alpha: 1, duration: 0.2 })
      .to(cont.scale, { x: 1, y: 1, duration: 0.4, ease: "back.out(2)" }, 0)
      .to(cont, { alpha: 0, duration: 0.4, delay: 2.1, onComplete: () => {
        if (!cont.destroyed) cont.destroy();
      }});

    // Screen shake on tap
    screenShake(4);

    if (comboN >= 2) spawnSparks(hs.x, hs.y, comboN);
  }

  // ── Screen shake ──────────────────────────────────────────────────────────
  function screenShake(mag: number): void {
    gsap.killTweensOf(root.position);
    const ox = root.position.x, oy = root.position.y;
    gsap.timeline({ onComplete: () => { root.position.set(ox, oy); } })
      .to(root.position, { x: ox + mag, duration: 0.04, ease: "none" })
      .to(root.position, { x: ox - mag, duration: 0.04, ease: "none" })
      .to(root.position, { x: ox + mag * 0.5, duration: 0.04, ease: "none" })
      .to(root.position, { x: ox, duration: 0.05, ease: "none" });
  }

  // ── Particle dissolve on damage removal ───────────────────────────────────
  function spawnDissolveFx(x: number, y: number, color: number): void {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const r = 30 + Math.random() * 40;
      // Sparkle dot
      const dot = new Graphics()
        .circle(0, 0, 2.5 + Math.random() * 2.5)
        .fill({ color, alpha: 0.9 });
      dot.position.set(x, y);
      fxLayer.addChild(dot);
      gsap.to(dot, {
        x: x + Math.cos(angle) * r,
        y: y + Math.sin(angle) * r,
        alpha: 0,
        duration: 0.5 + Math.random() * 0.3,
        ease: "power2.out",
        onComplete: () => { if (!dot.destroyed) dot.destroy(); },
      });
    }
    // Sparkle sweep — small bright star
    const star = new Graphics().star(0, 0, 5, 10, 4).fill({ color: 0xFFFFCC, alpha: 0.9 });
    star.position.set(x, y);
    star.scale.set(0.3);
    fxLayer.addChild(star);
    gsap.timeline({ onComplete: () => { if (!star.destroyed) star.destroy(); } })
      .to(star.scale, { x: 1.2, y: 1.2, duration: 0.25, ease: "back.out(2)" })
      .to(star, { alpha: 0, duration: 0.3, ease: "power1.in" });
  }

  // ── Sparks / confetti ─────────────────────────────────────────────────────
  function spawnSparks(x: number, y: number, count: number): void {
    const colors = [ACCENT, PRIMARY, num("#F0C060"), num("#60C080"), num("#E08060")];
    const n = Math.min(8 + count * 4, 28);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const speed = 80 + Math.random() * 120;
      const dot = new Graphics()
        .circle(0, 0, 4 + Math.random() * 4)
        .fill({ color: colors[i % colors.length], alpha: 0.9 });
      dot.position.set(x, y);
      fxLayer.addChild(dot);
      gsap.to(dot, {
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        duration: 0.5 + Math.random() * 0.4,
        ease: "power2.out",
        onComplete: () => { if (!dot.destroyed) dot.destroy(); },
      });
    }
  }

  function spawnConfetti(): void {
    const colors = [ACCENT, PRIMARY, num("#F0C060"), num("#60C080"), num("#E08060"), num("#9060D0")];
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * DW;
      const size = 6 + Math.random() * 8;
      const rect = new Graphics()
        .rect(-size / 2, -size / 2, size, size * 0.6)
        .fill({ color: colors[i % colors.length], alpha: 0.9 });
      rect.position.set(x, -20);
      rect.rotation = Math.random() * Math.PI * 2;
      fxLayer.addChild(rect);
      gsap.to(rect, {
        y: DH + 40,
        rotation: rect.rotation + (Math.random() - 0.5) * 10,
        alpha: 0,
        duration: 1.2 + Math.random() * 1.0,
        delay: Math.random() * 0.8,
        ease: "power1.in",
        onComplete: () => { if (!rect.destroyed) rect.destroy(); },
      });
    }
  }

  // ── Full-room bloom (golden tint overlay) ─────────────────────────────────
  let bloomOverlay: Graphics | null = null;

  function roomBloom(): void {
    if (bloomOverlay) return;
    bloomOverlay = new Graphics()
      .rect(0, 0, DW, DH)
      .fill({ color: num("#FFE8A0"), alpha: 0 });
    fxLayer.addChild(bloomOverlay);
    const bo = bloomOverlay;
    // Fade in to 0.4 alpha, hold, then settle at gentle 0.12
    gsap.timeline()
      .to(bo, { alpha: 0.4, duration: 0.4, ease: "power1.out" })
      .to(bo, { alpha: 0.12, duration: 0.6, ease: "power1.in" });

    // Sun glow through window (window is at canvas 418, 255)
    const sunGlow = new Graphics()
      .ellipse(418, 255, 70, 70)
      .fill({ color: num("#FFEC80"), alpha: 0 });
    fxLayer.addChild(sunGlow);
    gsap.to(sunGlow, {
      alpha: 0.55,
      duration: 0.5,
      yoyo: true,
      repeat: 3,
      ease: "sine.inOut",
      onComplete: () => { if (!sunGlow.destroyed) sunGlow.destroy(); },
    });

    spawnConfetti();
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  let hintText!: Text;
  const stampedDots: Graphics[] = [];
  let progressLabel!: Text;

  function buildHud(): void {
    // Top bar
    const topBar = new Graphics();
    topBar.rect(0, 0, DW, TOP_HUD_H).fill({ color: num("#FAF3E7"), alpha: 0.97 });
    topBar.rect(0, TOP_HUD_H - 2, DW, 2).fill({ color: PRIMARY, alpha: 0.4 });
    uiLayer.addChild(topBar);

    // Brand chip
    const brandChip = new Container();
    const chipBg = new Graphics().roundRect(0, 0, 170, 40, 8)
      .fill({ color: PRIMARY })
      .stroke({ width: 1.5, color: shade(PRIMARY, -0.2) });
    const houseIco = new Graphics();
    houseIco.poly([0, -10, -9, 0, 9, 0]).fill({ color: 0xffffff });
    houseIco.rect(-6, 0, 12, 9).fill({ color: 0xffffff });
    houseIco.rect(-2, 3, 4, 6).fill({ color: PRIMARY });
    houseIco.position.set(20, 20);
    const brandLabel = new Text({
      text: "HavenNest Home",
      style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "bold", fontSize: 16 },
    });
    brandLabel.anchor.set(0, 0.5);
    brandLabel.position.set(36, 20);
    brandChip.addChild(chipBg, houseIco, brandLabel);
    brandChip.position.set(SAFE_PAD + 4, (TOP_HUD_H - 40) / 2);
    uiLayer.addChild(brandChip);

    // Hint text right side
    hintText = new Text({
      text: "",
      style: {
        fill: TXT,
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: 20,
        align: "right",
        wordWrap: true,
        wordWrapWidth: 320,
        dropShadow: { color: 0xffffff, blur: 4, alpha: 0.7, distance: 0 },
      },
    });
    hintText.anchor.set(1, 0.5);
    hintText.position.set(DW - SAFE_PAD - 4, TOP_HUD_H / 2);
    uiLayer.addChild(hintText);

    // Bottom progress strip
    const botBar = new Graphics();
    botBar.rect(0, DH - BOT_STRIP_H, DW, BOT_STRIP_H).fill({ color: num("#FAF3E7"), alpha: 0.95 });
    botBar.rect(0, DH - BOT_STRIP_H, DW, 2).fill({ color: PRIMARY, alpha: 0.4 });
    uiLayer.addChild(botBar);

    // Progress dots
    const progressBar = new Container();
    const DOT_R = 11;
    const DOT_GAP = 30;
    for (let i = 0; i < 5; i++) {
      const dot = new Graphics().circle(0, 0, DOT_R).fill({ color: num("#D8CEB8") });
      dot.position.set((i - 2) * DOT_GAP, 0);
      progressBar.addChild(dot);
      stampedDots.push(dot);
    }
    progressBar.position.set(DW / 2, DH - BOT_STRIP_H / 2 - 10);
    uiLayer.addChild(progressBar);

    progressLabel = new Text({
      text: "0 / 5 spotted",
      style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 14, align: "center" },
    });
    progressLabel.anchor.set(0.5);
    progressLabel.position.set(DW / 2, DH - BOT_STRIP_H / 2 + 18);
    uiLayer.addChild(progressLabel);
  }

  function setHint(text: string): void {
    hintText.text = text;
    if (hintText.width > 320) hintText.scale.set(320 / hintText.width);
    else hintText.scale.set(1);
    gsap.fromTo(hintText, { alpha: 0.5 }, { alpha: 1, duration: 0.3 });
  }

  function updateProgress(): void {
    for (let i = 0; i < stampedDots.length; i++) {
      const tapped = tappedCount > i;
      const dot = stampedDots[i];
      dot.clear();
      if (tapped) {
        dot.circle(0, 0, 11).fill({ color: PRIMARY });
        const ck = new Text({
          text: "✓",
          style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "bold", fontSize: 13 },
        });
        ck.anchor.set(0.5);
        dot.addChild(ck);
        gsap.fromTo(dot.scale, { x: 0.5, y: 0.5 }, { x: 1, y: 1, duration: 0.3, ease: "back.out(2)" });
      } else {
        dot.circle(0, 0, 11).fill({ color: num("#D8CEB8") });
      }
    }
    if (progressLabel) progressLabel.text = `${tappedCount} / 5 spotted`;
  }

  // ── Draw drop (teardrop falling) ──────────────────────────────────────────
  function drawDrop(y: number, alpha: number): void {
    dropGfx.clear();
    if (alpha <= 0) return;
    dropGfx.moveTo(DRIP_X, y)
      .lineTo(DRIP_X - 4, y + 14)
      .bezierCurveTo(DRIP_X - 6, y + 22, DRIP_X + 6, y + 22, DRIP_X + 4, y + 14)
      .lineTo(DRIP_X, y)
      .fill({ color: num("#6496C8"), alpha });
  }

  // ── Tap handling ──────────────────────────────────────────────────────────
  function handleTap(worldX: number, worldY: number): void {
    if (gameState !== "playing") return;
    idleAccum = 0;
    hideGhost();

    for (const hs of HOTSPOTS) {
      if (tappedIds.has(hs.id)) continue;
      const dx = worldX - hs.x, dy = worldY - hs.y;
      if (Math.hypot(dx, dy) <= hs.r + 18) {
        tapHotspot(hs);
        return;
      }
    }
  }

  function tapHotspot(hs: HotspotDef): void {
    if (tappedIds.has(hs.id)) return;
    tappedIds.add(hs.id);
    tappedCount++;

    // Hide pulse ring
    const ring = pulseRings.get(hs.id);
    if (ring) {
      gsap.killTweensOf(ring);
      gsap.killTweensOf(ring.scale);
      gsap.to(ring, { alpha: 0, duration: 0.2, onComplete: () => {
        if (!ring.destroyed) ring.destroy();
      }});
      pulseRings.delete(hs.id);
    }

    // Dissolve damage overlay with particles
    const overlay = damageOverlays.get(hs.id);
    if (overlay) {
      spawnDissolveFx(hs.x, hs.y, hs.color);
      gsap.to(overlay, { alpha: 0, duration: 0.6, ease: "power1.in" });
    }

    // Ceiling tap — stop drip
    if (hs.id === "ceiling") {
      dropAnimActive = false;
      gsap.to(dropGfx, { alpha: 0, duration: 0.3 });
    }

    showStamp(hs, tappedCount);
    updateProgress();

    if (tappedCount === 5) {
      gsap.delayedCall(0.3, () => {
        roomBloom();
        gsap.delayedCall(REVEAL_HOLD / 1000, showEndcard);
      });
    } else if (tappedCount === 4) {
      spawnSparks(DW / 2, DH / 2, 5);
    }

    setHint(cfg.copy.title);
  }

  // ── Hook intro (ceiling stain spreads + drip starts) ──────────────────────
  function startHook(): void {
    gameState = "intro";
    idleAccum = 0;
    idleCount = 0;
    tappedCount = 0;
    tappedIds.clear();

    setHint(cfg.params.instructionText as string ?? "Spot the damage");

    dropAnimActive = true;
    dropY = DRIP_START_Y;

    // Hook: ceiling stain grows over 800ms
    const ceilingHsDef = HOTSPOTS.find(h => h.id === "ceiling")!;
    if (ceilingDmgSprite) {
      // Animate from 85% → 100% scale
      const t = tex("dmg-stain.webp");
      const baseScale = t ? (ceilingHsDef.dmgW / t.width) : 1;
      gsap.to(ceilingDmgSprite.scale, {
        x: baseScale,
        y: baseScale,
        duration: 0.8,
        ease: "power2.out",
      });
    } else if (ceilingStainGfx) {
      // Procedural grow
      const csY_proc = DRIP_START_Y;
      gsap.timeline()
        .to(ceilingStainGfx, {
          duration: 0.8,
          ease: "power2.out",
          onUpdate: function() {
            const p = this.progress();
            ceilingStainGfx.clear();
            const r = 60 + p * 28;
            ceilingStainGfx.ellipse(DRIP_X, csY_proc, r, 14 + p * 5).fill({ color: num("#C4A878"), alpha: 0.55 + p * 0.15 });
          },
        });
    }

    gsap.delayedCall(1.2, () => {
      gameState = "playing";
      setHint("Spot the damage");
    });
  }

  // ── Ambient animations (scene is never static) ────────────────────────────
  function startAmbientAnimations(): void {
    // Bucket gentle bob
    const bucketTarget = bucketSprite ?? dropBucket;
    if (bucketTarget) {
      gsap.to(bucketTarget, { y: bucketTarget.position?.y ?? 0 + 3, duration: 1.8, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }

    // Hotspot rings gentle drift — already handled by pulse

    // Damage sprites subtle breathe (alpha pulse so they look organic)
    for (const hs of HOTSPOTS) {
      const overlay = damageOverlays.get(hs.id);
      if (overlay) {
        gsap.to(overlay, {
          alpha: 0.82,
          duration: 2 + Math.random() * 1.5,
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut",
          delay: Math.random() * 1.0,
        });
      }
    }
  }

  // ── Drip / ticker ─────────────────────────────────────────────────────────
  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);

    if (dropAnimActive) {
      dropY += dt * 200;
      if (dropY > DRIP_END_Y - 20) {
        dropY = DRIP_START_Y;
        if (!dropGfx.destroyed) {
          // Mini splash
          const splash = new Graphics()
            .circle(DRIP_X, DRIP_END_Y - 10, 7).fill({ color: num("#6496C8"), alpha: 0.6 });
          kitchenLayer.addChild(splash);
          gsap.to(splash, {
            alpha: 0,
            scaleX: 2.2,
            scaleY: 2.2,
            duration: 0.3,
            ease: "power1.out",
            onComplete: () => { if (!splash.destroyed) splash.destroy(); },
          });
        }
      }
      if (!dropGfx.destroyed) drawDrop(dropY, 0.8);
    } else {
      if (!dropGfx.destroyed) dropGfx.alpha = 0;
    }

    if (gameState !== "playing") return;
    idleAccum += ticker.deltaMS;
    if (idleAccum >= IDLE_HINT) {
      idleAccum = 0;
      idleCount++;
      setHint("Spot the damage");
      if (idleCount === 1) {
        gsap.delayedCall(GHOST_DELAY / 1000, showGhost);
      }
      if (idleCount >= AUTO_DEMO_AFTER && !/dbg/.test(location.search)) {
        const hs = HOTSPOTS.find((h) => !tappedIds.has(h.id));
        if (hs) tapHotspot(hs);
      }
    }
  });

  // ── Endcard ───────────────────────────────────────────────────────────────
  function showEndcard(): void {
    if (gameState === "end") return;
    gameState = "end";
    dropAnimActive = false;
    hideGhost();

    const dimBg = new Graphics().rect(0, 0, DW, DH).fill({ color: 0x000000, alpha: 0.5 });
    overlayLayer.addChild(dimBg);

    const panel = new Container();
    const pw = 440, ph = 560;
    const panelBg = new Graphics()
      .roundRect(-pw / 2, -ph / 2, pw, ph, 24)
      .fill({ color: num("#FAF3E7") })
      .stroke({ width: 5, color: PRIMARY });
    panel.addChild(panelBg);

    // Brand logo
    const logoCont = new Container();
    const logoBg = new Graphics().roundRect(-110, -26, 220, 52, 12).fill({ color: PRIMARY });
    const logoHouse = new Graphics();
    logoHouse.poly([0, -20, -18, 0, 18, 0]).fill({ color: 0xffffff });
    logoHouse.rect(-12, 0, 24, 16).fill({ color: 0xffffff });
    logoHouse.rect(-4, 6, 8, 10).fill({ color: PRIMARY });
    logoHouse.position.set(-68, 2);
    const logoT = new Text({
      text: "HavenNest Home",
      style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "bold", fontSize: 22 },
    });
    logoT.anchor.set(0.5);
    logoT.position.set(20, 0);
    logoCont.addChild(logoBg, logoHouse, logoT);
    logoCont.position.set(0, -ph / 2 + 50);
    panel.addChild(logoCont);

    const endLine1 = new Text({
      text: "You spotted all 5. Continue to your",
      style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 22, align: "center", wordWrap: true, wordWrapWidth: pw - 40 },
    });
    endLine1.anchor.set(0.5);
    endLine1.position.set(0, -ph / 2 + 118);
    panel.addChild(endLine1);

    const endLine2 = new Text({
      text: "free home coverage review",
      style: { fill: cfg.style.colors.accent, fontFamily: FONT, fontWeight: "bold", fontSize: 24, align: "center" },
    });
    endLine2.anchor.set(0.5);
    endLine2.position.set(0, -ph / 2 + 150);
    panel.addChild(endLine2);

    const trust1Bg = new Graphics().roundRect(-180, -24, 360, 48, 10).fill({ color: num("#EEF5EC") }).stroke({ width: 2, color: PRIMARY });
    const trust1T = new Text({ text: "Licensed agents in [State]", style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: 17, align: "center" } });
    trust1T.anchor.set(0.5);
    const trust1 = new Container();
    trust1.addChild(trust1Bg, trust1T);
    trust1.position.set(0, -ph / 2 + 210);
    panel.addChild(trust1);

    const trust2Bg = new Graphics().roundRect(-180, -24, 360, 48, 10).fill({ color: num("#FEF0E8") }).stroke({ width: 2, color: ACCENT });
    const trust2T = new Text({ text: "Free home review — no obligation", style: { fill: cfg.style.colors.accent, fontFamily: FONT, fontWeight: "bold", fontSize: 16, align: "center" } });
    trust2T.anchor.set(0.5);
    const trust2 = new Container();
    trust2.addChild(trust2Bg, trust2T);
    trust2.position.set(0, -ph / 2 + 272);
    panel.addChild(trust2);

    // CTA button
    const ctaW = pw - 60, ctaH = 72;
    const ctaCont = new Container();
    const ctaBg = new Graphics()
      .roundRect(-ctaW / 2, -ctaH / 2, ctaW, ctaH, 36)
      .fill({ color: ACCENT })
      .stroke({ width: 4, color: shade(ACCENT, -0.25) });
    const ctaT = new Text({
      text: cfg.copy.cta,
      style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "bold", fontSize: 30, align: "center" },
    });
    ctaT.anchor.set(0.5);
    if (ctaT.width > ctaW - 24) ctaT.scale.set((ctaW - 24) / ctaT.width);
    ctaCont.addChild(ctaBg, ctaT);
    ctaCont.position.set(0, ph / 2 - 120);
    ctaCont.eventMode = "static";
    ctaCont.cursor = "pointer";
    ctaCont.on("pointertap", (e) => {
      e.stopPropagation();
      window.FbPlayableAd.onCTAClick();
    });
    panel.addChild(ctaCont);
    gsap.to(ctaCont.scale, { x: 1.04, y: 1.04, duration: 0.75, yoyo: true, repeat: -1, ease: "sine.inOut" });

    const disclaimer = new Text({
      text: "Coverage depends on your policy terms and state. Exclusions apply. Licensed agents in [State].",
      style: { fill: "#7a6654", fontFamily: FONT, fontWeight: "700", fontSize: 11, align: "center", wordWrap: true, wordWrapWidth: pw - 40 },
    });
    disclaimer.anchor.set(0.5, 0);
    disclaimer.position.set(0, ph / 2 - 64);
    panel.addChild(disclaimer);

    const replayT = new Text({
      text: "↻ Replay",
      style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: 20 },
    });
    replayT.anchor.set(0.5);
    replayT.position.set(0, ph / 2 - 22);
    replayT.eventMode = "static";
    replayT.cursor = "pointer";
    replayT.on("pointertap", (e) => {
      e.stopPropagation();
      resetGame();
    });
    panel.addChild(replayT);

    panel.position.set(DW / 2, DH / 2);
    panel.scale.set(0.6);
    panel.alpha = 0;
    overlayLayer.addChild(panel);

    gsap.timeline()
      .to(panel, { alpha: 1, duration: 0.3 })
      .to(panel.scale, { x: 1, y: 1, duration: 0.45, ease: "back.out(1.5)" }, 0);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function resetGame(): void {
    gsap.killTweensOf(dropGfx);
    if (ceilingDmgSprite) gsap.killTweensOf(ceilingDmgSprite.scale);

    overlayLayer.removeChildren();
    fxLayer.removeChildren();
    uiLayer.removeChildren();
    hotspotLayer.removeChildren();
    damageLayer.removeChildren();
    bloomOverlay = null;
    ceilingDmgSprite = null;

    tappedIds.clear();
    tappedCount = 0;
    idleAccum = 0;
    idleCount = 0;
    dropAnimActive = false;
    ghostCont = null;
    pulseRings.clear();
    damageOverlays.clear();
    stampedDots.length = 0;

    buildDamageOverlays();
    buildHotspots();
    buildHud();
    setHint("Spot the damage");
    startAmbientAnimations();
    startHook();
  }

  // ── Stage tap handler ─────────────────────────────────────────────────────
  app.stage.on("pointertap", (e) => {
    if (gameState !== "playing") return;
    const local = root.toLocal(e.global);
    handleTap(local.x, local.y);
  });

  // ── Layout (scale design canvas to viewport) ──────────────────────────────
  function layout(): void {
    const w = window.innerWidth, h = window.innerHeight;
    const s = Math.min(w / DW, h / DH);
    root.scale.set(s);
    root.position.set((w - DW * s) / 2, (h - DH * s) / 2);
    app.canvas.style.width = w + "px";
    app.canvas.style.height = h + "px";
  }

  // ── Build scene ───────────────────────────────────────────────────────────
  buildBackground();
  buildKitchen();
  buildDamageOverlays();
  buildHotspots();
  buildHud();

  layout();
  window.addEventListener("resize", layout);

  // Pixi v8 shader-race workaround
  requestAnimationFrame(() => {
    layout();
    app.renderer.render(app.stage);
  });

  startAmbientAnimations();
  startHook();

  void (() => window.FbPlayableAd.onCTAClick);
}

main().catch((e) => {
  console.error("Home Kitchen Hotspot Stamp failed to start:", e);
});
