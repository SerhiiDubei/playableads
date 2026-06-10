// Fix the Floor — POV cozy flooring renovation playable (Stage 1 greybox prototype).
// PixiJS + GSAP. Procedural visuals by default; swaps to generated sprites when a
// matching key is present in cfg.assets (same pattern as templates/mad-mage-tower).
// FSM: intro → couch → carpet → crowbar → plank → finish → reveal → end.
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// ── Tunables (manifest defaults; brief params override) ───────────────────────
const COUCH_TILT = Number(cfg.params.couchTiltDeg ?? 7);
const HOOK_DELAY = Number(cfg.params.hookDelayMs ?? 1500);
const IDLE_HINT = Number(cfg.params.idleHintMs ?? 3000);
const AUTO_DEMO_AFTER = Number(cfg.params.autoDemoAfterIdles ?? 2);
const STEP_MS = Number(cfg.params.stepAnimMs ?? 500);
const PLANKS = Number(cfg.params.plankCount ?? 5);
const REVEAL_HOLD = Number(cfg.params.revealHoldMs ?? 2500);
const STEP = STEP_MS / 1000;

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

// ── Asset swap-in (Stage 2): procedural fallback when key absent ──────────────
const TEX: Record<string, Texture> = {};
async function preloadTextures(): Promise<void> {
  // Use load events (not img.decode()): decode() never settles in a hidden/
  // throttled tab, which would hang the whole boot. onload/onerror always fire.
  await Promise.all(
    Object.entries(cfg.assets).map(
      ([k, uri]) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            TEX[k] = Texture.from(img);
            resolve();
          };
          // Leave TEX[k] unset on failure → procedural fallback kicks in.
          img.onerror = () => resolve();
          img.src = uri;
        }),
    ),
  );
}
function tex(key: string): Texture | null {
  return TEX[key] ?? null;
}
// Use a sprite for `key` sized to w (height auto), else run the procedural draw.
function spriteOr(key: string, w: number, draw: () => Container): Container {
  const t = tex(key);
  if (!t) return draw();
  const sp = new Sprite(t);
  sp.anchor.set(0.5);
  sp.width = w;
  sp.scale.y = sp.scale.x;
  const c = new Container();
  c.addChild(sp);
  return c;
}
// Vertical slice i of n from a floor texture (per-plank art), else null.
function stripTexture(key: string, i: number, n: number): Texture | null {
  const base = tex(key);
  if (!base) return null;
  const sw = base.width / n;
  return new Texture({ source: base.source, frame: new Rectangle(i * sw, 0, sw, base.height) });
}

// ── Design canvas (fixed; scaled to fit the viewport — no reflow) ─────────────
const DW = 400, DH = 720;
// Full-floor rug (carpet) the couch stands on (design coords).
const CRX = 24, CRY = 300, CRW = 352, CRH = 352;
// Renovation floor patch, revealed once the rug is pulled up.
const PX = 40, PY = 352, PW = 320, PH = 280;
const HINTS: Record<string, string> = {
  couch: "Something's not right… Move the couch",
  carpet: "Pull up the rug",
  crowbar: "Pry out the rotten boards",
  plank: "Lay the new planks",
  finish: "Seal it with a glossy finish",
  reveal: "Beautiful. Real floors, real easy.",
};

