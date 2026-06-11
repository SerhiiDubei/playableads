// Budget Slider: Bath Morph — RenoScope playable ad.
// ONE-ROOM compositing pass: a single bathroom shell (3 finish variants of the
// SAME room via images.edit) + 12 isolated object cutouts placed in fixed
// slots. The budget slider crosses 7 thresholds; each threshold swaps or adds
// INDIVIDUAL objects (pop animations), and twice the room finish itself
// crossfades. Painter's sorting: zIndex = object baseline (closer = on top).
// FSM: intro → interactive → locked → endcard.

import { Application, Container, Graphics, RenderTexture, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// ── Tunables ──────────────────────────────────────────────────────────────────
const MIN_BUDGET   = Number(cfg.params.minBudget   ?? 6000);
const MAX_BUDGET   = Number(cfg.params.maxBudget   ?? 25000);
const START_BUDGET = Number(cfg.params.startBudget ?? 6500);
const IDLE_HINT_MS       = Number(cfg.params.idleHintMs      ?? 6000);
const AUTO_DEMO_AFTER_MS = Number(cfg.params.autoDemoAfterMs ?? 8000);
const BRAND   = String(cfg.params.brand   ?? "RenoScope");
const TAGLINE = String(cfg.params.tagline ?? "See your budget take shape.");

// ── Helpers ───────────────────────────────────────────────────────────────────
function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }
function shade(c: number, f: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const t = f > 0 ? 255 : 0, a = Math.abs(f);
  return (Math.round(r+(t-r)*a)<<16)|(Math.round(g+(t-g)*a)<<8)|Math.round(b+(t-b)*a);
}

const PRIMARY = num(cfg.style.colors.primary);
const ACCENT  = num(cfg.style.colors.accent);
const BG      = num(cfg.style.colors.background);
const TXT     = cfg.style.colors.text;
const FONT    = cfg.style.font.family;

// ── Design canvas ─────────────────────────────────────────────────────────────
const DW = 400, DH = 680;
const ROOM_BOTTOM = 460;
const TICKER_CY = 498, CHIP_CY = 538;
const TRACK_Y = 586, TRACK_L = 32, TRACK_R = 368, TRACK_W = TRACK_R - TRACK_L;
const THUMB_R = 26;

// ── Upgrade plan: slots + steps ───────────────────────────────────────────────
// Slot = fixed position in the room (x center, baseline y, display width).
// wall=true → wall-mounted (no floor shadow, no painter offset tricks).
interface SlotDef { x: number; y: number; w: number; wall?: boolean; sway?: boolean; }
const SLOTS: Record<string, SlotDef> = {
  shower: { x: 318, y: 332, w: 118 },           // back-right corner
  towel:  { x: 220, y: 208, w: 74,  wall: true }, // back wall, fully above floor joint (~y211)
  tub:    { x: 245, y: 348, w: 238 },           // centre, slides left when shower arrives
  mirror: { x: 88,  y: 228, w: 92,  wall: true }, // above vanity, above floor joint
  vanity: { x: 88,  y: 396, w: 128 },           // front-left
  stool:  { x: 152, y: 446, w: 84 },            // front, near tub
  plant:  { x: 354, y: 452, w: 78, sway: true }, // front-right corner
};
const TUB_X_WITH_SHOWER = 168;                  // tub slides aside for the shower
// Per-asset overrides: dy lifts the sprite inside its slot (shadow stays on
// the floor for hung pieces), w overrides the slot width.
const OBJ_TWEAKS: Record<string, { dy?: number; w?: number }> = {
  "mirror-wide-led.webp": { w: 130, dy: -8 },
  "vanity-float.webp":    { dy: -22 },
  "vanity-wood.webp":     { dy: -10 },
};

