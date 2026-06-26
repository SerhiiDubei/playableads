// Financial Foundation — Jenga-style life-insurance playable.
// PixiJS + GSAP. Soft-clay art from generated sprites (bg / block-debt tinted
// per debt / block-gold / platform) with a procedural clay fallback when a key
// is absent. Procedural WebAudio SFX (zero asset weight). Portrait 9:16 only.
//
// Concept (per spec): a debt tower (Mortgage, College Fund, Car Loan, Credit
// Cards, Groceries) wobbles and nearly topples because its foundation slot is
// empty. The player drags a glowing gold "Life Insurance" block into the slot;
// magnetic snap → golden impulse → the tower aligns and freezes solid →
// "Foundation Secured!" → end card with the "Calculate My Coverage" CTA.
//
// FSM: boot → wobble → pause → drag → success → end  (+ failsafe auto-play).
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// Network / analytics globals the ad host may inject (Meta sets FbPlayableAd;
// MRAID networks set mraid). Typed locally so the module compiles standalone.
const HOST = window as unknown as {
  mraid?: { open?: (url: string) => void };
  playableTrack?: (ev: string, data?: unknown) => void;
  __ff?: unknown;
};

// ── Tunables (manifest defaults; brief params override) ───────────────────────
const WOBBLE_START = Number(cfg.params.wobbleStartMs ?? 500);
const WOBBLE_AMP_DEG = Number(cfg.params.wobbleAmpDeg ?? 6);
const PAUSE_AT = Number(cfg.params.pauseAtMs ?? 3000);
const IDLE_BOUNCE = Number(cfg.params.idleBounceMs ?? 4000);
const AUTO_PLAY = Number(cfg.params.autoPlayMs ?? 6000);
const DRAG_LAG = Number(cfg.params.dragLag ?? 0.22);
const SNAP_DIST = Number(cfg.params.snapDist ?? 56);
const SUCCESS_HOLD = Number(cfg.params.successHoldMs ?? 2400);
const CTA_TARGET = String(cfg.params.ctaTarget ?? "");

const HOOK = String(cfg.params.hookText ?? "Don't let it fall down.");
const SUCCESS = String(cfg.params.successText ?? "Foundation Secured!");
const HEADLINE = String(cfg.params.endHeadline ?? "Make your family's financial foundation unbreakable.");
const GOLD_LABEL = String(cfg.params.goldLabel ?? "Life Insurance");
const DEBT_LABELS = String(cfg.params.blockLabels ?? "Mortgage,College Fund,Car Loan,Credit Cards,Groceries")
  .split(",")
  .map((s) => s.trim());

const DBG = /dbg/.test(location.search);

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
const BG = num(cfg.style.colors.background);
const TXT = cfg.style.colors.text;
const FONT = cfg.style.font.family;

// Calm, trustworthy debt-block palette (muted blue / sage / grey / teal).
const DEBT_COLORS = [0x6f8fb0, 0x7fa183, 0xb6bdc6, 0x88a6b6, 0x9aa2ab];

// ── Audio: procedural WebAudio SFX (zero asset weight, no external loads) ──────
// Synthesised on the fly — nothing base64-inlined, nothing fetched. The context
// unlocks on the first user gesture (browser autoplay policy).
let actx: AudioContext | null = null;
let muted = false;
function audioCtx(): AudioContext | null {
  if (muted) return null;
  if (!actx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC(); } catch { return null; }
  }
  if (actx.state === "suspended") void actx.resume();
  return actx;
}
function unlockAudio(): void { void audioCtx(); }
function blip(freq: number, dur: number, type: OscillatorType, vol: number, t0 = 0, glide?: number): void {
  const a = audioCtx(); if (!a) return;
  const t = a.currentTime + t0;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}
