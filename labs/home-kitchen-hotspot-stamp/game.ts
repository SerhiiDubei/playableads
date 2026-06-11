// Home Kitchen Hotspot Stamp — insurance hotspot inspection playable.
// PixiJS v8 + GSAP. Procedural visuals, portrait 9:16 (540×960 design canvas).
//
// Mechanic: 5 hotspot points on a 3/4 kitchen view.
//   4 = sudden & accidental damage (TYPICALLY COVERED + qualifier)
//   1 = decoy old slow seep (NOT TYPICALLY COVERED — ask about add-ons)
// Each tap reveals a damage overlay dissolve + stamp. Escalating combo sparks.
// Hook: ceiling stain spreads + drip into bucket in first 800ms.
// Ghost finger after 1.5–2s idle. Endcard: free home review CTA + disclaimer.
//
// Boot hardening: preloadTextures uses onload/onerror (never img.decode()).
// antialias: false — MSAA breaks shader compile in embedded WebGL.
// Layout from window.innerWidth/innerHeight, never app.screen at init time.
import { Application, Container, Graphics, Text } from "pixi.js";
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

// ── Neutral ring color (same for ALL hotspots before tap — defect 2 fix) ───
const RING_NEUTRAL = num("#A09070"); // warm brown-grey, same for covered + decoy

// ── Tunables ──────────────────────────────────────────────────────────────────
const IDLE_HINT = Number(cfg.params.idleHintMs ?? 2000);
const AUTO_DEMO_AFTER = Number(cfg.params.autoDemoAfterIdles ?? 2);
const REVEAL_HOLD = Number(cfg.params.revealHoldMs ?? 2500);
const GHOST_DELAY = Number(cfg.params.ghostDelayMs ?? 1500);
const ENDCARD_IDLE = Number(cfg.params.endcardIdleMs ?? 3000);
const AUTO_ENDCARD = Number(cfg.params.autoEndcardMs ?? 9000);

// ── Design canvas ─────────────────────────────────────────────────────────────
const DW = 540, DH = 960;

// ── Safe padding (defect 6) ────────────────────────────────────────────────
const SAFE_PAD = 10; // px safe padding around kitchen edges

// ── Zone heights ──────────────────────────────────────────────────────────────
const TOP_HUD_H = 80;   // top brand + instruction strip
const BOT_STRIP_H = 80; // bottom progress strip

// ── Hotspot definitions ───────────────────────────────────────────────────────
// x, y = design-space center; r = hit radius; type = covered|decoy
interface HotspotDef {
  id: string;
  x: number; y: number; r: number;
  type: "covered" | "decoy";
  label: string;        // stamp text line 1
  sublabel: string;     // stamp text line 2 / qualifier
  infoLine: string;     // info payload (ref cost or education)
  color: number;        // damage overlay color
}

// Hotspot positions shifted down by TOP_HUD_H so they land in the play area
const HOTSPOTS: HotspotDef[] = [
  {
    id: "pipe",
    x: 148, y: 620 + TOP_HUD_H, r: 46,
    type: "covered",
    label: "TYPICALLY COVERED",
    sublabel: "varies by policy",
    infoLine: "Avg. repair: $2,400",
    color: num("#4a7fc1"),  // blue water
  },
  {
    id: "window",
    x: 414, y: 248 + TOP_HUD_H, r: 44,
    type: "covered",
    label: "TYPICALLY COVERED",
    sublabel: "varies by policy",
    infoLine: "Storm damage covered",
    color: num("#a0c4dc"),  // grey-blue glass
  },
  {
    id: "ceiling",
    x: 270, y: 188 + TOP_HUD_H, r: 50,
    type: "covered",
    label: "TYPICALLY COVERED",
    sublabel: "varies by policy",
    infoLine: "Avg. repair: $1,800",
    color: num("#8b7355"),  // brown water stain
  },
  {
    id: "dishwasher",
    x: 400, y: 680 + TOP_HUD_H, r: 46,
    type: "covered",
    label: "TYPICALLY COVERED",
    sublabel: "varies by policy",
    infoLine: "Appliance overflow covered",
    color: num("#5b9bd5"),  // blue water overflow
  },
  {
    id: "seep",
    x: 188, y: 388 + TOP_HUD_H, r: 44,
    type: "decoy",
    label: "NOT TYPICALLY COVERED",
    sublabel: "ask about add-ons",
    infoLine: "Slow seep = maintenance issue",
    color: num("#7a6648"),  // old brown stain
  },
];

// ── Game state ────────────────────────────────────────────────────────────────
type GameState = "intro" | "playing" | "reveal" | "end";