// State 0 (everything below first threshold).
const BASE_SET: Record<string, string | null> = {
  shell: "shell-base.webp",
  tub: "tub-basic.webp", vanity: "vanity-basic.webp", mirror: "mirror-basic.webp",
  shower: null, towel: null, stool: null, plant: null,
};
// Each step: budget threshold, popup label, slot→asset changes (null keeps).
interface Step { t: number; label: string; set: Record<string, string | null>; }
const STEPS: Step[] = [
  { t: 8000,  label: "LED Mirror",             set: { mirror: "mirror-round-led.webp" } },
  { t: 10500, label: "Oak Vanity",             set: { vanity: "vanity-wood.webp" } },
  { t: 13000, label: "Towel Warmer + Greens",  set: { towel: "towel-bar.webp", plant: "plant.webp" } },
  { t: 15500, label: "Stone Walls + Oak Floor",set: { shell: "shell-mid.webp" } },
  { t: 18000, label: "Freestanding Tub",       set: { tub: "tub-freestanding.webp", stool: "stool-towels.webp" } },
  { t: 20500, label: "Floating Double Vanity", set: { vanity: "vanity-float.webp", mirror: "mirror-wide-led.webp" } },
  { t: 23000, label: "Marble Suite + Shower",  set: { shell: "shell-lux.webp", shower: "shower-glass.webp" } },
];
const STATE_NAMES = ["Essential", "Bright", "Refined", "Cozy", "Renewed", "Spa", "Designer", "Signature"];
const HYSTERESIS = 400; // going down, a threshold releases 400 below its value

// Composed slot→asset table for state N.
function setForState(n: number): Record<string, string | null> {
  const out: Record<string, string | null> = { ...BASE_SET };
  for (let i = 0; i < n; i++) Object.assign(out, STEPS[i].set);
  return out;
}

function budgetToX(b: number): number {
  return TRACK_L + ((b - MIN_BUDGET) / (MAX_BUDGET - MIN_BUDGET)) * TRACK_W;
}
function xToBudget(x: number): number {
  return MIN_BUDGET + Math.max(0, Math.min(1, (x - TRACK_L) / TRACK_W)) * (MAX_BUDGET - MIN_BUDGET);
}

// ── Texture cache ─────────────────────────────────────────────────────────────
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