function noiseBurst(dur: number, vol: number, freq: number, q: number, t0 = 0): void {
  const a = audioCtx(); if (!a) return;
  const t = a.currentTime + t0;
  const n = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t); src.stop(t + dur);
}
const sfx = {
  creak(): void { noiseBurst(0.22, 0.05, 300, 1.2); blip(150, 0.22, "sawtooth", 0.025, 0, 120); },
  pop(): void { blip(240, 0.16, "sine", 0.16, 0, 480); },
  grab(): void { blip(520, 0.05, "triangle", 0.08); },
  snap(): void { blip(150, 0.18, "sine", 0.28, 0, 70); blip(880, 0.05, "square", 0.05); noiseBurst(0.05, 0.05, 1200, 0.7); },
  success(): void { blip(523, 0.34, "sine", 0.16); blip(659, 0.34, "sine", 0.16, 0.09); blip(784, 0.5, "sine", 0.18, 0.18); blip(1047, 0.5, "sine", 0.1, 0.26); },
  cta(): void { blip(660, 0.12, "triangle", 0.12); blip(880, 0.14, "triangle", 0.1, 0.07); },
};

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
          img.onerror = () => resolve();
          img.src = uri;
        }),
    ),
  );
}
function tex(key: string): Texture | null {
  return TEX[key] ?? null;
}

// ── Design canvas (fixed; scaled to fit the viewport — no reflow) ─────────────
const DW = 400, DH = 720, CX = DW / 2;
const BW = 196, BH = 46, GAP = 8, R = 12;
const TOWER_N = 5;
const STACK_H = TOWER_N * BH + (TOWER_N - 1) * GAP;     // 262
const BASE_Y = 300 + STACK_H;                            // 562: top of foundation slot
const SLOT_Y = BASE_Y + BH / 2;                          // 585: slot center
const PLAT_Y = BASE_Y + BH + 15;                         // platform center
const TRAY_Y = 678;                                      // gold "ready" position
const slot = { x: CX, y: SLOT_Y };
const goldHome = { x: CX, y: TRAY_Y };