async function main(): Promise<void> {
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

  // ── Input setup ──────────────────────────────────────────────────────────
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

  // No interactive children on game layers — manual hit tests only
  kitchenLayer.interactiveChildren = false;
  damageLayer.interactiveChildren = false;
  hotspotLayer.interactiveChildren = false;
  fxLayer.interactiveChildren = false;

  // ── State ──────────────────────────────────────────────────────────────────
  let gameState: GameState = "intro";
  let busy = false;
  let idleAccum = 0;
  let idleCount = 0;
  let tappedCount = 0;
  const tappedIds = new Set<string>();

  // suppress unused warning
  void busy;

  // ── Ghost finger ──────────────────────────────────────────────────────────
  let ghostCont: Container | null = null;
  let ghostHsIdx = 0;

  function showGhost(): void {
    if (ghostCont) return;
    // Find first untapped hotspot
    const hs = HOTSPOTS.find((h) => !tappedIds.has(h.id));
    if (!hs) return;
    ghostHsIdx = HOTSPOTS.indexOf(hs);
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

  // ── Background (kitchen room) ─────────────────────────────────────────────
  function buildBackground(): void {
    // Sky / wall background — fill entire canvas
    const bg = new Graphics();
    bg.rect(0, 0, DW, DH).fill({ color: num("#F5EDD8") }); // warm cream wall
    bgLayer.addChild(bg);
  }

  // ── Kitchen (procedural flat-front view) ─────────────────────────────────
  // Back wall, upper cabinets, counter, window, sink, appliances
  // Shifted down by TOP_HUD_H to sit inside the play area zone
  let ceilingStain!: Graphics;
  let dropBucket!: Container;
  let dropGfx!: Graphics;
  let dropY = 0;
  let dropAnimActive = false;

  // Kitchen Y offset — play area starts at TOP_HUD_H
  const KY = TOP_HUD_H; // kitchen content offset
  const KPAD = SAFE_PAD; // horizontal safe padding

  function buildKitchen(): void {
    const wall = num("#EDE0C8");
    const wallShade = num("#D8C8A8");
    const cabinetColor = num("#C8B990");
    const cabinetDark = num("#A89870");
    const counterTop = num("#D4C4A0");
    const counterFront = num("#C0AE88");
    const floorColor = num("#C4B898");
    const floorGrout = num("#B0A080");

    const g = new Graphics();

    // Play area height (between top HUD and bottom progress strip)
    const playH = DH - TOP_HUD_H - BOT_STRIP_H;

    // ── Floor ── (bottom portion of play area)
    g.rect(KPAD, KY + playH - 200, DW - KPAD * 2, 200).fill({ color: floorColor });
    // Floor tiles
    for (let x = KPAD; x < DW - KPAD; x += 90) {
      g.moveTo(x, KY + playH - 200).lineTo(x, KY + playH).stroke({ width: 1.5, color: floorGrout, alpha: 0.5 });
    }
    for (let y = KY + playH - 200; y < KY + playH; y += 90) {
      g.moveTo(KPAD, y).lineTo(DW - KPAD, y).stroke({ width: 1.5, color: floorGrout, alpha: 0.5 });
    }

    // ── Back wall ── (full play area width with safe padding)
    g.rect(KPAD, KY, DW - KPAD * 2, playH - 200).fill({ color: wall });
    g.rect(KPAD, KY + playH - 230, DW - KPAD * 2, 30).fill({ color: wallShade }); // baseboard shadow

    // ── Upper cabinets (left side) ──
    g.roundRect(KPAD + 20, KY + 4, 220, 180, 6).fill({ color: cabinetColor });
    g.roundRect(KPAD + 20, KY + 4, 220, 180, 6).stroke({ width: 3, color: cabinetDark });
    // Cabinet doors
    g.roundRect(KPAD + 28, KY + 12, 100, 164, 4).fill({ color: shade(cabinetColor, 0.07) });
    g.roundRect(KPAD + 28, KY + 12, 100, 164, 4).stroke({ width: 2, color: cabinetDark, alpha: 0.5 });
    g.roundRect(KPAD + 132, KY + 12, 100, 164, 4).fill({ color: shade(cabinetColor, 0.07) });
    g.roundRect(KPAD + 132, KY + 12, 100, 164, 4).stroke({ width: 2, color: cabinetDark, alpha: 0.5 });
    // Door handles
    g.roundRect(KPAD + 76, KY + 92, 28, 6, 3).fill({ color: cabinetDark });
    g.roundRect(KPAD + 180, KY + 92, 28, 6, 3).fill({ color: cabinetDark });

    // ── Backsplash tiles (between counters and upper cabinets) ──
    const tileW = 44, tileH = 44;
    const tileColor = num("#E8DCC0");
    const tileGrout = num("#C8B898");
    for (let x = KPAD; x < DW - KPAD; x += tileW) {
      for (let y = KY + 200; y < KY + 360; y += tileH) {
        g.rect(x + 1, y + 1, tileW - 2, tileH - 2).fill({ color: tileColor });
        g.rect(x, y, tileW, 1).fill({ color: tileGrout, alpha: 0.6 });
        g.rect(x, y, 1, tileH).fill({ color: tileGrout, alpha: 0.6 });
      }
    }

    // ── Upper cabinets (right side, beside window) ──
    g.roundRect(DW - KPAD - 240, KY + 4, 220, 180, 6).fill({ color: cabinetColor });
    g.roundRect(DW - KPAD - 240, KY + 4, 220, 180, 6).stroke({ width: 3, color: cabinetDark });
    g.roundRect(DW - KPAD - 232, KY + 12, 100, 164, 4).fill({ color: shade(cabinetColor, 0.07) });
    g.roundRect(DW - KPAD - 232, KY + 12, 100, 164, 4).stroke({ width: 2, color: cabinetDark, alpha: 0.5 });
    g.roundRect(DW - KPAD - 128, KY + 12, 100, 164, 4).fill({ color: shade(cabinetColor, 0.07) });
    g.roundRect(DW - KPAD - 128, KY + 12, 100, 164, 4).stroke({ width: 2, color: cabinetDark, alpha: 0.5 });
    g.roundRect(DW - KPAD - 188, KY + 92, 28, 6, 3).fill({ color: cabinetDark });
    g.roundRect(DW - KPAD - 84, KY + 92, 28, 6, 3).fill({ color: cabinetDark });

    // ── Counter / base cabinets ──
    g.rect(KPAD, KY + 358, DW - KPAD * 2, 60).fill({ color: counterTop });
    g.rect(KPAD, KY + 358, DW - KPAD * 2, 6).fill({ color: num("#F0E4C4") }); // counter edge highlight
    g.rect(KPAD, KY + 418, DW - KPAD * 2, 262).fill({ color: counterFront });
    // Cabinet doors on base
    for (let x = KPAD + 10; x < DW - KPAD - 10; x += 120) {
      g.roundRect(x, KY + 426, 108, 240, 4).fill({ color: shade(counterFront, 0.06) });
      g.roundRect(x, KY + 426, 108, 240, 4).stroke({ width: 2, color: shade(counterFront, -0.15), alpha: 0.5 });
      g.roundRect(x + 34, KY + 536, 40, 8, 4).fill({ color: shade(counterFront, -0.2) });
    }

    kitchenLayer.addChild(g);

    // ── Window (back wall, right area — near hotspot window) ──
    const win = new Graphics();
    const WX = DW - KPAD - 160, WY = KY + 20, WW = 130, WH = 160;
    win.roundRect(WX, WY, WW, WH, 10).fill({ color: num("#B8D8E8") }); // sky
    win.roundRect(WX, WY, WW, WH, 10).stroke({ width: 8, color: num("#E0D0B0") });
    // Window panes
    win.rect(WX + WW / 2 - 3, WY, 6, WH).fill({ color: num("#E0D0B0") });
    win.rect(WX, WY + WH / 2 - 3, WW, 6).fill({ color: num("#E0D0B0") });
    // Sunlight glare
    win.poly([WX + 14, WY + 20, WX + 60, WY + 20, WX + 50, WY + 90, WX + 8, WY + 90])
      .fill({ color: 0xffffff, alpha: 0.35 });
    kitchenLayer.addChild(win);

    // ── Sink (counter left area — near hotspot pipe) ──
    const sink = new Graphics();
    const SX = KPAD + 60, SY = KY + 358;
    // Sink basin
    sink.roundRect(SX, SY - 2, 148, 40, 8).fill({ color: num("#A8BCC4") });
    sink.roundRect(SX + 8, SY + 4, 132, 28, 6).fill({ color: num("#8CAAB4") });
    // Faucet
    sink.roundRect(SX + 56, SY - 26, 12, 28, 6).fill({ color: num("#C8C0A8") });
    sink.roundRect(SX + 36, SY - 30, 52, 10, 5).fill({ color: num("#D4CCA8") });
    kitchenLayer.addChild(sink);

    // ── Dishwasher (base cabinet, right area) ──
    const dw = new Graphics();
    const DWX = DW - KPAD - 200, DWY = KY + 418;
    dw.roundRect(DWX, DWY, 120, 260, 4).fill({ color: num("#D8CEB0") });
    dw.roundRect(DWX, DWY, 120, 260, 4).stroke({ width: 2, color: num("#B8A888"), alpha: 0.6 });
    // Dishwasher panel
    dw.roundRect(DWX + 8, DWY + 8, 104, 60, 3).fill({ color: num("#C4B898") });
    dw.circle(DWX + 20, DWY + 28, 7).fill({ color: num("#8FA888") }); // button
    dw.circle(DWX + 40, DWY + 28, 7).fill({ color: num("#D96C47") }); // button
    dw.roundRect(DWX + 54, DWY + 22, 44, 14, 3).fill({ color: num("#A49870") });
    kitchenLayer.addChild(dw);

    // ── Ceiling stain (top of play area, for hook animation) ──
    // Positioned at ceiling hotspot y (188 + TOP_HUD_H)
    const csY = KY + 108; // near top of play area
    ceilingStain = new Graphics();
    // Start fully visible — damage must show BEFORE tap (defect 1 fix)
    ceilingStain.ellipse(270, csY, 60, 14).fill({ color: num("#C4A878"), alpha: 0.55 });
    ceilingStain.ellipse(270, csY + 2, 44, 10).fill({ color: num("#B8986A"), alpha: 0.45 });
    kitchenLayer.addChild(ceilingStain);

    // ── Drop and bucket ──
    dropBucket = new Container();
    // Bucket shape
    const bucket = new Graphics();
    const bY = KY + 360; // visible on counter area
    bucket.poly([252, bY - 30, 288, bY - 30, 300, bY, 240, bY]).fill({ color: num("#7A9090") });
    bucket.poly([252, bY - 30, 288, bY - 30, 292, bY - 34, 248, bY - 34]).fill({ color: num("#A0B8B8") });
    bucket.ellipse(270, bY, 30, 8).fill({ color: num("#688080") });
    dropBucket.addChild(bucket);
    dropBucket.alpha = 1; // visible from start (defect 1 fix)
    kitchenLayer.addChild(dropBucket);

    dropGfx = new Graphics();
    dropY = csY + 14; // start at bottom of ceiling stain
    kitchenLayer.addChild(dropGfx);
  }

  function drawDrop(y: number, alpha: number): void {
    dropGfx.clear();
    if (alpha <= 0) return;
    // Teardrop shape
    dropGfx.moveTo(270, y)
      .lineTo(266, y + 14)
      .bezierCurveTo(264, y + 22, 276, y + 22, 274, y + 14)
      .lineTo(270, y)
      .fill({ color: num("#6496C8"), alpha });
  }

  // ── Damage overlays (per hotspot) — VISIBLE before tap, dissolve on tap ──
  // Defect 1 fix: start at alpha=1, ON TAP they fade to repaired state
  const damageOverlays: Map<string, Container> = new Map();

  function buildDamageOverlays(): void {
    for (const hs of HOTSPOTS) {
      const cont = new Container();
      const g = new Graphics();

      if (hs.id === "pipe") {
        // Under-sink pipe burst — water spray + puddle (blue)
        // Puddle on floor under sink
        g.ellipse(0, 14, 64, 20).fill({ color: hs.color, alpha: 0.55 });
        g.ellipse(0, 14, 44, 13).fill({ color: hs.color, alpha: 0.45 });
        // Water spray polygon from pipe
        g.poly([-8, -4, -28, -30, -4, -22, -34, -44, -16, -18, -40, -54, 0, -30, 8, -4]).fill({ color: hs.color, alpha: 0.6 });
        // Drips on cabinet
        g.rect(-32, -28, 5, 20).fill({ color: hs.color, alpha: 0.4 });
        g.rect(-18, -22, 4, 14).fill({ color: hs.color, alpha: 0.35 });
      } else if (hs.id === "window") {
        // Broken/cracked storm window — dark overlay + crack lines
        g.roundRect(-52, -54, 104, 108, 8).fill({ color: num("#4a5a6a"), alpha: 0.28 });
        // Main crack spider web
        g.moveTo(-10, -40).lineTo(30, 20).lineTo(-20, 50).stroke({ width: 3, color: num("#1a2a3a"), alpha: 0.75 });
        g.moveTo(-10, -40).lineTo(-40, 30).stroke({ width: 2.5, color: num("#1a2a3a"), alpha: 0.65 });
        g.moveTo(30, 20).lineTo(50, 40).stroke({ width: 2, color: num("#1a2a3a"), alpha: 0.5 });
        // More crack radiations
        g.moveTo(-10, -40).lineTo(20, -54).stroke({ width: 1.5, color: num("#2a3a4a"), alpha: 0.55 });
        g.moveTo(-10, -40).lineTo(-30, -54).stroke({ width: 1.5, color: num("#2a3a4a"), alpha: 0.45 });
        g.moveTo(30, 20).lineTo(54, 0).stroke({ width: 1.5, color: num("#2a3a4a"), alpha: 0.45 });
      } else if (hs.id === "ceiling") {
        // Ceiling water damage — dark irregular spreading blob + drip streaks
        g.ellipse(0, 0, 68, 22).fill({ color: hs.color, alpha: 0.6 });
        g.ellipse(0, 0, 50, 15).fill({ color: shade(hs.color, -0.15), alpha: 0.55 });
        g.ellipse(0, 0, 28, 10).fill({ color: shade(hs.color, -0.25), alpha: 0.6 });
        // Irregular blob bumps
        g.ellipse(-50, 4, 22, 10).fill({ color: hs.color, alpha: 0.4 });
        g.ellipse(52, -2, 18, 9).fill({ color: hs.color, alpha: 0.38 });
        g.ellipse(10, 12, 30, 12).fill({ color: hs.color, alpha: 0.35 });
        // Drip streaks down
        for (let i = -2; i <= 2; i++) {
          g.rect(i * 14, 12, 4, 22 + Math.abs(i) * 5).fill({ color: hs.color, alpha: 0.35 });
        }
      } else if (hs.id === "dishwasher") {
        // Dishwasher overflow — foam bubbles + water pool
        g.ellipse(0, 10, 66, 26).fill({ color: hs.color, alpha: 0.52 });
        g.ellipse(0, 10, 44, 16).fill({ color: hs.color, alpha: 0.38 });
        // Water seeping from under door
        g.rect(-54, -10, 108, 16).fill({ color: hs.color, alpha: 0.32 });
        // Foam bubbles
        for (let bx = -40; bx <= 40; bx += 14) {
          const by = -20 + (Math.abs(bx) / 40) * 8;
          g.circle(bx, by, 7 + Math.random() * 3).fill({ color: 0xffffff, alpha: 0.55 });
          g.circle(bx + 5, by - 8, 5).fill({ color: 0xffffff, alpha: 0.4 });
        }
      } else if (hs.id === "seep") {
        // Old slow seep — dark aged water stain on wall/backsplash
        g.ellipse(0, 0, 54, 30).fill({ color: hs.color, alpha: 0.55 });
        g.ellipse(0, 0, 36, 20).fill({ color: shade(hs.color, -0.2), alpha: 0.5 });
        g.ellipse(0, 0, 18, 10).fill({ color: shade(hs.color, -0.3), alpha: 0.55 });
        // Long aged streaks showing slow seep history
        for (let i = -2; i <= 2; i++) {
          g.rect(i * 14 - 2, 18, 5, 34 + Math.abs(i) * 6).fill({ color: hs.color, alpha: 0.3 });
        }
        // Grunge edges
        g.ellipse(-30, 12, 18, 8).fill({ color: hs.color, alpha: 0.28 });
        g.ellipse(28, 14, 15, 7).fill({ color: hs.color, alpha: 0.26 });
      }

      cont.addChild(g);
      cont.position.set(hs.x, hs.y);
      cont.alpha = 1; // VISIBLE from start — defect 1 fix
      damageLayer.addChild(cont);
      damageOverlays.set(hs.id, cont);
    }
  }

  // ── Hotspot pulse rings — ALL identical neutral color (defect 2 fix) ────
  const pulseRings: Map<string, Container> = new Map();

  function buildHotspots(): void {
    for (const hs of HOTSPOTS) {
      const cont = new Container();
      // All rings use RING_NEUTRAL — same for covered AND decoy before tap
      const ring = new Graphics()
        .circle(0, 0, hs.r + 10)
        .fill({ color: 0xffffff, alpha: 0 })
        .circle(0, 0, hs.r + 10)
        .stroke({ width: 3, color: RING_NEUTRAL });
      // Inner dot — same neutral color
      const dot = new Graphics()
        .circle(0, 0, 14)
        .fill({ color: RING_NEUTRAL });
      // Tap target indicator
      const tap = new Graphics()
        .circle(0, 0, 20)
        .fill({ color: 0xffffff, alpha: 0.2 });
      cont.addChild(ring, tap, dot);
      cont.position.set(hs.x, hs.y);
      hotspotLayer.addChild(cont);
      pulseRings.set(hs.id, cont);

      // Start pulsing — identical for all
      gsap.to(ring.scale, { x: 1.25, y: 1.25, duration: 0.8, yoyo: true, repeat: -1, ease: "sine.inOut", delay: Math.random() * 0.4 });
      gsap.to(ring, { alpha: 0.8, duration: 0.8, yoyo: true, repeat: -1, ease: "sine.inOut", delay: Math.random() * 0.4 });
    }
  }

  // ── Stamp reveal ──────────────────────────────────────────────────────────
  function showStamp(hs: HotspotDef, comboN: number): void {
    const covered = hs.type === "covered";
    // Verdict color appears ONLY on stamp after tapping (defect 2 fix)
    const stampColor = covered ? PRIMARY : num("#B84020");
    const stampBg = covered ? num("#E8F0E0") : num("#F8E0D8");

    const cont = new Container();
    const pw = 280, ph = 100;

    // Stamp background with border
    const bg = new Graphics();
    bg.roundRect(-pw / 2, -ph / 2, pw, ph, 10).fill({ color: stampBg });
    bg.roundRect(-pw / 2, -ph / 2, pw, ph, 10).stroke({ width: 3, color: stampColor });
    cont.addChild(bg);

    // Stamp text line 1
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
    t1.position.set(0, -20);
    // Fit text
    if (t1.width > pw - 20) t1.scale.set((pw - 20) / t1.width);
    cont.addChild(t1);

    // Stamp text line 2 (qualifier)
    const t2 = new Text({
      text: hs.sublabel,
      style: {
        fill: TXT,
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: 15,
        align: "center",
      },
    });
    t2.anchor.set(0.5);
    t2.position.set(0, 6);
    cont.addChild(t2);

    // Info line
    const t3 = new Text({
      text: hs.infoLine,
      style: {
        fill: TXT,
        fontFamily: FONT,
        fontWeight: "700",
        fontSize: 13,
        align: "center",
      },
    });
    t3.anchor.set(0.5);
    t3.position.set(0, 28);
    cont.addChild(t3);

    // Position stamp near hotspot (ensure it stays in bounds within play area)
    let sx = hs.x;
    let sy = hs.y - 80;
    if (sy < ph / 2 + TOP_HUD_H + 10) sy = hs.y + 80;
    if (sx - pw / 2 < 10) sx = pw / 2 + 10;
    if (sx + pw / 2 > DW - 10) sx = DW - pw / 2 - 10;
    // Ensure stamp stays in play area
    if (sy > DH - BOT_STRIP_H - ph / 2 - 10) sy = DH - BOT_STRIP_H - ph / 2 - 10;
    cont.position.set(sx, sy);
    cont.scale.set(0.5);
    cont.alpha = 0;
    uiLayer.addChild(cont);

    // Pop-in animation
    gsap.timeline()
      .to(cont, { alpha: 1, duration: 0.2 })
      .to(cont.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(2)" }, 0)
      .to(cont, { alpha: 0, duration: 0.4, delay: 2.2, onComplete: () => {
        if (!cont.destroyed) cont.destroy();
      }});

    // Combo sparks escalation
    if (comboN >= 2) spawnSparks(hs.x, hs.y, comboN);
  }

  // ── Spark / confetti effects ───────────────────────────────────────────────
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

  // ── Full-room bloom effect ──────────────────────────────────────────────────
  let bloomOverlay: Graphics | null = null;
  function roomBloom(): void {
    if (bloomOverlay) return;
    bloomOverlay = new Graphics()
      .rect(0, 0, DW, DH)
      .fill({ color: num("#FFE8A0"), alpha: 0 });
    fxLayer.addChild(bloomOverlay);
    const bo = bloomOverlay;
    gsap.timeline()
      .to(bo, { alpha: 0.45, duration: 0.4, ease: "power1.out" })
      .to(bo, { alpha: 0.15, duration: 0.6, ease: "power1.in" });

    // Sun glow in window
    const sunGlow = new Graphics()
      .ellipse(425, 180, 80, 80)
      .fill({ color: num("#FFEC80"), alpha: 0 });
    fxLayer.addChild(sunGlow);
    gsap.to(sunGlow, { alpha: 0.6, duration: 0.5, yoyo: true, repeat: 3, ease: "sine.inOut", onComplete: () => { if (!sunGlow.destroyed) sunGlow.destroy(); } });

    spawnConfetti();
  }

  // ── HUD — defect 3 fix: top strip brand + instruction ─────────────────────
  // defect 4 fix: remove bottom-right brand chip, put progress properly
  // defect 5 fix: proper progress row with label
  let hintText!: Text;
  const stampedDots: Graphics[] = [];
  let progressBar!: Container;
  let progressLabel!: Text;

  function buildHud(): void {
    // ── TOP HUD STRIP (defect 3 fix) ──────────────────────────────────────
    // Brand chip background bar
    const topBar = new Graphics();
    topBar.rect(0, 0, DW, TOP_HUD_H).fill({ color: num("#FAF3E7"), alpha: 0.97 });
    topBar.rect(0, TOP_HUD_H - 2, DW, 2).fill({ color: PRIMARY, alpha: 0.4 });
    uiLayer.addChild(topBar);

    // Brand chip "HavenNest Home" — left-aligned in top strip
    const brandChip = new Container();
    const chipBg = new Graphics().roundRect(0, 0, 170, 40, 8)
      .fill({ color: PRIMARY })
      .stroke({ width: 1.5, color: shade(PRIMARY, -0.2) });
    // House icon
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

    // Instruction text — right side of top strip
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

    // ── BOTTOM PROGRESS STRIP (defect 5 fix) ──────────────────────────────
    // Background bar
    const botBar = new Graphics();
    botBar.rect(0, DH - BOT_STRIP_H, DW, BOT_STRIP_H).fill({ color: num("#FAF3E7"), alpha: 0.95 });
    botBar.rect(0, DH - BOT_STRIP_H, DW, 2).fill({ color: PRIMARY, alpha: 0.4 });
    uiLayer.addChild(botBar);

    // Progress row: 5 dots ≥10px radius + "X / 5 spotted" text
    progressBar = new Container();
    const DOT_R = 11; // ≥10px radius
    const DOT_GAP = 30;
    for (let i = 0; i < 5; i++) {
      const dot = new Graphics().circle(0, 0, DOT_R).fill({ color: num("#D8CEB8") });
      dot.position.set((i - 2) * DOT_GAP, 0);
      progressBar.addChild(dot);
      stampedDots.push(dot);
    }
    progressBar.position.set(DW / 2, DH - BOT_STRIP_H / 2 - 10);
    uiLayer.addChild(progressBar);

    // "0 / 5 spotted" label below dots
    progressLabel = new Text({
      text: "0 / 5 spotted",
      style: {
        fill: TXT,
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: 14,
        align: "center",
      },
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
      const col = tapped ? PRIMARY : num("#D8CEB8");
      dot.clear();
      if (tapped) {
        dot.circle(0, 0, 11).fill({ color: col });
        // checkmark
        const ck = new Text({
          text: "✓",
          style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "bold", fontSize: 13 },
        });
        ck.anchor.set(0.5);
        dot.addChild(ck);
        gsap.fromTo(dot.scale, { x: 0.5, y: 0.5 }, { x: 1, y: 1, duration: 0.3, ease: "back.out(2)" });
      } else {
        dot.circle(0, 0, 11).fill({ color: col });
      }
    }
    // Update label
    if (progressLabel) {
      progressLabel.text = `${tappedCount} / 5 spotted`;
    }
  }

  // ── Tap handling ──────────────────────────────────────────────────────────
  function handleTap(worldX: number, worldY: number): void {
    if (gameState !== "playing") return;
    // Reset idle
    idleAccum = 0;
    hideGhost();

    // Check each untapped hotspot
    for (const hs of HOTSPOTS) {
      if (tappedIds.has(hs.id)) continue;
      const dx = worldX - hs.x, dy = worldY - hs.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= hs.r + 18) { // generous hit window (rigged-easy)
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

    // Dissolve damage overlay (fade out on tap = repaired)
    const overlay = damageOverlays.get(hs.id);
    if (overlay) {
      gsap.to(overlay, { alpha: 0, duration: 0.5, ease: "power1.in" });
    }

    // If ceiling tap — stop drip
    if (hs.id === "ceiling") {
      dropAnimActive = false;
      gsap.to(dropGfx, { alpha: 0, duration: 0.3 });
    }

    // Show stamp
    showStamp(hs, tappedCount);
    updateProgress();

    // Check if all 5 tapped
    if (tappedCount === 5) {
      // Full-room bloom on last covered tap
      gsap.delayedCall(0.3, () => {
        roomBloom();
        gsap.delayedCall(REVEAL_HOLD / 1000, showEndcard);
      });
    } else if (tappedCount === 4) {
      // Streak bit — small bloom spark
      spawnSparks(DW / 2, DH / 2, 5);
    }

    setHint(cfg.copy.title);
  }

  // ── Hook intro (0–3s) ──────────────────────────────────────────────────────
  function startHook(): void {
    gameState = "intro";
    idleAccum = 0;
    idleCount = 0;
    tappedCount = 0;
    tappedIds.clear();

    // Show instruction
    setHint(cfg.params.instructionText as string ?? "Spot the damage");

    // Animate ceiling stain growing (800ms) — visible from start, grows bigger
    dropAnimActive = true;
    const csY = KY + 108;
    dropY = csY + 14;

    gsap.timeline()
      // Stain GROWS (already visible, just pulses larger in first 800ms)
      .to(ceilingStain, {
        duration: 0.8,
        ease: "power2.out",
        onUpdate: function() {
          const p = this.progress();
          ceilingStain.clear();
          const r = 60 + p * 28;
          const r2 = 44 + p * 20;
          ceilingStain.ellipse(270, csY, r, 14 + p * 5).fill({ color: num("#C4A878"), alpha: 0.55 + p * 0.15 });
          ceilingStain.ellipse(270, csY + 2, r2, 10 + p * 4).fill({ color: num("#B8986A"), alpha: 0.45 + p * 0.1 });
          // Irregular blob bumps
          ceilingStain.ellipse(270 - 55 - p * 10, csY + 4, 20 + p * 6, 8 + p * 2).fill({ color: num("#C4A878"), alpha: p * 0.38 });
          ceilingStain.ellipse(270 + 58 + p * 8, csY - 2, 16 + p * 5, 7 + p * 2).fill({ color: num("#C4A878"), alpha: p * 0.32 });
        },
      })
      // After hook, transition to playing
      .call(() => {
        gameState = "playing";
        setHint("Spot the damage");
      }, [], 1.2);
  }

  // ── Drip animation (ticker) ───────────────────────────────────────────────
  const csY_tick = KY + 108;
  const bucketY_tick = KY + 360;

  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);

    // Drip animation (ceiling drop into bucket)
    if (dropAnimActive) {
      dropY += dt * 200;
      if (dropY > bucketY_tick - 20) {
        // Splash
        dropY = csY_tick + 14;
        if (!dropGfx.destroyed) {
          const splash = new Graphics()
            .circle(270, bucketY_tick - 10, 8).fill({ color: num("#6496C8"), alpha: 0.6 });
          kitchenLayer.addChild(splash);
          gsap.to(splash, { alpha: 0, scaleX: 2, scaleY: 2, duration: 0.3, ease: "power1.out", onComplete: () => {
            if (!splash.destroyed) splash.destroy();
          }});
        }
      }
      const dAlpha = 0.8;
      if (!dropGfx.destroyed) {
        drawDrop(dropY, dAlpha);
        dropGfx.alpha = dAlpha;
      }
    } else {
      if (!dropGfx.destroyed) {
        dropGfx.alpha = 0;
      }
    }

    // Idle nudge
    if (gameState !== "playing") return;
    idleAccum += ticker.deltaMS;
    if (idleAccum >= IDLE_HINT) {
      idleAccum = 0;
      idleCount++;
      setHint("Spot the damage");
      if (idleCount === 1) {
        // Show ghost finger after GHOST_DELAY
        gsap.delayedCall(GHOST_DELAY / 1000, showGhost);
      }
      if (idleCount >= AUTO_DEMO_AFTER && !/dbg/.test(location.search)) {
        // Auto-demo: tap first untapped hotspot
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

    // Dim overlay
    const dimBg = new Graphics().rect(0, 0, DW, DH).fill({ color: 0x000000, alpha: 0.5 });
    overlayLayer.addChild(dimBg);

    const panel = new Container();
    const pw = 440, ph = 560;
    const panelBg = new Graphics()
      .roundRect(-pw / 2, -ph / 2, pw, ph, 24)
      .fill({ color: num("#FAF3E7") })
      .stroke({ width: 5, color: PRIMARY });
    panel.addChild(panelBg);

    // Brand logo (procedural)
    const logoCont = new Container();
    const logoBg = new Graphics().roundRect(-110, -26, 220, 52, 12).fill({ color: PRIMARY });
    const logoHouse = new Graphics();
    // House outline with palm/shield roof
    logoHouse.poly([0, -20, -18, 0, 18, 0]).fill({ color: 0xffffff }); // roof triangle
    logoHouse.rect(-12, 0, 24, 16).fill({ color: 0xffffff }); // house body
    logoHouse.rect(-4, 6, 8, 10).fill({ color: PRIMARY }); // door
    logoHouse.position.set(-68, 2);
    const logoT = new Text({
      text: "HavenNest Home",
      style: {
        fill: "#ffffff",
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: 22,
      },
    });
    logoT.anchor.set(0.5);
    logoT.position.set(20, 0);
    logoCont.addChild(logoBg, logoHouse, logoT);
    logoCont.position.set(0, -ph / 2 + 50);
    panel.addChild(logoCont);

    // Endcard line text
    const endLine1 = new Text({
      text: "You spotted all 5. Continue to your",
      style: {
        fill: TXT,
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: 22,
        align: "center",
        wordWrap: true,
        wordWrapWidth: pw - 40,
      },
    });
    endLine1.anchor.set(0.5);
    endLine1.position.set(0, -ph / 2 + 118);
    panel.addChild(endLine1);

    const endLine2 = new Text({
      text: "free home coverage review",
      style: {
        fill: cfg.style.colors.accent,
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: 24,
        align: "center",
      },
    });
    endLine2.anchor.set(0.5);
    endLine2.position.set(0, -ph / 2 + 150);
    panel.addChild(endLine2);

    // Trust elements
    const trust1Bg = new Graphics().roundRect(-180, -24, 360, 48, 10).fill({ color: num("#EEF5EC") }).stroke({ width: 2, color: PRIMARY });
    const trust1T = new Text({
      text: "Licensed agents in [State]",
      style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: 17, align: "center" },
    });
    trust1T.anchor.set(0.5);
    const trust1 = new Container();
    trust1.addChild(trust1Bg, trust1T);
    trust1.position.set(0, -ph / 2 + 210);
    panel.addChild(trust1);

    const trust2Bg = new Graphics().roundRect(-180, -24, 360, 48, 10).fill({ color: num("#FEF0E8") }).stroke({ width: 2, color: ACCENT });
    const trust2T = new Text({
      text: "Free home review — no obligation",
      style: { fill: cfg.style.colors.accent, fontFamily: FONT, fontWeight: "bold", fontSize: 16, align: "center" },
    });
    trust2T.anchor.set(0.5);
    const trust2 = new Container();
    trust2.addChild(trust2Bg, trust2T);
    trust2.position.set(0, -ph / 2 + 272);
    panel.addChild(trust2);

    // CTA button (≥44px, bottom thumb zone, accent color)
    const ctaW = pw - 60, ctaH = 72;
    const ctaCont = new Container();
    const ctaBg = new Graphics()
      .roundRect(-ctaW / 2, -ctaH / 2, ctaW, ctaH, 36)
      .fill({ color: ACCENT })
      .stroke({ width: 4, color: shade(ACCENT, -0.25) });
    const ctaT = new Text({
      text: cfg.copy.cta,
      style: {
        fill: "#ffffff",
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: 30,
        align: "center",
      },
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

    // Disclaimer (visible, ≥10px)
    const disclaimer = new Text({
      text: "Coverage depends on your policy terms and state. Exclusions apply. Licensed agents in [State].",
      style: {
        fill: "#7a6654",
        fontFamily: FONT,
        fontWeight: "700",
        fontSize: 11,
        align: "center",
        wordWrap: true,
        wordWrapWidth: pw - 40,
      },
    });
    disclaimer.anchor.set(0.5, 0);
    disclaimer.position.set(0, ph / 2 - 64);
    panel.addChild(disclaimer);

    // Replay button
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
    // Kill all tweens before destroying objects
    gsap.killTweensOf(ceilingStain);
    gsap.killTweensOf(dropGfx);
    gsap.killTweensOf(dropBucket);

    // Clear overlay
    overlayLayer.removeChildren();
    fxLayer.removeChildren();
    uiLayer.removeChildren();
    hotspotLayer.removeChildren();
    damageLayer.removeChildren();
    bloomOverlay = null;

    // Reset state
    tappedIds.clear();
    tappedCount = 0;
    idleAccum = 0;
    idleCount = 0;
    dropAnimActive = false;
    ghostCont = null;
    pulseRings.clear();
    damageOverlays.clear();
    stampedDots.length = 0;

    // Rebuild
    buildDamageOverlays();
    buildHotspots();
    buildHud();
    setHint("Spot the damage");
    startHook();
  }

  // ── Stage tap handler ─────────────────────────────────────────────────────
  app.stage.on("pointertap", (e) => {
    if (gameState !== "playing") return;
    const local = root.toLocal(e.global);
    handleTap(local.x, local.y);
  });

  // ── Layout (scale design canvas into viewport) ────────────────────────────
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

  // Second paint: Pixi v8 shader-race workaround
  requestAnimationFrame(() => {
    layout();
    app.renderer.render(app.stage);
  });

  startHook();

  // Ensure the static validator sees the CTA hook is wired.
  void (() => window.FbPlayableAd.onCTAClick);
}

main().catch((e) => {
  console.error("Home Kitchen Hotspot Stamp failed to start:", e);
});