// ── FSM ───────────────────────────────────────────────────────────────────────
type FSMState = "intro" | "interactive" | "locked" | "endcard";
let fsmState: FSMState = "intro";
let budget = START_BUDGET;
let curState = 0;
let maxSeen = 0;
let dragging = false;
let hadFirstDrag = false;
let lockChipShown = false;
let idleMs = 0, autoDemoMs = 0, autoDemoRan = false;

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await preloadTextures();

  const app = new Application();
  await app.init({
    width: window.innerWidth, height: window.innerHeight,
    background: BG, antialias: false,
    preference: "webgl", resolution: 1, autoDensity: false,
  });
  app.canvas.style.width  = window.innerWidth  + "px";
  app.canvas.style.height = window.innerHeight + "px";
  document.body.appendChild(app.canvas);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  const fullscreenBgGfx = new Graphics();
  app.stage.addChild(fullscreenBgGfx);

  const root = new Container();
  const roomWrap  = new Container();  // shells + objects breathe together
  const shellCont = new Container();
  const objCont   = new Container(); objCont.sortableChildren = true;
  const fxLayer   = new Container();
  const uiLayer   = new Container(); uiLayer.interactiveChildren = false;
  const hudLayer  = new Container();
  const overlayLayer = new Container();
  roomWrap.addChild(shellCont, objCont);
  root.addChild(roomWrap, fxLayer, uiLayer, hudLayer, overlayLayer);
  app.stage.addChild(root);

  // ── Room shells: same room, three finishes, alpha-crossfaded ─────────────
  // Bottom-anchored cover-fit: crop hits the ceiling, never the floor — object
  // slots are tied to the floor so they must stay put across viewports.
  const shellSprites: Record<string, Sprite> = {};
  for (const key of ["shell-base.webp", "shell-mid.webp", "shell-lux.webp"]) {
    const t = tex(key);
    if (!t) continue;
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 1);
    const s = Math.max(DW / t.width, ROOM_BOTTOM / t.height);
    sp.scale.set(s);
    sp.position.set(DW / 2, ROOM_BOTTOM);
    sp.alpha = key === "shell-base.webp" ? 1 : 0;
    shellCont.addChild(sp);
    shellSprites[key] = sp;
  }
  let activeShell = "shell-base.webp";
  function crossfadeShell(key: string): void {
    if (key === activeShell) return;
    const from = shellSprites[activeShell], to = shellSprites[key];
    activeShell = key;
    if (!to) return;
    gsap.killTweensOf(to); gsap.to(to, { alpha: 1, duration: 0.55, ease: "power1.inOut" });
    if (from) { gsap.killTweensOf(from); gsap.to(from, { alpha: 0, duration: 0.55, ease: "power1.inOut" }); }
  }

  // ── Object slots ───────────────────────────────────────────────────────────
  // Each slot: outer Container (position/zIndex/sway) + inner sprite (swapped).
  interface SlotRT { cont: Container; sprite: Sprite | null; asset: string | null; shadow: Graphics; }
  const slots: Record<string, SlotRT> = {};
  for (const [id, def] of Object.entries(SLOTS)) {
    const cont = new Container();
    cont.position.set(def.x, def.y);
    cont.zIndex = def.wall ? def.y - 200 : def.y; // wall items always behind floor items
    const shadow = new Graphics();
    cont.addChild(shadow);
    objCont.addChild(cont);
    slots[id] = { cont, sprite: null, asset: null, shadow };
    if (def.sway) {
      gsap.to(cont, { rotation: 0.015, duration: 2.4, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }
  }

  function buildObjSprite(asset: string, def: SlotDef): Sprite | null {
    const t = tex(asset);
    if (!t) return null;
    const tw = OBJ_TWEAKS[asset];
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 1);            // baseline anchor → sits on its slot point
    sp.scale.set((tw?.w ?? def.w) / t.width);
    sp.y = tw?.dy ?? 0;
    return sp;
  }

  function drawShadow(slot: SlotRT, def: SlotDef, asset: string | null): void {
    slot.shadow.clear();
    if (!asset || def.wall) return;
    const t = tex(asset);
    const w = def.w * 0.46;
    slot.shadow.ellipse(0, 2, w, Math.max(7, w * 0.16)).fill({ color: 0x000000, alpha: 0.16 });
    void t;
  }

  // Swap a slot's asset with pop in/out animations.
  function setSlotAsset(id: string, asset: string | null, animate: boolean): void {
    const slot = slots[id], def = SLOTS[id];
    if (slot.asset === asset) return;
    slot.asset = asset;
    const old = slot.sprite;
    if (old) {
      slot.sprite = null;
      if (animate) {
        gsap.killTweensOf(old); gsap.killTweensOf(old.scale);
        gsap.to(old.scale, { x: old.scale.x * 0.75, y: old.scale.y * 0.75, duration: 0.22, ease: "power2.in" });
        gsap.to(old, { alpha: 0, duration: 0.22, ease: "power2.in", onComplete: () => {
          slot.cont.removeChild(old); old.destroy();
        }});
      } else { slot.cont.removeChild(old); old.destroy(); }
    }
    drawShadow(slot, def, asset);
    if (!asset) return;
    const sp = buildObjSprite(asset, def);
    if (!sp) return;
    slot.sprite = sp;
    slot.cont.addChild(sp);
    if (animate) {
      const fs = sp.scale.x;
      sp.scale.set(fs * 0.6); sp.alpha = 0;
      gsap.to(sp, { alpha: 1, duration: 0.2, delay: 0.1 });
      gsap.to(sp.scale, { x: fs, y: fs, duration: 0.42, ease: "back.out(2.2)", delay: 0.1 });
    }
  }

  // ── Sparkle / puff FX ─────────────────────────────────────────────────────
  function sparkle(x: number, y: number, n = 10): void {
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2, dist = 24 + Math.random() * 30;
      const s = new Text({ text: "✦", style: { fill: cfg.style.colors.accent, fontFamily: FONT, fontWeight: "bold", fontSize: 13 + Math.random() * 13 } });
      s.anchor.set(0.5); s.position.set(x, y); s.alpha = 0;
      fxLayer.addChild(s);
      gsap.timeline({ onComplete: () => { if (!s.destroyed) s.destroy(); } })
        .to(s, { alpha: 1, duration: 0.1 })
        .to(s, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0, duration: 0.5, ease: "power1.out" }, 0);
    }
  }
  function puff(x: number, y: number, n = 5): void {
    for (let i = 0; i < n; i++) {
      const d = new Graphics().circle(0, 0, 3 + Math.random() * 5).fill({ color: ACCENT, alpha: 0.7 });
      d.position.set(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 18);
      fxLayer.addChild(d);
      gsap.to(d, { y: d.y - 28 - Math.random() * 18, alpha: 0, duration: 0.55 + Math.random() * 0.3, ease: "power1.out", onComplete: () => { if (!d.destroyed) d.destroy(); } });
    }
  }

  // ── Upgrade popup chip ────────────────────────────────────────────────────
  const popupCont = new Container(); popupCont.alpha = 0; fxLayer.addChild(popupCont);
  function showUpgradePopup(label: string, up: boolean): void {
    popupCont.removeChildren();
    const txt = new Text({ text: (up ? "+ " : "− ") + label, style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 16, align: "center" } });
    txt.anchor.set(0.5);
    const bw = Math.max(190, txt.width + 36), bh = 46;
    const bg = new Graphics();
    bg.roundRect(-bw / 2, -bh / 2, bw, bh, 12).fill({ color: PRIMARY });
    bg.roundRect(-bw / 2, -bh / 2, bw, bh, 12).stroke({ width: 3, color: ACCENT });
    popupCont.addChild(bg, txt);
    popupCont.position.set(DW / 2, 56);
    popupCont.alpha = 0; popupCont.scale.set(0.8);
    gsap.killTweensOf(popupCont); gsap.killTweensOf(popupCont.scale);
    gsap.timeline()
      .to(popupCont, { alpha: 1, duration: 0.16 })
      .to(popupCont.scale, { x: 1, y: 1, duration: 0.3, ease: "back.out(2)" }, 0)
      .to(popupCont, { alpha: 0, duration: 0.3, delay: 1.1 });
  }

  // ── Apply state diff ──────────────────────────────────────────────────────
  function applyState(n: number, animate: boolean): void {
    const prev = curState;
    curState = n;
    const want = setForState(n);
    crossfadeShell(want.shell as string);
    for (const id of Object.keys(SLOTS)) setSlotAsset(id, want[id] ?? null, animate);
    // Tub makes room for the shower in the Signature step.
    const tubX = want.shower ? TUB_X_WITH_SHOWER : SLOTS.tub.x;
    if (slots.tub.cont.x !== tubX) {
      gsap.killTweensOf(slots.tub.cont);
      if (animate) gsap.to(slots.tub.cont, { x: tubX, duration: 0.5, ease: "power2.inOut" });
      else slots.tub.cont.x = tubX;
    }
    if (animate && n !== prev) {
      const step = STEPS[Math.max(n, prev) - 1];
      if (step) {
        const changedSlot = Object.keys(step.set).find((k) => k !== "shell");
        const at = changedSlot ? SLOTS[changedSlot] : null;
        sparkle(at ? SLOTS[changedSlot!].x : DW / 2, at ? SLOTS[changedSlot!].y - 40 : 240, 12);
        showUpgradePopup(step.label, n > prev);
      }
      if (n > maxSeen) maxSeen = n;
    }
    updateTierChip();
  }

  // State from budget with hysteresis (release 400 below threshold on the way down).
  function stateForBudget(b: number): number {
    let n = curState;
    while (n < STEPS.length && b >= STEPS[n].t) n++;
    while (n > 0 && b < STEPS[n - 1].t - HYSTERESIS) n--;
    return n;
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  const instrText = new Text({
    text: "Slide your budget →",
    style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 18, align: "center" },
  });
  instrText.anchor.set(0.5);
  instrText.position.set(DW / 2, 22);
  hudLayer.addChild(instrText);
  gsap.to(instrText.scale, { x: 1.05, y: 1.05, duration: 0.8, yoyo: true, repeat: -1, ease: "sine.inOut" });

  const disclaimerText = new Text({
    text: "Estimates only. Final pricing varies by project, materials, and location.",
    style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 10, align: "center", wordWrap: true, wordWrapWidth: DW - 32 },
  });
  disclaimerText.anchor.set(0.5, 1);
  disclaimerText.alpha = 0.7;
  disclaimerText.position.set(DW / 2, DH - 6);
  hudLayer.addChild(disclaimerText);

  // ── Ticker + tier chip ────────────────────────────────────────────────────
  const tickerBg = new Graphics();
  tickerBg.roundRect(DW / 2 - 114, TICKER_CY - 26, 228, 54, 12).fill({ color: shade(PRIMARY, -0.35), alpha: 0.9 });
  uiLayer.addChild(tickerBg);
  const tickerText = new Text({ text: "", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 36 } });
  tickerText.anchor.set(0.5);
  tickerText.position.set(DW / 2 - 14, TICKER_CY);
  uiLayer.addChild(tickerText);
  const estLabel = new Text({ text: "est.", style: { fill: cfg.style.colors.accent, fontFamily: FONT, fontWeight: "bold", fontSize: 12 } });
  estLabel.anchor.set(0, 0.5);
  uiLayer.addChild(estLabel);
  function updateTicker(): void {
    tickerText.text = "$" + (budget / 1000).toFixed(1) + "K";
    estLabel.position.set(DW / 2 - 14 + tickerText.width / 2 + 6, TICKER_CY + 12);
  }

  const tierChipGfx = new Graphics(); uiLayer.addChild(tierChipGfx);
  const tierChipText = new Text({ text: "", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 13 } });
  tierChipText.anchor.set(0.5);
  uiLayer.addChild(tierChipText);
  function updateTierChip(): void {
    tierChipText.text = STATE_NAMES[curState];
    const cw = tierChipText.width + 26, ch = 27;
    tierChipGfx.clear();
    tierChipGfx.roundRect(DW / 2 - cw / 2, CHIP_CY - ch / 2, cw, ch, 13).fill({ color: PRIMARY });
    tierChipGfx.roundRect(DW / 2 - cw / 2, CHIP_CY - ch / 2, cw, ch, 13).stroke({ width: 2, color: ACCENT });
    tierChipText.position.set(DW / 2, CHIP_CY);
  }

  // ── Slider ────────────────────────────────────────────────────────────────
  const trackBg = new Graphics(); uiLayer.addChild(trackBg);
  const trackFill = new Graphics(); uiLayer.addChild(trackFill);
  const markerGfx = new Graphics(); uiLayer.addChild(markerGfx);
  const minLbl = new Text({ text: "$6K", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 11 } });
  minLbl.anchor.set(0, 0); minLbl.position.set(TRACK_L, TRACK_Y + 14); uiLayer.addChild(minLbl);
  const maxLbl = new Text({ text: "$25K", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 11 } });
  maxLbl.anchor.set(1, 0); maxLbl.position.set(TRACK_R, TRACK_Y + 14); uiLayer.addChild(maxLbl);

  const thumbWrap = new Container();
  const thumbGlowGfx = new Graphics();
  const thumbGfx = new Graphics();
  thumbWrap.addChild(thumbGlowGfx, thumbGfx);
  uiLayer.addChild(thumbWrap);

  const ghostFinger = new Container();
  ghostFinger.addChild(new Graphics().circle(0, 0, THUMB_R + 9).fill({ color: 0xffffff, alpha: 0.2 }));
  ghostFinger.addChild(new Graphics().circle(0, 0, 13).fill({ color: 0xffffff, alpha: 0.55 }));
  ghostFinger.alpha = 0;
  uiLayer.addChild(ghostFinger);

  function drawSlider(): void {
    const tx = budgetToX(budget);
    trackBg.clear();
    trackBg.roundRect(TRACK_L, TRACK_Y - 6, TRACK_W, 12, 6).fill({ color: shade(PRIMARY, -0.35) });
    trackFill.clear();
    trackFill.roundRect(TRACK_L, TRACK_Y - 6, Math.max(6, tx - TRACK_L), 12, 6).fill({ color: ACCENT });
    // Threshold diamonds: lit once passed.
    markerGfx.clear();
    for (let i = 0; i < STEPS.length; i++) {
      const mx = budgetToX(STEPS[i].t);
      const passed = curState > i;
      markerGfx.poly([mx, TRACK_Y - 14, mx + 5, TRACK_Y - 9, mx, TRACK_Y - 4, mx - 5, TRACK_Y - 9])
        .fill({ color: passed ? ACCENT : 0xffffff, alpha: passed ? 1 : 0.4 });
    }
    thumbWrap.position.set(tx, TRACK_Y);
    thumbGlowGfx.clear();
    if (dragging) {
      thumbGlowGfx.circle(0, 0, THUMB_R + 14).fill({ color: ACCENT, alpha: 0.18 });
      thumbGlowGfx.circle(0, 0, THUMB_R + 8).fill({ color: ACCENT, alpha: 0.22 });
    }
    thumbGfx.clear();
    thumbGfx.circle(0, 0, THUMB_R + 7).fill({ color: ACCENT, alpha: 0.22 });
    thumbGfx.circle(0, 0, THUMB_R).fill({ color: ACCENT });
    thumbGfx.circle(0, 0, THUMB_R).stroke({ width: 3, color: shade(ACCENT, 0.3) });
    thumbGfx.poly([-10, -8, 0, -19, 10, -8]).fill({ color: shade(ACCENT, 0.3) });
    thumbGfx.circle(0, 0, 8).fill({ color: shade(ACCENT, 0.25) });
    ghostFinger.position.set(tx, TRACK_Y);
  }

  // ── Lock chip ─────────────────────────────────────────────────────────────
  const lockChip = new Container(); lockChip.alpha = 0;
  const lockChipBg = new Graphics();
  const lockChipTxt = new Text({ text: "Lock my style", style: { fill: "#3a2418", fontFamily: FONT, fontWeight: "bold", fontSize: 17 } });
  lockChipTxt.anchor.set(0.5);
  lockChip.addChild(lockChipBg, lockChipTxt);
  lockChip.position.set(DW / 2, ROOM_BOTTOM - 36);
  overlayLayer.addChild(lockChip);
  function showLockChip(): void {
    if (lockChipShown) return;
    lockChipShown = true;
    const cw = 182, ch = 48;
    lockChipBg.clear();
    lockChipBg.roundRect(-cw / 2, -ch / 2, cw, ch, 24).fill({ color: ACCENT });
    lockChipBg.roundRect(-cw / 2, -ch / 2, cw, ch, 24).stroke({ width: 3, color: shade(ACCENT, 0.35) });
    lockChip.scale.set(0.7);
    lockChip.eventMode = "static"; lockChip.cursor = "pointer";
    lockChip.on("pointertap", (e) => { e.stopPropagation(); lockStyle(); });
    gsap.to(lockChip, { alpha: 1, duration: 0.4, ease: "power2.out" });
    gsap.to(lockChip.scale, { x: 1, y: 1, duration: 0.4, ease: "back.out(1.8)" });
    gsap.to(lockChip.scale, { x: 1.06, y: 1.06, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 0.5 });
  }
  function lockStyle(): void {
    if (fsmState !== "interactive") return;
    fsmState = "locked";
    gsap.killTweensOf(lockChip.scale);
    gsap.to(lockChip, { alpha: 0, duration: 0.3 });
    sparkle(DW / 2, 230, 16);
    gsap.delayedCall(0.9, showEndcard);
  }

  // ── Endcard: solid centred panel, cy-cursor rhythm, CTA inside ───────────
  function showEndcard(): void {
    if (fsmState === "endcard") return;
    fsmState = "endcard";
    const ov = new Graphics().rect(0, 0, DW, DH).fill({ color: 0x000000, alpha: 0 });
    overlayLayer.addChild(ov);
    gsap.to(ov, { alpha: 0.58, duration: 0.5 });
    gsap.to([instrText, popupCont], { alpha: 0, duration: 0.3 });

    const PW = DW - 48, PH = 442;
    const panel = new Container();
    const panBg = new Graphics();
    panBg.roundRect(0, 0, PW, PH, 22).fill({ color: num("#f4f6f7") });
    panBg.roundRect(0, 0, PW, PH, 22).stroke({ width: 4, color: ACCENT });
    panel.addChild(panBg);

    let cy = 18;
    const brandBg = new Graphics().roundRect(0, 0, 200, 42, 12).fill({ color: PRIMARY });
    const brandTxt = new Text({ text: BRAND, style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "bold", fontSize: 22 } });
    brandTxt.anchor.set(0.5); brandTxt.position.set(100, 21);
    const brandCont = new Container();
    brandCont.addChild(brandBg, brandTxt);
    brandCont.position.set((PW - 200) / 2, cy);
    panel.addChild(brandCont);
    cy += 52;

    const tagT = new Text({ text: TAGLINE, style: { fill: PRIMARY, fontFamily: FONT, fontWeight: "bold", fontSize: 13, align: "center" } });
    tagT.anchor.set(0.5, 0); tagT.position.set(PW / 2, cy);
    panel.addChild(tagT);
    cy += tagT.height + 8;

    const hlT = new Text({
      text: "Your " + STATE_NAMES[curState] + " bath — $" + (budget / 1000).toFixed(1) + "K est.",
      style: { fill: 0x1a1a1a, fontFamily: FONT, fontWeight: "bold", fontSize: 23, align: "center", wordWrap: true, wordWrapWidth: PW - 40 },
    });
    hlT.anchor.set(0.5, 0); hlT.position.set(PW / 2, cy);
    panel.addChild(hlT);
    cy += hlT.height + 8;

    const elT = new Text({
      text: "Free consult includes a 3D design.\nLicensed & insured in your state.",
      style: { fill: 0x2a2a2a, fontFamily: FONT, fontWeight: "normal", fontSize: 14, align: "center", wordWrap: true, wordWrapWidth: PW - 40 },
    });
    elT.anchor.set(0.5, 0); elT.position.set(PW / 2, cy);
    panel.addChild(elT);
    cy += elT.height + 12;

    // Photo strip = LIVE snapshot of the composed room (shell + objects).
    const stripW = PW - 28, stripH = 90;
    const stripCont = new Container();
    const roomRT = RenderTexture.create({ width: DW, height: ROOM_BOTTOM, resolution: 1 });
    const keepScale = roomWrap.scale.x;
    gsap.killTweensOf(roomWrap.scale);
    roomWrap.scale.set(1);
    app.renderer.render({ container: roomWrap, target: roomRT, clear: true });
    roomWrap.scale.set(keepScale);
    const sp = new Sprite(roomRT);
    // Width-fit, framed on the fixture line (~design y 228-350: tub, vanity,
    // shower base) rather than bare wall or floor.
    const k = stripW / DW;
    sp.scale.set(k);
    sp.anchor.set(0.5, 1);
    sp.position.set(stripW / 2, stripH + 110 * k);
    const m = new Graphics().roundRect(0, 0, stripW, stripH, 10).fill({ color: 0xffffff });
    stripCont.addChild(m, sp);
    sp.mask = m;
    stripCont.addChild(new Graphics().roundRect(0, 0, stripW, stripH, 10).stroke({ width: 2, color: PRIMARY, alpha: 0.6 }));
    stripCont.position.set(14, cy);
    panel.addChild(stripCont);
    cy += stripH + 10;

    const disT = new Text({
      text: "Estimates only. Final pricing varies by project, materials, and location.",
      style: { fill: 0x666666, fontFamily: FONT, fontWeight: "normal", fontSize: 11, align: "center", wordWrap: true, wordWrapWidth: PW - 40 },
    });
    disT.anchor.set(0.5, 0); disT.position.set(PW / 2, cy);
    panel.addChild(disT);
    cy += disT.height + 14;

    const inCtaW = PW - 28, inCtaH = 56;
    const inCta = new Container();
    const inCtaBg = new Graphics();
    inCtaBg.roundRect(0, 0, inCtaW, inCtaH, 28).fill({ color: ACCENT });
    inCtaBg.roundRect(0, 0, inCtaW, inCtaH, 28).stroke({ width: 3, color: shade(ACCENT, -0.25) });
    const inCtaTxt = new Text({ text: cfg.copy.cta, style: { fill: "#3a2418", fontFamily: FONT, fontWeight: "bold", fontSize: 19 } });
    inCtaTxt.anchor.set(0.5); inCtaTxt.position.set(inCtaW / 2, inCtaH / 2);
    if (inCtaTxt.width > inCtaW * 0.88) inCtaTxt.scale.set((inCtaW * 0.88) / inCtaTxt.width);
    inCta.addChild(inCtaBg, inCtaTxt);
    inCta.eventMode = "static"; inCta.cursor = "pointer";
    inCta.on("pointertap", (e) => { e.stopPropagation(); window.FbPlayableAd.onCTAClick(); });
    inCta.position.set(14, cy);
    panel.addChild(inCta);
    gsap.to(inCta.scale, { x: 1.03, y: 1.03, duration: 0.68, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 0.5 });

    panel.position.set((DW - PW) / 2, (DH - PH) / 2 - 12);
    panel.scale.set(0.82);
    panel.alpha = 0;
    overlayLayer.addChild(panel);
    gsap.to(panel, { alpha: 1, duration: 0.28, delay: 0.05 });
    gsap.to(panel.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(1.7)", delay: 0.05 });
  }

  // ── Scene update on every budget change ───────────────────────────────────
  function updateScene(animate = true): void {
    const n = stateForBudget(budget);
    if (n !== curState) applyState(n, animate);
    drawSlider();
    updateTicker();
    if (maxSeen >= STEPS.length && !lockChipShown && !dragging) showLockChip();
  }

  // ── Pointer / drag ────────────────────────────────────────────────────────
  function toDesign(sx: number, sy: number): [number, number] {
    const s = root.scale.x, ox = root.x, oy = root.y;
    return [(sx - ox) / s, (sy - oy) / s];
  }
  function isNearTrack(dx: number, dy: number): boolean {
    return dx >= TRACK_L - 24 && dx <= TRACK_R + 24 && Math.abs(dy - TRACK_Y) <= 36;
  }
  app.stage.on("pointerdown", (e) => {
    if (fsmState === "endcard" || fsmState === "locked") return;
    const [dx, dy] = toDesign(e.clientX, e.clientY);
    if (!isNearTrack(dx, dy)) return;
    dragging = true; idleMs = 0; autoDemoMs = 0; hadFirstDrag = true;
    gsap.killTweensOf(ghostFinger); ghostFinger.alpha = 0;
    budget = Math.max(MIN_BUDGET, Math.min(MAX_BUDGET, Math.round(xToBudget(dx) / 100) * 100));
    updateScene();
  });
  app.stage.on("pointermove", (e) => {
    if (!dragging || fsmState === "endcard") return;
    const [dx] = toDesign(e.clientX, e.clientY);
    const prevB = budget;
    budget = Math.max(MIN_BUDGET, Math.min(MAX_BUDGET, Math.round(xToBudget(dx) / 100) * 100));
    idleMs = 0; autoDemoMs = 0;
    if (Math.floor(prevB / 1500) !== Math.floor(budget / 1500)) puff(budgetToX(budget), TRACK_Y - 18, 4);
    updateScene();
  });
  const onUp = (): void => {
    dragging = false;
    drawSlider();
    if (maxSeen >= STEPS.length && !lockChipShown) showLockChip();
  };
  app.stage.on("pointerup", onUp);
  app.stage.on("pointerupoutside", onUp);

  // ── Ghost finger hint ─────────────────────────────────────────────────────
  let ghostTween: gsap.core.Timeline | null = null;
  function startGhostHint(): void {
    if (ghostTween) { ghostTween.kill(); ghostTween = null; }
    const sx = budgetToX(budget), ex = budgetToX(MAX_BUDGET * 0.85);
    ghostFinger.position.set(sx, TRACK_Y);
    ghostTween = gsap.timeline({ repeat: -1 })
      .to(ghostFinger, { alpha: 0.85, duration: 0.4 })
      .to(ghostFinger, { x: ex, duration: 1.3, ease: "power1.inOut" })
      .to(ghostFinger, { alpha: 0, duration: 0.28 })
      .to(ghostFinger, { x: sx, duration: 0 })
      .to({}, { duration: 0.75 });
  }

  // ── Auto-demo: slider sweeps to max, upgrading the room step by step ─────
  function runAutoDemo(): void {
    if (autoDemoRan || hadFirstDrag || fsmState !== "interactive") return;
    autoDemoRan = true;
    gsap.killTweensOf(ghostFinger); ghostFinger.alpha = 0;
    const proxy = { v: budget };
    gsap.to(proxy, {
      v: MAX_BUDGET, duration: 7.5, ease: "none",
      onUpdate: () => {
        if (hadFirstDrag || fsmState !== "interactive") return;
        budget = Math.round(proxy.v / 100) * 100;
        updateScene();
      },
      onComplete: () => { if (!hadFirstDrag && fsmState === "interactive") showLockChip(); },
    });
  }

  // ── Idle ticker ───────────────────────────────────────────────────────────
  app.ticker.add((ticker) => {
    if (fsmState !== "interactive" || dragging) return;
    const dms = Math.min(50, ticker.deltaMS);
    idleMs += dms; autoDemoMs += dms;
    if (idleMs >= IDLE_HINT_MS && !hadFirstDrag && ghostFinger.alpha < 0.05) startGhostHint();
    if (autoDemoMs >= AUTO_DEMO_AFTER_MS) runAutoDemo();
  });

  // ── Room breathe (whole room together — shells + objects stay glued) ─────
  gsap.to(roomWrap.scale, { x: 1.006, y: 1.006, duration: 4.2, yoyo: true, repeat: -1, ease: "sine.inOut", transformOrigin: "50% 50%" });
  roomWrap.pivot.set(DW / 2, ROOM_BOTTOM / 2);
  roomWrap.position.set(DW / 2, ROOM_BOTTOM / 2);

  // ── Layout ────────────────────────────────────────────────────────────────
  function layout(): void {
    const w = window.innerWidth, h = window.innerHeight;
    const s = Math.min(w / DW, h / DH);
    root.scale.set(s);
    root.position.set((w - DW * s) / 2, (h - DH * s) / 2);
    fullscreenBgGfx.clear();
    fullscreenBgGfx.rect(0, 0, w, h).fill({ color: BG });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  applyState(0, false);
  updateTicker();
  updateTierChip();
  drawSlider();
  layout();
  window.addEventListener("resize", () => {
    app.canvas.style.width  = window.innerWidth  + "px";
    app.canvas.style.height = window.innerHeight + "px";
    layout();
  });

  fsmState = "intro";
  gsap.delayedCall(0.45, () => {
    fsmState = "interactive";
    startGhostHint();
  });

  // Pixi v8 shader-race workaround: render, then re-layout + render next frame.
  app.renderer.render(app.stage);
  requestAnimationFrame(() => { layout(); app.renderer.render(app.stage); });

  // Validator greps this literal
  void (() => window.FbPlayableAd.onCTAClick);
}

main().catch((e) => { console.error("Budget Slider Bath Morph failed:", e); });
