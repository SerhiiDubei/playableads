import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";
import { buildEndcard } from "../../src/assetgen/kit/ui.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// ── Meta playable API ─────────────────────────────────────────────────────────
declare global {
  interface Window {
    FbPlayableAd: { onCTAClick: () => void };
  }
}

// ── Texture registry (procedural v1 ships zero assets; this is future-proofing) ─
const TEX: Record<string, Texture> = {};
async function preloadTextures(): Promise<void> {
  await Promise.all(
    Object.entries(cfg.assets ?? {}).map(async ([k, uri]) => {
      if (!/\.(webp|png)$/i.test(k)) return;
      const img = new Image();
      img.src = uri as string;
      try { await img.decode(); } catch { return; }
      TEX[k] = Texture.from(img);
    }),
  );
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
  const data = cfg.assets?.["font.woff2"] as string | undefined;
  if (!data) return;
  try {
    const ff = new FontFace("BrandFont", `url(${data})`);
    await ff.load();
    document.fonts.add(ff);
    FONT = `BrandFont, ${cfg.style.font.family}`;
  } catch { /* keep fallback */ }
}

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }

// ── Palette ─────────────────────────────────────────────────────────────────
const COL_GRASS   = num(cfg.style.colors.background); // roadside (gutters)
const COL_PRIMARY = num(cfg.style.colors.primary);    // CTA / "safe" green
const COL_ACCENT  = num(cfg.style.colors.accent);     // warning amber
const COL_TEXT    = num(cfg.style.colors.text);
const COL_ASPHALT = 0x5A6270; // Traffic Run palette: cool blue-grey asphalt
const COL_ASPHALT2= 0x535B69; // slightly darker centre-lane facet
const COL_LINE    = 0xF3F0E2; // warm off-white lane dashes
const COL_EDGE    = 0xC9CCD4; // curb / road edge
const COL_PLAYER  = 0x3D7BE0; // fallback player blue (sprite preferred)
const COL_DANGER  = 0xE14B43; // hazard red
const COL_SHADOW  = 0x2E3440; // soft AO shadow under sprites
const COL_DARK     = 0x10161E;

// ── Tunables (manifest params override sensible defaults) ──────────────────────
const P = cfg.params as Record<string, number | string | boolean>;
const DURATION   = Number(P.gameDurationSec ?? 20);
const LANES      = Number(P.laneCount ?? 3);
const TOTAL      = Number(P.totalThreats ?? 5);
const BASE_SCROLL= Number(P.baseScrollPxPerSec ?? 520);
const BRAKE_FACT = Number(P.brakeScrollFactor ?? 0.32);
const SUBTITLE   = String(P.subtitle ?? "Good drivers still need insurance.");

// ── Threat timeline ────────────────────────────────────────────────────────────
// kind: how it's beaten · lane: which lane it blocks (dog/oncoming ignore lane)
type Kind = "cyclist" | "car" | "dog" | "double" | "oncoming";
interface ThreatDef { at: number; kind: Kind; lane?: number; free?: number; }
const TIMELINE: ThreatDef[] = [
  { at: 2.2, kind: "cyclist", lane: 1 },          // dodge: leave the centre lane
  { at: 5.4, kind: "car",     lane: 2 },          // dodge: leave the right lane
  { at: 8.6, kind: "dog" },                         // brake: let it cross
  { at: 12.0, kind: "double", free: 1 },           // precision: only lane 1 is open
  { at: 15.4, kind: "oncoming" },                   // unavoidable — not your fault
];