type State = "boot" | "wobble" | "pause" | "drag" | "success" | "end";

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: BG, antialias: true });
  document.body.appendChild(app.canvas);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  await preloadTextures();

  // Layers (design space).
  const root = new Container();
  app.stage.addChild(root);
  const bgLayer = new Container();
  const scene = new Container();      // platform + ambient
  const slotLayer = new Container();  // foundation slot outline + glow
  const tower = new Container();      // rotating debt stack
  const gold = new Container();       // draggable Life Insurance block
  const fx = new Container();         // bursts
  const hand = new Container();       // drag hint
  const hud = new Container();        // hook + success text
  const ui = new Container();         // persistent UI (sound toggle)
  const overlay = new Container();    // end card
  root.addChild(bgLayer, scene, slotLayer, tower, gold, fx, hand, hud, ui, overlay);

  // State.
  let state: State = "boot";
  let wobbling = false;
  let wobPhase = 0;
  const wob = { amp: 0 };
  const MAX_AMP = (WOBBLE_AMP_DEG * 1.4 * Math.PI) / 180;
  let dragging = false;
  let dragStarted = false;
  let succeeded = false;
  let autoPlaying = false;
  let bouncing = false;
  let interacted = false;
  let idleMs = 0;
  let grabDX = 0, grabDY = 0;
  const dragTarget = { x: goldHome.x, y: goldHome.y };
  const blocks: Container[] = [];
  let bgSprite: Sprite | null = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function fit(t: Text, maxW: number): void {
    t.scale.set(1);
    if (t.width > maxW) t.scale.set(maxW / t.width);
  }
  function d2(ax: number, ay: number, bx: number, by: number): number {
    return Math.hypot(ax - bx, ay - by);
  }
  function track(ev: string, data?: unknown): void {
    try { window.dispatchEvent(new CustomEvent("playable:" + ev, { detail: data })); } catch (e) { void e; }
    if (typeof HOST.playableTrack === "function") HOST.playableTrack(ev, data);
    try { console.log("[track]", ev, data ?? ""); } catch (e) { void e; }
  }
  function fireCTA(): void {
    track("cta_clicked");
    sfx.cta();
    // Meta routes the install via this hook (validator requires the literal).
    try { window.FbPlayableAd.onCTAClick(); } catch (e) { void e; }
    // MRAID networks open the store URL directly when one is configured.
    if (HOST.mraid && HOST.mraid.open && CTA_TARGET) {
      try { HOST.mraid.open(CTA_TARGET); } catch (e) { void e; }
    }
  }
  function firstInteraction(): void {
    unlockAudio(); // resume the audio context on a real gesture
    if (interacted) return;
    interacted = true;
    track("first_interaction");
  }

  // ── Soft-clay primitives (procedural greybox; generated sprites swap in) ──────
  // Soft contact shadow (stacked translucent ellipses — no filter dependency).
  function contactShadow(w: number, h: number): Container {
    const c = new Container();
    for (let i = 0; i < 3; i++) {
      c.addChild(
        new Graphics()
          .ellipse(0, h / 2 + 6 + i * 2, w * (0.42 - i * 0.05), 9 - i * 2)
          .fill({ color: 0x223247, alpha: 0.07 }),
      );
    }
    return c;
  }
  // Procedural matte clay body with a top sheen and a base shade.
  function clayBody(w: number, h: number, base: number): Graphics {
    const g = new Graphics();
    g.roundRect(-w / 2, -h / 2, w, h, R).fill({ color: base });
    g.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.4, R - 4).fill({ color: 0xffffff, alpha: 0.14 }); // sheen
    g.roundRect(-w / 2 + 5, h / 2 - 7, w - 10, 4, 2).fill({ color: 0x000000, alpha: 0.1 });             // base shade
    g.roundRect(-w / 2, -h / 2, w, h, R).stroke({ width: 1.5, color: shade(base, -0.22), alpha: 0.5 });
    return g;
  }
  // A block sized to exactly w×h: a generated clay sprite (optionally tinted) when
  // `key` is present in cfg.assets, else the procedural clay body. Always carries a
  // soft contact shadow so sprite and procedural blocks share the same depth.
  function blockBody(key: string, w: number, h: number, fallback: number, tint?: number): Container {
    const c = new Container();
    c.addChild(contactShadow(w, h));
    const t = tex(key);
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0.5);
      sp.width = w;
      sp.height = h; // force exact block dims (don't keep source aspect)
      if (tint !== undefined) sp.tint = tint;
      c.addChild(sp);
    } else {
      c.addChild(clayBody(w, h, tint ?? fallback));
    }
    return c;
  }
  function blockLabel(label: string, color: string, w: number): Text {
    const t = new Text({ text: label, style: { fill: color, fontFamily: FONT, fontWeight: "800", fontSize: 21 } });
    t.anchor.set(0.5);
    fit(t, w * 0.84);
    return t;
  }

  // ── Background (generated studio backdrop full-viewport, else procedural gradient) ──
  function buildBg(): void {
    const t = tex("bg.webp");
    if (t) {
      bgSprite = new Sprite(t);
      app.stage.addChildAt(bgSprite, 0); // behind root; covers the whole viewport (sized in layout)
      return;
    }
    const top = shade(BG, 0.42), bot = shade(BG, -0.05);
    const bands = 28;
    const g = new Graphics();
    for (let i = 0; i < bands; i++) {
      const c = lerpColor(top, bot, i / (bands - 1));
      g.rect(0, (DH / bands) * i, DW, DH / bands + 1).fill({ color: c });
    }
    bgLayer.addChild(g);
  }
  function lerpColor(a: number, b: number, f: number): number {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (
      (Math.round(ar + (br - ar) * f) << 16) |
      (Math.round(ag + (bg - ag) * f) << 8) |
      Math.round(ab + (bb - ab) * f)
    );
  }

  // ── Platform ───────────────────────────────────────────────────────────────────
  function buildScene(): void {
    const plat = blockBody("platform.webp", 300, 46, shade(PRIMARY, 0.18));
    plat.position.set(CX, PLAT_Y);
    scene.addChild(plat);
  }

  // ── Foundation slot (empty, pulsing) ──────────────────────────────────────────
  const slotGlow = new Graphics();
  function buildSlot(): void {
    const recess = new Graphics();
    recess.roundRect(slot.x - BW / 2, slot.y - BH / 2, BW, BH, R).fill({ color: shade(BG, -0.16), alpha: 0.85 });
    recess.roundRect(slot.x - BW / 2, slot.y - BH / 2, BW, BH, R).stroke({ width: 3, color: ACCENT, alpha: 0.9 });
    slotLayer.addChild(recess);
    slotGlow.roundRect(slot.x - BW / 2 - 4, slot.y - BH / 2 - 4, BW + 8, BH + 8, R + 3).stroke({ width: 5, color: ACCENT });
    slotGlow.alpha = 0;
    slotLayer.addChild(slotGlow);
  }
  function pulseSlot(): void {
    gsap.killTweensOf(slotGlow);
    slotGlow.alpha = 0;
    gsap.to(slotGlow, { alpha: 0.9, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }
  function stopSlotPulse(): void {
    gsap.killTweensOf(slotGlow);
    gsap.to(slotGlow, { alpha: 0, duration: 0.3 });
  }

  // ── Debt tower ─────────────────────────────────────────────────────────────────
  function buildTower(): void {
    tower.position.set(CX, BASE_Y);
    tower.pivot.set(0, 0);
    for (let i = 0; i < TOWER_N; i++) {
      const c = new Container();
      const w = BW - (i % 2) * 8;
      const color = DEBT_COLORS[i % DEBT_COLORS.length];
      const body = blockBody("block-debt.webp", w, BH, color, color); // light clay sprite tinted per debt color
      c.addChild(body, blockLabel(DEBT_LABELS[i] ?? "", "#ffffff", BW));
      // local y: block 0 sits just above the pivot (top of slot), stacking upward.
      c.position.set((Math.random() - 0.5) * 4, -BH / 2 - i * (BH + GAP));
      tower.addChild(c);
      blocks.push(c);
    }
  }
  // Whole-tower sway + extra slide on the top blocks (the "about to fall" read).
  function wobbleTick(dtMs: number): void {
    if (!wobbling) return;
    wobPhase += (dtMs / 1000) * 2.4;
    tower.rotation = Math.sin(wobPhase) * wob.amp;
    const k = wob.amp / MAX_AMP;
    if (blocks[4]) blocks[4].x = Math.sin(wobPhase * 1.3) * 7 * k;
    if (blocks[3]) blocks[3].x = Math.sin(wobPhase * 1.1 + 0.5) * 4 * k;
  }

  // ── Gold "Life Insurance" block ────────────────────────────────────────────────
  const goldGlow = new Graphics();
  function buildGold(): void {
    goldGlow.ellipse(0, 0, BW * 0.62, BH * 0.95).fill({ color: ACCENT, alpha: 0.32 });
    gold.addChild(goldGlow);
    const body = blockBody("block-gold.webp", BW, BH, ACCENT);
    const label = blockLabel(GOLD_LABEL, "#3a2a08", BW);
    gold.addChild(body, label);
    gold.position.set(CX, DH + 80); // offscreen until the pause beat
    gold.visible = false;
    gold.eventMode = "none";
    gold.cursor = "pointer";
    gold.on("pointerdown", onGrab);
  }
  function pulseGoldGlow(): void {
    gsap.killTweensOf(goldGlow.scale);
    gsap.to(goldGlow.scale, { x: 1.12, y: 1.12, duration: 0.8, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // ── Drag-hint hand ──────────────────────────────────────────────────────────────
  function buildHand(): void {
    const g = new Graphics();
    g.circle(0, 0, 15).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 3, color: num("#33455a") });
    g.roundRect(-5, 8, 10, 22, 5).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 3, color: num("#33455a") });
    hand.addChild(g);
    hand.alpha = 0;
    hand.position.set(goldHome.x, goldHome.y);
  }
  function showHand(): void {
    hand.alpha = 0;
    gsap.killTweensOf(hand);
    gsap.killTweensOf(hand.scale);
    gsap.to(hand, { alpha: 1, duration: 0.3 });
    gsap.timeline({ repeat: -1 })
      .set(hand, { x: goldHome.x, y: goldHome.y })
      .to(hand.scale, { x: 0.85, y: 0.85, duration: 0.2, yoyo: true, repeat: 1 })
      .to(hand, { x: slot.x, y: slot.y, duration: 0.9, ease: "power1.inOut" })
      .to(hand, { alpha: 0.2, duration: 0.25 })
      .set(hand, { alpha: 1 }, "+=0.15");
  }
  function hideHand(): void {
    gsap.killTweensOf(hand);
    gsap.to(hand, { alpha: 0, duration: 0.2 });
  }

  // ── HUD (hook + success text) ────────────────────────────────────────────────────
  const hook = new Text({ text: "", style: { fill: TXT, fontFamily: FONT, fontWeight: "800", fontSize: 30, align: "center", wordWrap: true, wordWrapWidth: 340 } });
  function buildHud(): void {
    hook.anchor.set(0.5);
    hook.position.set(CX, 60);
    hud.addChild(hook);
  }
  // ── Sound toggle (persistent, top-right) ──────────────────────────────────────
  function buildMute(): void {
    const c = new Container();
    const icon = new Graphics();
    const redraw = (): void => {
      icon.clear();
      icon.poly([-9, -5, -3, -5, 4, -12, 4, 12, -3, 5, -9, 5]).fill({ color: TXT });
      if (!muted) {
        icon.arc(5, 0, 7, -0.7, 0.7).stroke({ width: 2.2, color: TXT });
        icon.arc(5, 0, 11, -0.7, 0.7).stroke({ width: 2.2, color: TXT });
      } else {
        icon.moveTo(7, -8).lineTo(17, 9).stroke({ width: 2.6, color: num("#b23b3b") });
        icon.moveTo(17, -8).lineTo(7, 9).stroke({ width: 2.6, color: num("#b23b3b") });
      }
    };
    redraw();
    c.addChild(new Graphics().rect(-22, -22, 44, 44).fill({ color: 0xffffff, alpha: 0.001 }), icon);
    c.position.set(366, 40);
    c.eventMode = "static";
    c.cursor = "pointer";
    c.on("pointertap", (e) => { e.stopPropagation(); muted = !muted; redraw(); if (!muted) unlockAudio(); });
    ui.addChild(c);
  }
  function setHook(s: string): void {
    hook.text = s;
    fit(hook, 350);
    if (s) gsap.fromTo(hook, { alpha: 0.3 }, { alpha: 1, duration: 0.3 });
  }
  function showSuccessText(): void {
    const t = new Text({ text: SUCCESS, style: { fill: shade(ACCENT, -0.25), fontFamily: FONT, fontWeight: "800", fontSize: 36, align: "center" } });
    t.anchor.set(0.5);
    t.position.set(CX, 250);
    const base = Math.min(1, 360 / t.width); // fit baked into the pop so it never overflows
    t.scale.set(base * 0.6);
    t.alpha = 0;
    hud.addChild(t);
    gsap.to(t, { alpha: 1, duration: 0.3 });
    gsap.to(t.scale, { x: base, y: base, duration: 0.5, ease: "back.out(1.8)" });
  }

  // ── Pointer / drag ────────────────────────────────────────────────────────────
  function onGrab(e: { global: { x: number; y: number } }): void {
    if (state !== "drag" || succeeded) return;
    firstInteraction();
    sfx.grab();
    dragging = true;
    idleMs = 0;
    stopBounce();
    hideHand();
    const p = root.toLocal(e.global);
    grabDX = gold.x - p.x;
    grabDY = gold.y - p.y;
    gsap.to(gold.scale, { x: 1.06, y: 1.06, duration: 0.15 });
  }
  function onMove(e: { global: { x: number; y: number } }): void {
    if (!dragging) return;
    const p = root.toLocal(e.global);
    dragTarget.x = p.x + grabDX;
    dragTarget.y = p.y + grabDY;
    idleMs = 0;
    if (!dragStarted && d2(gold.x, gold.y, goldHome.x, goldHome.y) > 16) {
      dragStarted = true;
      track("block_dragged");
    }
  }
  function onRelease(): void {
    if (!dragging || succeeded) return;
    dragging = false;
    gsap.to(gold.scale, { x: 1, y: 1, duration: 0.15 });
    // Not snapped → ease back to the tray and keep hinting.
    dragTarget.x = goldHome.x;
    dragTarget.y = goldHome.y;
    gsap.to(gold, { x: goldHome.x, y: goldHome.y, duration: 0.4, ease: "power2.out" });
  }

  // ── Idle / failsafe ──────────────────────────────────────────────────────────
  function startBounce(): void {
    if (bouncing) return;
    bouncing = true;
    gsap.to(gold, { y: goldHome.y - 22, duration: 0.32, yoyo: true, repeat: -1, ease: "power1.inOut" });
  }
  function stopBounce(): void {
    if (!bouncing) return;
    bouncing = false;
    gsap.killTweensOf(gold);
    gold.y = goldHome.y;
  }
  function idleTick(dtMs: number): void {
    if (DBG || state !== "drag" || dragging || succeeded || autoPlaying) return;
    idleMs += dtMs;
    if (idleMs >= IDLE_BOUNCE) startBounce();
    if (idleMs >= AUTO_PLAY) autoPlay();
  }
  function autoPlay(): void {
    if (succeeded || autoPlaying) return;
    autoPlaying = true;
    track("failsafe_triggered");
    stopBounce();
    hideHand();
    dragging = false;
    gsap.to(gold, { x: slot.x, y: slot.y, duration: 0.7, ease: "power2.inOut", onComplete: () => snapSuccess(true) });
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  function snapSuccess(auto: boolean): void {
    if (succeeded) return;
    succeeded = true;
    state = "success";
    sfx.snap();
    dragging = false;
    stopBounce();
    gold.eventMode = "none";
    gsap.killTweensOf(gold); // drop any in-flight fly-in / return / bounce tween
    gsap.killTweensOf(goldGlow.scale);
    goldGlow.scale.set(1);
    gsap.to(gold, { x: slot.x, y: slot.y, rotation: 0, duration: auto ? 0.06 : 0.16, ease: "back.out(2.2)", onComplete: runSuccess });
    gsap.to(gold.scale, { x: 1, y: 1, duration: 0.16 });
  }
  function runSuccess(): void {
    track("foundation_secured");
    sfx.success();
    impulse();
    wobbling = false;
    stopSlotPulse();
    hideHand();
    gsap.to(tower, { rotation: 0, duration: 0.5, ease: "power2.out" });
    blocks.forEach((b, i) => gsap.to(b, { x: 0, duration: 0.45, delay: i * 0.03, ease: "power2.out" }));
    setHook("");
    showSuccessText();
    if (!DBG) gsap.delayedCall(SUCCESS_HOLD / 1000, showEndcard); // DBG: step() advances manually
  }
  function impulse(): void {
    // Golden ring expanding from the slot.
    const ring = new Graphics().circle(0, 0, 36).stroke({ width: 10, color: ACCENT, alpha: 0.95 });
    ring.position.set(slot.x, slot.y);
    ring.scale.set(0.4);
    fx.addChild(ring);
    gsap.to(ring.scale, { x: 5.5, y: 5.5, duration: 0.7, ease: "power2.out" });
    gsap.to(ring, { alpha: 0, duration: 0.7, ease: "power1.out", onComplete: () => ring.destroy() });
    // Energy washing up the tower.
    const beam = new Graphics().roundRect(slot.x - BW / 2, 300, BW, STACK_H + BH, R).fill({ color: ACCENT, alpha: 0 });
    fx.addChild(beam);
    gsap.timeline({ onComplete: () => beam.destroy() })
      .to(beam, { alpha: 0.35, duration: 0.18 })
      .to(beam, { alpha: 0, duration: 0.6, ease: "power1.out" });
    for (let i = 0; i < 10; i++) {
      const s = new Graphics().circle(0, 0, 3 + Math.random() * 3).fill({ color: ACCENT, alpha: 0.9 });
      s.position.set(slot.x + (Math.random() - 0.5) * BW, slot.y);
      fx.addChild(s);
      gsap.to(s, { y: s.y - 120 - Math.random() * 160, alpha: 0, duration: 0.7 + Math.random() * 0.3, ease: "power1.out", onComplete: () => s.destroy() });
    }
  }

  // ── End card ──────────────────────────────────────────────────────────────────
  function showEndcard(): void {
    if (state === "end") return;
    state = "end";
    ui.visible = false; // hide the sound toggle on the end card
    // The scene recedes (alpha) so the bright gold block stays the focus.
    gsap.to([tower, slotLayer, scene], { alpha: 0.2, duration: 0.5 });
    gsap.to(hud, { alpha: 0, duration: 0.4 }); // clear the hook / success text
    // Transparent full-screen catcher: any tap on the end card fires the CTA.
    const catcher = new Graphics().rect(0, 0, DW, DH).fill({ color: 0xffffff, alpha: 0.001 });
    catcher.eventMode = "static";
    catcher.on("pointertap", fireCTA);
    overlay.addChild(catcher);
    overlay.eventMode = "static";

    gsap.to(gold, { x: CX, y: 250, duration: 0.6, ease: "power2.inOut" });
    gsap.to(gold.scale, { x: 1.3, y: 1.3, duration: 0.6, ease: "power2.inOut" });
    gsap.killTweensOf(goldGlow.scale);
    gsap.to(goldGlow.scale, { x: 1.18, y: 1.18, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut" });

    const headline = new Text({ text: HEADLINE, style: { fill: TXT, fontFamily: FONT, fontWeight: "800", fontSize: 26, align: "center", wordWrap: true, wordWrapWidth: 320 } });
    headline.anchor.set(0.5);
    headline.position.set(CX, 110);
    headline.alpha = 0;
    overlay.addChild(headline);
    gsap.to(headline, { alpha: 1, duration: 0.4, delay: 0.2 });

    // Primary CTA.
    const cta = new Container();
    const cw = 300, ch = 70;
    cta.addChild(new Graphics().roundRect(-cw / 2, -ch / 2, cw, ch, ch / 2).fill({ color: ACCENT }).stroke({ width: 4, color: shade(ACCENT, -0.3) }));
    const ctaT = new Text({ text: cfg.copy.cta, style: { fill: "#3a2a08", fontFamily: FONT, fontWeight: "800", fontSize: 27 } });
    ctaT.anchor.set(0.5);
    fit(ctaT, cw * 0.84);
    cta.addChild(ctaT);
    cta.position.set(CX, 470);
    cta.eventMode = "static";
    cta.cursor = "pointer";
    cta.on("pointertap", (e) => { e.stopPropagation(); fireCTA(); });
    overlay.addChild(cta);
    gsap.to(cta.scale, { x: 1.05, y: 1.05, duration: 1.2, yoyo: true, repeat: -1, ease: "sine.inOut" });

    // Replay (QA / optional).
    const replay = new Text({ text: "↻ Replay", style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "800", fontSize: 20 } });
    replay.anchor.set(0.5);
    replay.position.set(CX, 540);
    replay.eventMode = "static";
    replay.cursor = "pointer";
    replay.on("pointertap", (e) => { e.stopPropagation(); resetAll(); });
    overlay.addChild(replay);
  }

  // ── Reset (replay) ──────────────────────────────────────────────────────────
  function resetAll(): void {
    overlay.removeChildren();
    overlay.eventMode = "none";
    fx.removeChildren();
    // Clear the success text (everything in hud after the hook).
    while (hud.children.length > 1) hud.removeChildAt(1);
    hud.alpha = 1;
    gsap.killTweensOf(gold);
    gsap.killTweensOf(gold.scale);
    gsap.killTweensOf(goldGlow.scale);
    goldGlow.scale.set(1);
    succeeded = false; autoPlaying = false; dragging = false; dragStarted = false; bouncing = false;
    interacted = false; idleMs = 0; wobPhase = 0; wob.amp = 0;
    tower.rotation = 0; tower.alpha = 1; slotLayer.alpha = 1; scene.alpha = 1;
    blocks.forEach((b, i) => { b.x = (Math.random() - 0.5) * 4; b.y = -BH / 2 - i * (BH + GAP); });
    gold.visible = false; gold.eventMode = "none"; gold.scale.set(1); gold.rotation = 0;
    gold.position.set(CX, DH + 80);
    ui.visible = true;
    setHook("");
    start();
  }

  // ── Flow ──────────────────────────────────────────────────────────────────────
  function start(): void {
    state = "wobble";
    setHook(HOOK);
    track("game_start");
    gsap.delayedCall(WOBBLE_START / 1000, () => {
      wobbling = true;
      gsap.to(wob, { amp: MAX_AMP, duration: 2.0, ease: "power1.in" });
    });
    if (!DBG) gsap.delayedCall(PAUSE_AT / 1000, enterPause);
  }
  function enterPause(): void {
    if (state !== "wobble") return;
    state = "pause";
    // Freeze at a critical lean.
    wobbling = false;
    gsap.to(tower, { rotation: MAX_AMP * 0.85, duration: 0.4, ease: "power2.out" });
    sfx.creak();
    // Gold block flies in from the bottom.
    gold.visible = true;
    gold.position.set(CX, DH + 80);
    gsap.to(gold, { y: goldHome.y, duration: 0.6, ease: "back.out(1.4)", onComplete: enterDrag });
    sfx.pop();
    pulseGoldGlow();
    pulseSlot();
  }
  function enterDrag(): void {
    if (succeeded) return;
    state = "drag";
    idleMs = 0;
    gold.eventMode = "static";
    showHand();
  }

  // ── Ticker (wobble + drag-follow + snap + idle) ──────────────────────────────
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS;
    layout(); // re-fit every frame: some hosts resize the canvas without a JS resize event
    wobbleTick(dt);
    if (state === "drag" && dragging && !succeeded) {
      gold.x += (dragTarget.x - gold.x) * DRAG_LAG;
      gold.y += (dragTarget.y - gold.y) * DRAG_LAG;
      if (d2(gold.x, gold.y, slot.x, slot.y) < SNAP_DIST) snapSuccess(false);
    }
    idleTick(dt);
  });

  // ── Layout (portrait 9:16 only — scale design canvas into viewport, contain) ───
  function layout(): void {
    const s = Math.min(app.screen.width / DW, app.screen.height / DH);
    root.scale.set(s);
    root.position.set((app.screen.width - DW * s) / 2, (app.screen.height - DH * s) / 2);
    if (bgSprite) { bgSprite.width = app.screen.width; bgSprite.height = app.screen.height; } // cover gutters
  }

  // ── Build + start ──────────────────────────────────────────────────────────────
  buildBg();
  buildScene();
  buildSlot();
  buildTower();
  buildGold();
  buildHand();
  buildHud();
  buildMute();
  layout();
  window.addEventListener("resize", layout);
  app.stage.on("globalpointermove", onMove);
  app.stage.on("pointerup", onRelease);
  app.stage.on("pointerupoutside", onRelease);
  app.stage.on("pointerdown", firstInteraction);

  track("ad_loaded");
  start();

  // QA hook (only with ?dbg): drive the FSM deterministically from the console.
  if (DBG) {
    HOST.__ff = {
      get state() { return state; },
      step: () => {
        if (state === "wobble") enterPause();
        else if (state === "pause") enterDrag();
        else if (state === "drag") snapSuccess(false);
        else if (state === "success") showEndcard();
      },
      drag: () => { if (state === "drag") { firstInteraction(); track("block_dragged"); } },
      snap: () => snapSuccess(false),
      auto: () => autoPlay(),
      end: () => showEndcard(),
      cta: () => fireCTA(),
      reset: () => resetAll(),
      shot: () => app.renderer.extract.base64({ target: app.stage }),
    };
  }

  // Ensure the static validator sees the CTA hook is wired.
  void (() => window.FbPlayableAd.onCTAClick);
}

main().catch((e) => {
  // Surface boot failures instead of swallowing them silently.
  // eslint-disable-next-line no-console
  console.error("Financial Foundation failed to start:", e);
});