type State = "intro" | "couch" | "carpet" | "crowbar" | "plank" | "finish" | "reveal" | "end";

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);
  app.stage.eventMode = "static";

  await preloadTextures();

  // Layers (design space).
  const root = new Container();
  app.stage.addChild(root);
  const room = new Container();
  const floorLayer = new Container();
  const couch = new Container();
  const fx = new Container();
  const warmth = new Container(); // reveal: warm light + sunbeam
  const toolbar = new Container();
  const hud = new Container();
  const overlay = new Container();
  root.addChild(room, floorLayer, couch, fx, warmth, toolbar, hud, overlay);

  // State.
  let state: State = "intro";
  let busy = false;
  let progress = 0;
  let idleAccum = 0;
  let idleCount = 0;
  let pulseTarget: Container | null = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function fit(t: Text, maxW: number): void {
    t.scale.set(1);
    if (t.width > maxW) t.scale.set(maxW / t.width);
  }
  function puff(x: number, y: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      const d = new Graphics().circle(0, 0, 3 + Math.random() * 4).fill({ color: 0xcdbfa6, alpha: 0.8 });
      d.position.set(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 16);
      fx.addChild(d);
      gsap.to(d, { y: d.y - 26 - Math.random() * 24, alpha: 0, duration: 0.6 + Math.random() * 0.3, ease: "power1.out", onComplete: () => d.destroy() });
    }
  }
  function sparkle(x: number, y: number): void {
    const s = new Text({ text: "✦", style: { fill: cfg.style.colors.accent, fontFamily: FONT, fontWeight: "bold", fontSize: 30 } });
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.alpha = 0;
    fx.addChild(s);
    gsap.timeline({ onComplete: () => s.destroy() })
      .to(s, { alpha: 1, duration: 0.12 })
      .to(s.scale, { x: 1.4, y: 1.4, duration: 0.3, ease: "back.out(2)" }, 0)
      .to(s, { alpha: 0, y: y - 18, duration: 0.4 }, 0.25);
  }
  function stopPulse(): void {
    if (pulseTarget) {
      gsap.killTweensOf(pulseTarget.scale);
      pulseTarget.scale.set(1);
      pulseTarget = null;
    }
    gsap.killTweensOf(patchGlow);
    patchGlow.alpha = 0;
  }
  function pulse(target: Container): void {
    pulseTarget = target;
    gsap.killTweensOf(target.scale);
    gsap.to(target.scale, { x: 1.06, y: 1.06, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }
  function pulsePatch(): void {
    gsap.killTweensOf(patchGlow);
    patchGlow.alpha = 0;
    gsap.to(patchGlow, { alpha: 0.9, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // ── Room (procedural cozy living room) ───────────────────────────────────────
  function buildRoom(): void {
    const wall = num("#efe3cd"), wallDark = num("#dccbac"), floorFar = num("#cab68f");
    const g = new Graphics();
    g.rect(0, 0, DW, 360).fill({ color: wall });
    g.rect(0, 280, DW, 80).fill({ color: wallDark });
    g.rect(0, 360, DW, DH - 360).fill({ color: floorFar });
    room.addChild(g);
    // Window with warm daylight.
    const win = new Graphics();
    win.roundRect(244, 56, 116, 150, 10).fill({ color: num("#cfe7f2") });
    win.roundRect(244, 56, 116, 150, 10).stroke({ width: 8, color: num("#f7eed8") });
    win.rect(300, 56, 4, 150).fill({ color: num("#f7eed8") });
    win.rect(244, 128, 116, 4).fill({ color: num("#f7eed8") });
    room.addChild(win);
    const glow = new Graphics().poly([248, 206, 360, 206, 330, 320, 210, 320]).fill({ color: num("#fff3cf"), alpha: 0.5 });
    room.addChild(glow);
    // Plant.
    const plant = new Graphics();
    plant.roundRect(40, 300, 44, 56, 8).fill({ color: num("#b6794a") });
    plant.circle(62, 286, 26).fill({ color: num("#6f9c5b") });
    plant.circle(44, 296, 18).fill({ color: num("#7faa66") });
    plant.circle(82, 298, 16).fill({ color: num("#5f8b4d") });
    room.addChild(plant);
    // Floor lamp.
    const lamp = new Graphics();
    lamp.rect(354, 150, 5, 180).fill({ color: num("#8a6b45") });
    lamp.poly([338, 150, 374, 150, 366, 110, 346, 110]).fill({ color: num("#f3d99a") });
    room.addChild(lamp);
    // Wall frames.
    const fr = new Graphics();
    fr.roundRect(96, 96, 58, 44, 4).fill({ color: num("#cdb189") }).stroke({ width: 5, color: num("#9c7c4f") });
    fr.roundRect(150, 150, 40, 50, 4).fill({ color: num("#d8c39c") }).stroke({ width: 5, color: num("#9c7c4f") });
    room.addChild(fr);
  }

  // ── Floor patch (subfloor · old planks · new planks · gloss · carpet) ─────────
  const subfloor = new Graphics();
  const rotBacking = new Graphics(); // dark rot showing through gaps/holes
  const oldStrips: Container[] = [];
  const newStrips: Container[] = [];
  const gloss = new Graphics();
  const carpet = new Container();
  const patchGlow = new Graphics();

  function buildPatch(): void {
    // Base subfloor (revealed after crowbar).
    subfloor.roundRect(PX, PY, PW, PH, 10).fill({ color: num("#b7a47e") });
    for (let i = 0; i < 6; i++) {
      subfloor.rect(PX, PY + (PH / 6) * i, PW, 2).fill({ color: num("#a08a60"), alpha: 0.6 });
    }
    floorLayer.addChild(subfloor);
    // Dark rot layer — shows through gaps, the broken plank and the hole.
    rotBacking.roundRect(PX, PY, PW, PH, 8).fill({ color: num("#160f08") });
    floorLayer.addChild(rotBacking);

    const sw = PW / PLANKS;
    // Old rotten planks — cold, desaturated, visibly damaged (the "problem").
    for (let i = 0; i < PLANKS; i++) {
      const c = new Container();
      const gap = 4 + (i % 2) * 4;        // warped boards leave dark gaps
      const bw = sw - gap;
      const st = stripTexture("floor-rotten.webp", i, PLANKS);
      if (st) {
        const sp = new Sprite(st);
        sp.width = bw; sp.height = PH;
        c.addChild(sp);
      } else {
      const gp = new Graphics();
      const base = shade(num("#574a37"), -0.16 + (i % 3) * 0.06);
      gp.roundRect(0, 0, bw, PH, 2).fill({ color: base });
      // Aged grain streaks.
      for (let k = 1; k <= 3; k++) {
        gp.moveTo(3, (PH / 4) * k).lineTo(bw - 4, (PH / 4) * k - 7).stroke({ width: 1, color: shade(base, -0.32), alpha: 0.5 });
      }
      // A long jagged crack down every board.
      gp.moveTo(bw * 0.52, 8).lineTo(bw * 0.36, PH * 0.3).lineTo(bw * 0.58, PH * 0.55).lineTo(bw * 0.4, PH - 10).stroke({ width: 2.5, color: num("#0d0905"), alpha: 0.85 });
      // Water/damp stains.
      if (i === 1 || i === 4) {
        gp.ellipse(bw * 0.5, PH * (i === 1 ? 0.46 : 0.26), bw * 0.42, PH * 0.2).fill({ color: num("#241a0e"), alpha: 0.72 });
      }
      // Greenish mold blotches.
      if (i === 0 || i === 3) {
        gp.ellipse(bw * 0.5, PH * 0.72, bw * 0.34, PH * 0.15).fill({ color: num("#4f5a39"), alpha: 0.7 });
        gp.circle(bw * 0.34, PH * 0.66, 5).fill({ color: num("#637049"), alpha: 0.65 });
        gp.circle(bw * 0.62, PH * 0.78, 4).fill({ color: num("#566237"), alpha: 0.6 });
      }
      // Broken board: a missing chunk (hole to the dark) + a bent rusty nail.
      if (i === 2) {
        gp.poly([bw * 0.18, PH * 0.4, bw * 0.82, PH * 0.34, bw * 0.7, PH * 0.64, bw * 0.28, PH * 0.7]).fill({ color: num("#120c06") });
        gp.moveTo(bw * 0.58, PH * 0.14).lineTo(bw * 0.74, PH * 0.05).stroke({ width: 3, color: num("#8d8276") });
        gp.circle(bw * 0.58, PH * 0.14, 3.4).fill({ color: num("#b9ad9c") });
      }
      c.addChild(gp);
      }
      c.position.set(PX + i * sw + gap / 2, PY);
      floorLayer.addChild(c);
      oldStrips.push(c);
    }
    // New warm-wood planks (hidden until laid).
    for (let i = 0; i < PLANKS; i++) {
      const c = new Container();
      const st = stripTexture("floor-new.webp", i, PLANKS);
      if (st) {
        const sp = new Sprite(st);
        sp.width = sw - 3; sp.height = PH;
        c.addChild(sp);
      } else {
      const gp = new Graphics();
      gp.roundRect(0, 0, sw - 3, PH, 3).fill({ color: shade(num("#c98a4b"), (i % 2) * 0.08) });
      gp.roundRect(0, 0, sw - 3, PH, 3).stroke({ width: 1.5, color: shade(num("#c98a4b"), -0.25) });
      for (let k = 1; k < 4; k++) gp.moveTo(2, (PH / 4) * k).lineTo(sw - 5, (PH / 4) * k - 6).stroke({ width: 1, color: shade(num("#c98a4b"), -0.18), alpha: 0.5 });
      c.addChild(gp);
      }
      c.position.set(PX + i * sw + 1.5, PY);
      c.alpha = 0;
      c.scale.set(1, 0.1);
      floorLayer.addChild(c);
      newStrips.push(c);
    }
    // Gloss sweep overlay (finish).
    gloss.roundRect(PX, PY, PW, PH, 10).fill({ color: num("#ffffff"), alpha: 0.18 });
    gloss.poly([PX, PY + PH * 0.2, PX + PW * 0.5, PY, PX + PW * 0.66, PY, PX, PY + PH * 0.5]).fill({ color: num("#ffffff"), alpha: 0.22 });
    gloss.alpha = 0;
    floorLayer.addChild(gloss);

    // Full-floor rug the couch stands on (pulled up first).
    const ct = tex("carpet.webp");
    if (ct) {
      const sp = new Sprite(ct);
      sp.width = CRW; sp.height = CRH;
      carpet.addChild(sp);
    } else {
      const cg = new Graphics();
      cg.roundRect(0, 0, CRW, CRH, 16).fill({ color: num("#9a6b4f") });
      cg.roundRect(12, 12, CRW - 24, CRH - 24, 12).stroke({ width: 7, color: num("#caa074") });
      cg.roundRect(30, 30, CRW - 60, CRH - 60, 10).stroke({ width: 3, color: num("#caa074"), alpha: 0.7 });
      carpet.addChild(cg);
    }
    carpet.position.set(CRX, CRY);
    carpet.pivot.set(0, 0);
    floorLayer.addChild(carpet);

    // Pulse highlight outline.
    patchGlow.roundRect(PX - 4, PY - 4, PW + 8, PH + 8, 14).stroke({ width: 5, color: ACCENT });
    patchGlow.alpha = 0;
    floorLayer.addChild(patchGlow);

    carpet.eventMode = "none";
    carpet.cursor = "pointer";
    carpet.on("pointertap", () => { if (state === "carpet") performStep(); });
  }

  // ── Couch ─────────────────────────────────────────────────────────────────────
  function buildCouch(): void {
    const fabric = num("#a9774b"), fabricDk = shade(fabric, -0.18), cushion = shade(fabric, 0.12);
    const drawn = (): Container => {
      const c = new Container();
      const g = new Graphics();
      g.roundRect(-150, -64, 300, 96, 18).fill({ color: fabric });          // back + base
      g.roundRect(-150, -64, 300, 40, 16).fill({ color: fabricDk });        // backrest top
      g.roundRect(-150, -10, 44, 50, 12).fill({ color: fabricDk });         // left arm
      g.roundRect(106, -10, 44, 50, 12).fill({ color: fabricDk });          // right arm
      g.roundRect(-100, -16, 92, 30, 10).fill({ color: cushion });          // seat cushion L
      g.roundRect(8, -16, 92, 30, 10).fill({ color: cushion });             // seat cushion R
      g.rect(-128, 40, 12, 18).fill({ color: num("#5a3f29") });             // legs
      g.rect(116, 40, 12, 18).fill({ color: num("#5a3f29") });
      c.addChild(g);
      return c;
    };
    couch.addChild(spriteOr("couch.webp", 300, drawn));
    couch.position.set(200, 372); // standing on the rug
    couch.pivot.set(0, 40); // tilt about the front-floor contact
    couch.eventMode = "none";
    couch.cursor = "pointer";
    couch.on("pointertap", () => { if (state === "couch") performStep(); });
  }

  // ── Toolbar (3 tools, lit in sequence) ────────────────────────────────────────
  interface Tool { cont: Container; bg: Graphics; check: Text; }
  const tools: Record<string, Tool> = {};
  function makeToolIcon(kind: string): Container {
    const t = tex(`tool-${kind}.webp`);
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0.5);
      sp.height = 46;
      sp.scale.x = sp.scale.y;
      const c = new Container();
      c.addChild(sp);
      return c;
    }
    const g = new Graphics();
    if (kind === "crowbar") {
      g.roundRect(-3, -18, 6, 30, 3).fill({ color: num("#c0392b") });
      g.poly([-3, 12, 3, 12, 10, 20, 2, 20]).fill({ color: num("#9c2c20") });
    } else if (kind === "plank") {
      g.roundRect(-18, -8, 36, 16, 3).fill({ color: num("#c98a4b") });
      g.moveTo(-14, 0).lineTo(14, -3).stroke({ width: 1.5, color: shade(num("#c98a4b"), -0.3) });
    } else {
      g.rect(-16, -12, 30, 12).fill({ color: num("#6f9c5b") });   // roller
      g.rect(2, 0, 4, 16).fill({ color: num("#8a6b45") });        // handle
    }
    const c = new Container();
    c.addChild(g);
    return c;
  }
  function buildToolbar(): void {
    const kinds = ["crowbar", "plank", "finish"];
    const gap = 92;
    kinds.forEach((kind, i) => {
      const cont = new Container();
      const bg = new Graphics();
      bg.roundRect(-34, -34, 68, 68, 16).fill({ color: num("#fff4df") }).stroke({ width: 3, color: shade(PRIMARY, 0) });
      const check = new Text({ text: "✓", style: { fill: "#2e7d32", fontFamily: FONT, fontWeight: "bold", fontSize: 26 } });
      check.anchor.set(0.5);
      check.position.set(24, -24);
      check.alpha = 0;
      cont.addChild(bg, makeToolIcon(kind), check);
      cont.position.set(200 + (i - 1) * gap, 662);
      toolbar.addChild(cont);
      tools[kind] = { cont, bg, check };
    });
    toolbar.alpha = 0;
    toolbar.visible = false;
  }
  function highlightTool(kind: string): void {
    for (const [k, t] of Object.entries(tools)) {
      const on = k === kind;
      t.bg.tint = on ? 0xffffff : 0xb8ad97;
      gsap.killTweensOf(t.cont.scale);
      t.cont.scale.set(1);
      if (on) gsap.to(t.cont.scale, { x: 1.12, y: 1.12, duration: 0.55, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }
  }
  function markToolDone(kind: string): void {
    const t = tools[kind];
    gsap.killTweensOf(t.cont.scale);
    t.cont.scale.set(1);
    t.bg.tint = 0xd8f0d8;
    gsap.fromTo(t.check, { alpha: 0 }, { alpha: 1, duration: 0.3 });
  }

  // ── HUD (hint · progress · clickable brand corner) ────────────────────────────
  const hint = new Text({ text: "", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 22, align: "center", wordWrap: true, wordWrapWidth: 320 } });
  const progBg = new Graphics();
  const progFill = new Graphics();
  function buildHud(): void {
    hint.anchor.set(0.5);
    hint.position.set(200, 44);
    hud.addChild(hint);
    progBg.roundRect(120, 78, 160, 14, 7).fill({ color: 0x000000, alpha: 0.13 });
    hud.addChild(progBg, progFill);
    drawProgress();
    // Brand corner — clickable any time → end card (skip).
    const brand = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 96, 34, 8).fill({ color: num("#fff4df") }).stroke({ width: 2, color: shade(PRIMARY, 0) });
    const t = new Text({ text: "FLOORco", style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: 16 } });
    t.anchor.set(0.5);
    t.position.set(48, 17);
    brand.addChild(bg, t);
    brand.position.set(14, 690);
    brand.eventMode = "static";
    brand.cursor = "pointer";
    brand.on("pointertap", (e) => { e.stopPropagation(); if (state !== "end") goReveal(true); });
    hud.addChild(brand);
  }
  function setHint(s: string): void {
    hint.text = s;
    fit(hint, 340);
    gsap.fromTo(hint, { alpha: 0.4 }, { alpha: 1, duration: 0.3 });
  }
  function drawProgress(): void {
    progFill.clear();
    if (progress > 0) progFill.roundRect(120, 78, Math.max(8, 160 * (progress / 100)), 14, 7).fill({ color: ACCENT });
  }

  // ── Work-zone tap-catcher (crowbar/plank/finish) ──────────────────────────────
  const workZone = new Graphics().rect(PX - 10, PY - 10, PW + 20, PH + 20).fill({ color: 0xffffff, alpha: 0.001 });
  workZone.hitArea = new Rectangle(PX - 10, PY - 10, PW + 20, PH + 20);
  workZone.eventMode = "none";
  workZone.cursor = "pointer";
  workZone.on("pointertap", () => { if (state === "crowbar" || state === "plank" || state === "finish") performStep(); });

  // ── State machine ─────────────────────────────────────────────────────────────
  function setState(s: State): void {
    state = s;
    idleAccum = 0;
    idleCount = 0;
    stopPulse();
    setHint(HINTS[s] ?? "");
    couch.eventMode = s === "couch" ? "static" : "none";
    carpet.eventMode = s === "carpet" ? "static" : "none";
    workZone.eventMode = s === "crowbar" || s === "plank" || s === "finish" ? "static" : "none";
    if (s === "couch") pulse(couch);
    else if (s === "carpet") pulse(carpet);
    else if (s === "crowbar" || s === "plank" || s === "finish") { pulsePatch(); highlightTool(s); }
  }

  function performStep(): void {
    if (busy) return;
    switch (state) {
      case "couch": return moveCouch();
      case "carpet": return ripCarpet();
      case "crowbar": return doCrowbar();
      case "plank": return doPlank();
      case "finish": return doFinish();
      default: return;
    }
  }

  function moveCouch(): void {
    busy = true;
    stopPulse();
    puff(200, 360);
    gsap.timeline({ onComplete: () => { busy = false; setState("carpet"); } })
      .to(couch, { rotation: 0, x: 200, y: 120, duration: STEP, ease: "power2.out" })
      .to(couch.scale, { x: 0.72, y: 0.72, duration: STEP, ease: "power2.out" }, 0);
  }

  function ripCarpet(): void {
    busy = true;
    stopPulse();
    puff(PX + PW / 2, PY + 30, 10);
    toolbar.visible = true;
    gsap.to(toolbar, { alpha: 1, duration: STEP });
    gsap.timeline({ onComplete: () => { busy = false; setState("crowbar"); } })
      .set(carpet, { pivot: { x: CRW, y: 0 }, x: CRX + CRW, y: CRY })
      .to(carpet.scale, { x: 0.04, duration: STEP * 1.1, ease: "power2.in" }, 0)
      .to(carpet, { rotation: -0.5, alpha: 0, duration: STEP * 1.1, ease: "power2.in" }, 0)
      .add(() => { carpet.visible = false; });
  }

  function doCrowbar(): void {
    busy = true;
    stopPulse();
    const tl = gsap.timeline({ onComplete: () => { busy = false; progress = 33; drawProgress(); markToolDone("crowbar"); sparkle(PX + PW / 2, PY + PH / 2); setState("plank"); } });
    tl.to(rotBacking, { alpha: 0, duration: STEP, ease: "power1.out" }, 0.2);
    oldStrips.forEach((s, i) => {
      tl.to(s, { y: s.y - 60, rotation: (Math.random() - 0.5) * 0.5, alpha: 0, duration: STEP * 0.9, ease: "back.in(1.4)", onStart: () => puff(s.x + 24, PY + 20, 4) }, i * 0.06);
    });
  }

  function doPlank(): void {
    busy = true;
    stopPulse();
    const tl = gsap.timeline({ onComplete: () => { busy = false; progress = 66; drawProgress(); markToolDone("plank"); sparkle(PX + PW / 2, PY + PH / 2); setState("finish"); } });
    newStrips.forEach((s, i) => {
      tl.fromTo(s, { alpha: 0, y: PY - 24 }, { alpha: 1, y: PY, duration: STEP * 0.5, ease: "power2.out" }, i * 0.08)
        .fromTo(s.scale, { y: 0.1 }, { y: 1, duration: STEP * 0.5, ease: "back.out(2)", onStart: () => puff(s.x + 24, PY + PH - 16, 3) }, i * 0.08);
    });
  }

  function doFinish(): void {
    busy = true;
    stopPulse();
    const shine = new Graphics().rect(0, 0, 70, PH).fill({ color: 0xffffff, alpha: 0.5 });
    shine.position.set(PX - 80, PY);
    floorLayer.addChild(shine);
    gsap.timeline({ onComplete: () => { busy = false; progress = 100; drawProgress(); markToolDone("finish"); shine.destroy(); sparkle(PX + PW / 2, PY + PH / 2); goReveal(false); } })
      .to(gloss, { alpha: 1, duration: STEP, ease: "power1.out" }, 0)
      .to(shine, { x: PX + PW + 20, duration: STEP * 1.3, ease: "power1.inOut" }, 0);
  }

  // ── Reveal + end card ─────────────────────────────────────────────────────────
  function goReveal(skip: boolean): void {
    if (state === "reveal" || state === "end") return;
    state = "reveal";
    busy = true;
    stopPulse();
    couch.eventMode = "none"; carpet.eventMode = "none"; workZone.eventMode = "none";
    gsap.to(toolbar, { alpha: 0, duration: 0.3, onComplete: () => (toolbar.visible = false) });
    if (skip) { setHint(""); showEndcard(); return; }
    setHint(HINTS.reveal);
    // Warm light wash + sunbeam.
    const wash = new Graphics().rect(0, 0, DW, DH).fill({ color: num("#ffcf8a"), alpha: 0 });
    const beam = new Graphics().poly([120, 56, 220, 56, 360, 470, 200, 470]).fill({ color: num("#fff3cf"), alpha: 0 });
    warmth.addChild(wash, beam);
    couch.visible = true;
    gsap.timeline({ onComplete: () => { busy = false; gsap.delayedCall(REVEAL_HOLD / 1000, showEndcard); } })
      .to(couch, { x: 200, y: 372, rotation: 0, duration: STEP * 1.4, ease: "power2.inOut" })
      .to(couch.scale, { x: 1, y: 1, duration: STEP * 1.4, ease: "power2.inOut" }, 0)
      .to(wash, { alpha: 0.22, duration: STEP * 1.4 }, 0)
      .to(beam, { alpha: 0.55, duration: STEP * 1.4 }, 0.2)
      .to(beam, { alpha: 0.3, duration: 0.8, yoyo: true, repeat: 1 }, ">");
  }

  function showEndcard(): void {
    if (state === "end") return;
    state = "end";
    overlay.removeChildren();
    overlay.addChild(new Graphics().rect(0, 0, DW, DH).fill({ color: 0x000000, alpha: 0.42 }));
    const panel = new Container();
    const pw = 320, ph = 400;
    panel.addChild(new Graphics().roundRect(-pw / 2, -ph / 2, pw, ph, 24).fill({ color: 0xfff4df }).stroke({ width: 5, color: PRIMARY }));
    // Brand logo.
    const logo = spriteOr("logo.webp", 120, () => {
      const c = new Container();
      c.addChild(new Graphics().roundRect(-86, -26, 172, 52, 12).fill({ color: PRIMARY }));
      const lt = new Text({ text: "FLOORco", style: { fill: "#fff4df", fontFamily: FONT, fontWeight: "bold", fontSize: 30 } });
      lt.anchor.set(0.5);
      c.addChild(lt);
      return c;
    });
    logo.position.set(0, -ph / 2 + 74);
    panel.addChild(logo);
    const tag = new Text({ text: "Real floors, real easy.", style: { fill: TXT, fontFamily: FONT, fontWeight: "bold", fontSize: 22, align: "center" } });
    tag.anchor.set(0.5);
    fit(tag, pw * 0.86);
    tag.position.set(0, -ph / 2 + 150);
    panel.addChild(tag);
    // Mini before/after chips (real textures when present).
    const chipY = -ph / 2 + 176;
    const chip = (key: string, x: number, fallback: number, accent: boolean): Container => {
      const t = tex(key);
      const c = new Container();
      if (t) {
        const sp = new Sprite(t);
        sp.width = 104; sp.height = 70; sp.position.set(x, chipY);
        c.addChild(sp);
      } else {
        const g = new Graphics().roundRect(x, chipY, 104, 70, 8).fill({ color: fallback });
        if (accent) g.stroke({ width: 2, color: ACCENT });
        c.addChild(g);
      }
      return c;
    };
    panel.addChild(chip("floor-rotten.webp", -118, num("#6b5b44"), false), chip("floor-new.webp", 14, num("#c98a4b"), true));
    // Primary CTA → onCTAClick.
    const cta = new Container();
    const cw = pw - 56;
    cta.addChild(new Graphics().roundRect(-cw / 2, -34, cw, 68, 34).fill({ color: ACCENT }).stroke({ width: 4, color: shade(ACCENT, -0.3) }));
    const ctaT = new Text({ text: cfg.copy.cta, style: { fill: "#3a2418", fontFamily: FONT, fontWeight: "bold", fontSize: 28 } });
    ctaT.anchor.set(0.5);
    fit(ctaT, cw * 0.84);
    cta.addChild(ctaT);
    cta.position.set(0, ph / 2 - 86);
    cta.eventMode = "static";
    cta.cursor = "pointer";
    cta.on("pointertap", (e) => { e.stopPropagation(); window.FbPlayableAd.onCTAClick(); });
    panel.addChild(cta);
    gsap.to(cta.scale, { x: 1.05, y: 1.05, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });
    // Replay.
    const replay = new Text({ text: "↻ Replay", style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "bold", fontSize: 20 } });
    replay.anchor.set(0.5);
    replay.position.set(0, ph / 2 - 32);
    replay.eventMode = "static";
    replay.cursor = "pointer";
    replay.on("pointertap", (e) => { e.stopPropagation(); resetAll(); });
    panel.addChild(replay);
    panel.position.set(DW / 2, DH / 2);
    panel.scale.set(0.7);
    overlay.addChild(panel);
    gsap.to(panel.scale, { x: 1, y: 1, duration: 0.45, ease: "back.out(1.5)" });
  }

  // ── Reset (replay) ──────────────────────────────────────────────────────────
  function resetAll(): void {
    overlay.removeChildren();
    warmth.removeChildren();
    fx.removeChildren();
    progress = 0;
    drawProgress();
    // Couch back to hook position (on the rug).
    couch.visible = true;
    couch.position.set(200, 372);
    couch.scale.set(1);
    couch.rotation = 0;
    // Rug restored.
    carpet.visible = true;
    carpet.alpha = 1;
    carpet.rotation = 0;
    carpet.scale.set(1);
    carpet.pivot.set(0, 0);
    carpet.position.set(CRX, CRY);
    // Planks reset.
    const sw = PW / PLANKS;
    oldStrips.forEach((s, i) => { s.alpha = 1; s.rotation = 0; s.position.set(PX + i * sw + (4 + (i % 2) * 4) / 2, PY); });
    newStrips.forEach((s, i) => { s.alpha = 0; s.scale.set(1, 0.1); s.position.set(PX + i * sw + 1.5, PY); });
    rotBacking.alpha = 1;
    gloss.alpha = 0;
    // Tools reset.
    for (const t of Object.values(tools)) { t.check.alpha = 0; t.bg.tint = 0xffffff; t.cont.scale.set(1); }
    toolbar.alpha = 0; toolbar.visible = false;
    setHint("");
    startHook();
  }

  // ── Idle nudge + auto-demo ────────────────────────────────────────────────────
  app.ticker.add((ticker) => {
    if (busy || state === "intro" || state === "reveal" || state === "end") return;
    idleAccum += ticker.deltaMS;
    if (idleAccum >= IDLE_HINT) {
      idleAccum = 0;
      idleCount++;
      setHint(HINTS[state] ?? "");
      if (state === "couch") pulse(couch);
      else if (state === "carpet") pulse(carpet);
      else pulsePatch();
      if (idleCount >= AUTO_DEMO_AFTER && !/dbg/.test(location.search)) performStep(); // auto-demo (off in QA)
    }
  });

  // ── Hook intro ─────────────────────────────────────────────────────────────────
  function startHook(): void {
    state = "intro";
    gsap.delayedCall(HOOK_DELAY / 1000, () => {
      puff(200, 372, 8);
      gsap.to(couch, { rotation: (COUCH_TILT * Math.PI) / 180, duration: 0.6, ease: "power2.out", onComplete: () => setState("couch") });
    });
  }

  // ── Layout (scale design canvas into viewport — contain) ──────────────────────
  function layout(): void {
    const s = Math.min(app.screen.width / DW, app.screen.height / DH);
    root.scale.set(s);
    root.position.set((app.screen.width - DW * s) / 2, (app.screen.height - DH * s) / 2);
  }

  // ── Build + start ──────────────────────────────────────────────────────────────
  buildRoom();
  buildPatch();
  floorLayer.addChild(workZone);
  buildCouch();
  buildToolbar();
  buildHud();
  layout();
  window.addEventListener("resize", layout);
  app.stage.on("pointertap", () => { if (state === "couch") performStep(); });
  startHook();

  // QA hook (only with ?dbg): drive the FSM deterministically from the console.
  if (/dbg/.test(location.search)) {
    (window as unknown as { __ftf: unknown }).__ftf = {
      get state() { return state; },
      step: () => performStep(),
      reset: () => resetAll(),
      end: () => goReveal(true),
      cta: () => window.FbPlayableAd.onCTAClick(),
      shot: () => app.renderer.extract.base64({ target: app.stage }),
    };
  }

  // Ensure the static validator sees the CTA hook is wired.
  void (() => window.FbPlayableAd.onCTAClick);
}

main().catch((e) => {
  // Surface boot failures instead of swallowing them silently.
  // eslint-disable-next-line no-console
  console.error("Fix the Floor failed to start:", e);
});