async function main(): Promise<void> {
  if (!window.FbPlayableAd) window.FbPlayableAd = { onCTAClick: () => {} };
  void (() => window.FbPlayableAd.onCTAClick); // validator grep anchor

  await preloadTextures();
  await loadBrandFont();

  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    background: COL_GRASS,
    antialias: true,
    preference: "webgl",
    resolution: 1,
    autoDensity: false,
  });
  app.canvas.style.width = window.innerWidth + "px";
  app.canvas.style.height = window.innerHeight + "px";
  app.canvas.style.touchAction = "none"; // touch-native: don't let the page scroll/zoom on swipe
  document.body.appendChild(app.canvas);

  // ── Layers ──
  const bgLayer   = new Container(); bgLayer.interactiveChildren = false;
  const gameLayer = new Container(); gameLayer.interactiveChildren = false;
  const fxLayer   = new Container(); fxLayer.interactiveChildren = false;
  const uiLayer   = new Container();
  const overlay   = new Container();
  app.stage.addChild(bgLayer, gameLayer, fxLayer, uiLayer, overlay);

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // ─────────────────────── LAYOUT ───────────────────────
  // All positions derive from current screen size + lane geometry so the game
  // reflows on any viewport (responsive = recompute, not fluid CSS).
  const L = {
    W: 0, H: 0,
    roadL: 0, roadR: 0, roadW: 0,
    laneW: 0, carY: 0, carW: 0, carH: 0,
  };
  function laneX(i: number): number { return L.roadL + L.laneW * (i + 0.5); }

  function layout(): void {
    const W = app.screen.width, H = app.screen.height;
    L.W = W; L.H = H;
    L.roadW = Math.min(W * 0.84, H * 0.55);
    L.roadL = (W - L.roadW) / 2;
    L.roadR = L.roadL + L.roadW;
    L.laneW = L.roadW / LANES;
    L.carW = Math.min(L.laneW * 0.62, 86);
    L.carH = L.carW * 1.7;
    L.carY = H * 0.8;
  }
  layout();

  // ─────────────────────── ROAD ───────────────────────
  const road = new Graphics();
  bgLayer.addChild(road);
  const dashes = new Container();
  bgLayer.addChild(dashes);

  function drawRoad(): void {
    road.clear();
    // grass gutters already shown by stage background; paint asphalt slab
    road.rect(L.roadL, 0, L.roadW, L.H).fill(COL_ASPHALT);
    // subtle centre-strip shade for depth
    road.rect(L.roadL + L.laneW, 0, L.laneW, L.H).fill(COL_ASPHALT2);
    // solid road edges
    road.rect(L.roadL - 5, 0, 6, L.H).fill(COL_EDGE);
    road.rect(L.roadR - 1, 0, 6, L.H).fill(COL_EDGE);
  }

  // Scrolling dashed lane separators (the only thing that sells "we're moving")
  const DASH_H = 46, DASH_GAP = 38;
  function buildDashes(): void {
    dashes.removeChildren();
    const span = DASH_H + DASH_GAP;
    const rows = Math.ceil(L.H / span) + 2;
    for (let sep = 1; sep < LANES; sep++) {
      const x = L.roadL + L.laneW * sep;
      for (let r = 0; r < rows; r++) {
        const d = new Graphics();
        d.roundRect(-4, -DASH_H / 2, 8, DASH_H, 3).fill(COL_LINE);
        d.x = x; d.y = r * span;
        (d as any)._row = r;
        dashes.addChild(d);
      }
    }
  }
  drawRoad();
  buildDashes();

  // ── ROADSIDE PROPS: low-poly trees scrolling in the grass gutters ──
  const props = new Container(); props.interactiveChildren = false;
  bgLayer.addChild(props);
  const treeList: { node: Sprite }[] = [];
  function buildProps(): void {
    props.removeChildren(); treeList.length = 0;
    const gut = Math.min(L.roadL, L.W - L.roadR);
    if (gut < 18) return; // no room beside the road
    const tw = Math.max(26, Math.min(60, gut * 1.25));
    const span = L.H / 3;
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        const sp = makeSprite("tree.webp", tw);
        if (!sp) return;
        sp.x = side < 0 ? L.roadL * 0.5 : L.roadR + (L.W - L.roadR) * 0.5;
        sp.y = i * span + (side < 0 ? 0 : span * 0.5);
        props.addChild(sp);
        treeList.push({ node: sp });
      }
    }
  }
  buildProps();

  // ─────────────────────── PLAYER CAR ───────────────────────
  function makeCar(bodyColor: number, w: number, h: number, hazard = false): Container {
    const c = new Container();
    const g = new Graphics();
    // shadow
    g.roundRect(-w / 2 + 3, -h / 2 + 6, w, h, 12).fill({ color: 0x000000, alpha: 0.22 });
    // body
    g.roundRect(-w / 2, -h / 2, w, h, 12).fill(bodyColor);
    // roof / cabin
    g.roundRect(-w * 0.34, -h * 0.18, w * 0.68, h * 0.42, 7).fill({ color: 0x0d1b2a, alpha: 0.28 });
    // windshield (front = top)
    g.roundRect(-w * 0.32, -h * 0.38, w * 0.64, h * 0.18, 6).fill(0xbfe3ff);
    // rear window
    g.roundRect(-w * 0.30, h * 0.22, w * 0.60, h * 0.15, 6).fill({ color: 0xbfe3ff, alpha: 0.65 });
    // headlights
    g.circle(-w * 0.3, -h * 0.46, 4).fill(0xfff6cc);
    g.circle(w * 0.3, -h * 0.46, 4).fill(0xfff6cc);
    c.addChild(g);
    if (hazard) {
      const hz = new Graphics();
      hz.roundRect(-w * 0.3, h * 0.30, w * 0.6, 6, 3).fill(COL_ACCENT);
      c.addChild(hz);
      gsap.to(hz, { alpha: 0.2, duration: 0.4, repeat: -1, yoyo: true });
    }
    return c;
  }

  // Build a vehicle node: generated sprite (preferred) + an engine-drawn soft
  // shadow (sprites carry no baked shadow), or the procedural car as fallback.
  function vehicle(key: string, targetW: number, fallbackColor: number, hazard = false): Container {
    const c = new Container();
    const sh = new Graphics();
    sh.ellipse(0, targetW * 0.14, targetW * 0.46, targetW * 0.74).fill({ color: COL_SHADOW, alpha: 0.2 });
    c.addChild(sh);
    const sp = makeSprite(key, targetW);
    c.addChild(sp ?? makeCar(fallbackColor, targetW, targetW * 1.7, hazard));
    return c;
  }

  let lane = Math.floor(LANES / 2);
  const car = vehicle("player-car.webp", L.carW, COL_PLAYER);
  car.x = laneX(lane); car.y = L.carY;
  gameLayer.addChild(car);

  // exhaust puff so the static car reads as "driving"
  const puff = new Graphics();
  puff.circle(0, 0, 7).fill({ color: 0xffffff, alpha: 0.5 });
  puff.x = car.x; puff.y = car.y + L.carH * 0.5;
  fxLayer.addChild(puff);

  // ─────────────────────── STATE ───────────────────────
  let running = true;
  let braking = false;
  let gameTime = 0;
  let avoided = 0;          // honest count over threats 1..4
  let resolvedCount = 0;
  let ended = false;
  let firstInput = false;

  interface Live {
    def: ThreatDef;
    node: Container;
    y: number;
    x?: number;       // for dog / oncoming horizontal motion
    vx?: number;
    lane?: number;
    free?: number;
    resolved: boolean;
    inevitable: boolean;
  }
  const live: Live[] = [];
  let spawnIdx = 0;

  // ─────────────────────── HUD ───────────────────────
  const hud = new Container();
  uiLayer.addChild(hud);
  const hudChips = new Graphics(); // dark chips behind HUD text for contrast over grass
  hud.addChild(hudChips);

  const timerTxt = new Text({
    text: "0:20",
    style: { fontFamily: FONT, fontSize: 30, fontWeight: "800", fill: COL_TEXT },
  });
  timerTxt.anchor.set(0.5, 0);
  hud.addChild(timerTxt);

  const counterTxt = new Text({
    text: `Avoided 0/${TOTAL}`,
    style: { fontFamily: FONT, fontSize: 19, fontWeight: "700", fill: COL_TEXT },
  });
  counterTxt.anchor.set(0, 0);
  hud.addChild(counterTxt);

  // tiny pips for avoided threats
  const pips = new Container();
  hud.addChild(pips);
  function drawPips(): void {
    pips.removeChildren();
    for (let i = 0; i < TOTAL; i++) {
      const p = new Graphics();
      p.circle(0, 0, 6).fill(i < avoided ? COL_PRIMARY : 0xffffff);
      if (i >= avoided) p.alpha = 0.3;
      p.x = i * 18; p.y = 0;
      pips.addChild(p);
    }
  }
  drawPips();

  function layoutHud(): void {
    timerTxt.x = L.W / 2; timerTxt.y = 14;
    counterTxt.x = 16; counterTxt.y = 16;
    pips.x = 18; pips.y = 46;
    hudChips.clear();
    const lw = Math.max(counterTxt.width, (TOTAL - 1) * 18 + 12) + 20;
    hudChips.roundRect(8, 8, lw, 60, 12).fill({ color: COL_DARK, alpha: 0.34 });
    const tw = timerTxt.width + 28;
    hudChips.roundRect(L.W / 2 - tw / 2, 6, tw, 44, 12).fill({ color: COL_DARK, alpha: 0.34 });
  }
  layoutHud();

  // ─────────────────────── TUTORIAL HINT ───────────────────────
  const hint = new Container();
  uiLayer.addChild(hint);
  const hand = new Graphics();
  hand.circle(0, 0, 16).fill(COL_TEXT);
  hand.circle(0, 0, 22).stroke({ width: 3, color: COL_TEXT, alpha: 0.6 });
  hint.addChild(hand);
  const hintTxt = new Text({
    text: "Swipe to change lane · hold to brake",
    style: { fontFamily: FONT, fontSize: 16, fontWeight: "700", fill: COL_TEXT, align: "center" },
  });
  hintTxt.anchor.set(0.5);
  hint.addChild(hintTxt);
  function layoutHint(): void {
    hand.x = 0; hand.y = -34;
    hintTxt.x = 0; hintTxt.y = 18;
    hint.x = L.W / 2; hint.y = L.H * 0.5;
  }
  layoutHint();
  // looping swipe gesture demo
  gsap.fromTo(hand, { x: -36 }, { x: 36, duration: 1.0, repeat: -1, yoyo: true, ease: "sine.inOut" });

  function killHint(): void {
    if (!hint.parent) return;
    gsap.to(hint, { alpha: 0, duration: 0.25, onComplete: () => hint.destroy() });
  }

  // ─────────────────────── INPUT ───────────────────────
  // swipe → lane change · quick tap on a side → lane change · hold still → brake
  let downX = 0, downY = 0, downT = 0, swiped = false, holdTimer = 0;
  const SWIPE = 26;

  function changeLane(dir: number): void {
    const next = Math.max(0, Math.min(LANES - 1, lane + dir));
    if (next === lane) return;
    lane = next;
    const dur = 0.3;
    // glide to the new lane with an eased weave (no snap)
    gsap.to(car, { x: laneX(lane), duration: dur, ease: "power2.inOut", overwrite: "auto" });
    // bank into the turn, then settle level — reads as organic steering, not a flick
    gsap.to(car, {
      keyframes: [
        { rotation: dir * 0.2, duration: dur * 0.45, ease: "sine.out" },
        { rotation: 0, duration: dur * 0.55, ease: "sine.inOut" },
      ],
      overwrite: "auto",
    });
  }
  function onFirstInput(): void {
    if (firstInput) return;
    firstInput = true;
    killHint();
  }

  app.stage.on("pointerdown", (e) => {
    if (!running) return;
    downX = e.global.x; downY = e.global.y; downT = performance.now();
    swiped = false;
    holdTimer = window.setTimeout(() => { if (!swiped) { braking = true; onFirstInput(); } }, 150);
  });
  app.stage.on("pointermove", (e) => {
    if (!running || swiped) return;
    const dx = e.global.x - downX;
    if (Math.abs(dx) > SWIPE) {
      swiped = true;
      clearTimeout(holdTimer);
      braking = false;
      onFirstInput();
      changeLane(dx > 0 ? 1 : -1);
    }
  });
  app.stage.on("pointerup", (e) => {
    clearTimeout(holdTimer);
    if (!running) return;
    const dt = performance.now() - downT;
    const moved = Math.abs(e.global.x - downX) + Math.abs(e.global.y - downY);
    if (!swiped && !braking && dt < 220 && moved < SWIPE) {
      // quick tap: change lane toward the tapped side
      onFirstInput();
      changeLane(e.global.x > L.W / 2 ? 1 : -1);
    }
    braking = false;
  });
  app.stage.on("pointerupoutside", () => { clearTimeout(holdTimer); braking = false; });

  // ─────────────────────── THREAT FACTORY ───────────────────────
  function spawnThreat(def: ThreatDef): void {
    const node = new Container();
    const t: Live = { def, node, y: -120, resolved: false, inevitable: def.kind === "oncoming" };

    if (def.kind === "cyclist") {
      const sp = makeSprite("cyclist.webp", L.carW * 0.82);
      if (sp) node.addChild(sp);
      else {
        const g = new Graphics();
        g.roundRect(-5, -22, 10, 44, 4).fill(0x222831);
        g.circle(0, -16, 11).fill(COL_DANGER);
        g.circle(0, -28, 7).fill(0xffd9a0);
        node.addChild(g);
      }
      t.lane = def.lane!; node.x = laneX(t.lane);
    } else if (def.kind === "car") {
      node.addChild(vehicle("stalled-car.webp", L.carW, 0xE0E4EA, true)); // stalled, hazards on
      t.lane = def.lane!; node.x = laneX(t.lane);
    } else if (def.kind === "double") {
      // block every lane except `free`
      for (let i = 0; i < LANES; i++) {
        if (i === def.free) continue;
        const cc = vehicle("stalled-car.webp", L.carW, 0xE0E4EA, true);
        cc.x = laneX(i) - laneX(0); // relative; we offset whole node to x=0
        node.addChild(cc);
      }
      node.x = laneX(0);
      t.free = def.free!;
    } else if (def.kind === "dog") {
      const sp = makeSprite("dog.webp", L.carW * 0.85);
      if (sp) { sp.rotation = 0.45; node.addChild(sp); } // lean into the crossing
      else {
        const g = new Graphics();
        g.ellipse(0, 0, 20, 11).fill(0x8a5a2b);
        g.circle(16, -3, 8).fill(0x6e4421);
        g.roundRect(20, -4, 7, 4, 2).fill(0x4a2c12);
        node.addChild(g);
      }
      t.x = L.roadL - 40; t.vx = L.roadW / 1.7; node.x = t.x;      // crosses L→R
    } else if (def.kind === "oncoming") {
      const v = vehicle("oncoming-car.webp", L.carW, COL_DANGER);
      v.rotation = Math.PI; // facing the player
      node.addChild(v);
      t.lane = lane; node.x = laneX(t.lane);                       // tracks player's lane, then commits
    }

    node.y = t.y;
    gameLayer.addChildAt(node, 0); // behind the player car
    live.push(t);
  }

  // ─────────────────────── FX ───────────────────────
  function popup(text: string, color: number): void {
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 26, fontWeight: "800", fill: color } });
    t.anchor.set(0.5);
    t.x = car.x; t.y = car.y - L.carH * 0.7;
    fxLayer.addChild(t);
    gsap.fromTo(t, { alpha: 0, y: t.y + 10 }, { alpha: 1, y: t.y - 26, duration: 0.5, ease: "back.out(2)" });
    gsap.to(t, { alpha: 0, duration: 0.4, delay: 0.6, onComplete: () => t.destroy() });
  }

  function crashFx(atX: number, atY: number): void {
    // screen shake
    gsap.fromTo(app.stage, { x: -8 }, { x: 0, duration: 0.4, ease: "elastic.out(1,0.3)" });
    const flash = new Graphics();
    flash.rect(0, 0, L.W, L.H).fill({ color: COL_DANGER, alpha: 0.45 });
    fxLayer.addChild(flash);
    gsap.to(flash, { alpha: 0, duration: 0.45, onComplete: () => flash.destroy() });
    // burst
    for (let i = 0; i < 10; i++) {
      const s = new Graphics();
      s.star(0, 0, 4, 8, 4).fill(COL_ACCENT);
      s.x = atX; s.y = atY;
      fxLayer.addChild(s);
      const a = (Math.PI * 2 * i) / 10;
      gsap.to(s, { x: atX + Math.cos(a) * 90, y: atY + Math.sin(a) * 90, alpha: 0, duration: 0.5, onComplete: () => s.destroy() });
    }
  }

  // ─────────────────────── RESOLUTION ───────────────────────
  function resolve(t: Live, hit: boolean): void {
    if (t.resolved) return;
    t.resolved = true;
    resolvedCount++;
    if (t.inevitable || hit) {
      crashFx(car.x, car.y);
      gsap.fromTo(car, { rotation: car.rotation }, { rotation: 0.5, duration: 0.5, yoyo: true, repeat: 1, ease: "power1.inOut" });
      if (t.inevitable) popup("CRASH!", COL_DANGER);
    } else {
      avoided++;
      drawPips();
      counterTxt.text = `Avoided ${avoided}/${TOTAL}`;
      popup(["Nice!", "Dodged!", "Close!", "Safe!"][avoided % 4], COL_PRIMARY);
    }
    if (resolvedCount >= TOTAL) {
      gsap.delayedCall(t.inevitable ? 0.9 : 0.6, endGame);
    }
  }

  // ─────────────────────── MAIN LOOP ───────────────────────
  const HIT_BAND = () => L.carH * 0.62;
  app.ticker.add((ticker) => {
    if (!running) return;
    const dt = ticker.deltaMS / 1000;
    gameTime += dt;

    const scroll = BASE_SCROLL * (braking ? BRAKE_FACT : 1);

    // timer (drama; the game actually ends when all threats resolve)
    const remain = Math.max(0, DURATION - gameTime);
    timerTxt.text = `0:${String(Math.ceil(remain)).padStart(2, "0")}`;
    timerTxt.style.fill = remain <= 5 ? COL_ACCENT : COL_TEXT;

    // scroll lane dashes
    const span = DASH_H + DASH_GAP;
    for (const d of dashes.children as Graphics[]) {
      d.y += scroll * dt;
      if (d.y > L.H + DASH_H) d.y -= span * (Math.ceil(L.H / span) + 2);
    }
    // scroll roadside trees
    for (const tr of treeList) {
      tr.node.y += scroll * dt;
      if (tr.node.y > L.H + 70) tr.node.y -= L.H + 140;
    }

    // exhaust puff
    puff.y += scroll * dt * 0.4;
    if (puff.y > car.y + L.carH * 1.4) { puff.y = car.y + L.carH * 0.5; puff.alpha = 0.5; }
    puff.alpha *= 0.94; puff.x = car.x;

    // spawn from timeline (lead time so it travels in from the top)
    while (spawnIdx < TIMELINE.length && gameTime >= TIMELINE[spawnIdx].at) {
      spawnThreat(TIMELINE[spawnIdx]);
      spawnIdx++;
    }

    // brake visual cue
    car.alpha = braking ? 0.9 : 1;

    // update live threats
    for (const t of live) {
      if (t.def.kind === "dog") {
        // dog descends with the world AND crosses horizontally
        t.y += scroll * dt * 0.85;
        t.x = (t.x ?? 0) + (t.vx ?? 0) * dt;
        t.node.y = t.y; t.node.x = t.x;
      } else {
        if (t.inevitable && !t.resolved) {
          // track the player's lane while still far, then commit (no last-second
          // dodge); steer x SMOOTHLY toward target so it swerves in, never teleports
          if (t.y < L.carY - L.carH * 2) t.lane = lane;
          const targetX = laneX(t.lane ?? lane);
          t.node.x += (targetX - t.node.x) * Math.min(1, dt * 5);
        }
        t.y += scroll * dt * (t.inevitable ? 1.2 : 1);
        t.node.y = t.y;
      }

      if (t.resolved) continue;

      // resolution when the threat reaches the player's row
      if (t.y >= L.carY - HIT_BAND() && t.y <= L.carY + HIT_BAND()) {
        let hit = false;
        if (t.def.kind === "dog") {
          hit = Math.abs((t.x ?? -999) - car.x) < L.carW * 0.7 + 20;
        } else if (t.def.kind === "double") {
          hit = lane !== t.free;
        } else {
          hit = lane === t.lane;
        }
        if (t.y >= L.carY) resolve(t, hit); // commit at the crossing point
      }

      // cull
      if (t.y > L.H + 140 || (t.x ?? 0) > L.roadR + 80) {
        if (!t.resolved && t.def.kind === "dog") resolve(t, false);
        t.node.destroy();
      }
    }
    // drop destroyed
    for (let i = live.length - 1; i >= 0; i--) if (live[i].node.destroyed) live.splice(i, 1);

    if (gameTime >= DURATION && !ended) endGame();
  });

  // ─────────────────────── ENDCARD ───────────────────────
  function endGame(): void {
    if (ended) return;
    ended = true; running = false; braking = false;
    // UI is an HTML/CSS overlay (kit), not canvas-drawn — see src/assetgen/kit/ui.ts
    buildEndcard({
      brand: "SafeDrive Insurance",
      avoided,
      total: TOTAL,
      headline: SUBTITLE,
      subline: `You dodged ${avoided} of ${TOTAL} — the last one wasn't your call.`,
      ctaText: cfg.copy.cta,
      trustText: "2-min quote · no obligation",
      onCta: () => window.FbPlayableAd.onCTAClick(),
    });
  }

  // ─────────────────────── RESIZE ───────────────────────
  function onResize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    app.renderer.resize(w, h);
    app.canvas.style.width = w + "px";
    app.canvas.style.height = h + "px";
    app.stage.hitArea = app.screen;
    layout();
    drawRoad();
    buildDashes();
    buildProps();
    layoutHud();
    if (hint.parent) layoutHint();
    car.x = laneX(lane); car.y = L.carY;
  }
  window.addEventListener("resize", onResize);

  // first-paint safety: re-establish the render target on the next frame. Cheap
  // no-op on a warm GPU; a reasonable safety net for cold mobile webviews whose
  // first composite of the static layers can lag the first ticker frame.
  requestAnimationFrame(() => onResize());

  // QA hook (only with ?dbg=1): expose live state for deterministic tests.
  if (new URLSearchParams(location.search).has("dbg")) {
    (window as any).__game = () => ({ lane, avoided, resolved: resolvedCount, t: +gameTime.toFixed(1), ended });
  }
}

void main();
