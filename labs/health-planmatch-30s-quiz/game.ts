// PlanMatch 30 — health/medicare-adjacent quiz playable (greybox).
// FSM: intro → q1 → q2 → q3 → profile → end
// Mechanic: 3 answer cards per question; pick snaps icon to profile-tray;
// reveal assembles dynamic profile card from chosen icons.
// Stopwatch counts UP (no countdown pressure for 65+ audience).
// GSAP flip-in hook + pulse on first 0.5s; ghost-finger hint at ~2s idle.

import { Application, Container, Graphics, Text } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// ── Tunables ──────────────────────────────────────────────────────────────────
const IDLE_HINT_MS = Number(cfg.params.idleHintMs ?? 2000);
const AUTO_DEMO_AFTER = Number(cfg.params.autoDemoAfterIdles ?? 2);
const FLIP_DUR = Number(cfg.params.flipDurationSec ?? 0.45);
const SNAP_DUR = Number(cfg.params.snapDurationSec ?? 0.35);
const REVEAL_HOLD_MS = Number(cfg.params.revealHoldMs ?? 2200);

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

const BG = num(cfg.style.colors.background);
const PRIMARY = num(cfg.style.colors.primary);
const ACCENT = num(cfg.style.colors.accent);
const TXT = cfg.style.colors.text;
const FONT = cfg.style.font.family;

// ── Quiz data ─────────────────────────────────────────────────────────────────
interface Answer {
  label: string;
  icon: string; // emoji used as procedural icon
  sub: string;
}
interface Question {
  q: string;
  answers: Answer[];
}

const QUESTIONS: Question[] = [
  {
    q: "What matters most?",
    answers: [
      { label: "Dental", icon: "🦷", sub: "Coverage + cleanings" },
      { label: "Vision", icon: "👓", sub: "Glasses & exams" },
      { label: "Rx Drugs", icon: "💊", sub: "Prescriptions" },
    ],
  },
  {
    q: "Preferred doctor access?",
    answers: [
      { label: "My own doctor", icon: "🩺", sub: "Stay with your PCP" },
      { label: "Any doctor I want", icon: "🏥", sub: "Wide network" },
      { label: "Telehealth first", icon: "📱", sub: "Virtual visits" },
    ],
  },
  {
    q: "Pharmacy perks?",
    answers: [
      { label: "Pickup perks", icon: "🏪", sub: "Local pharmacy savings" },
      { label: "Mail delivery", icon: "📦", sub: "90-day home delivery" },
      { label: "Both work", icon: "✓", sub: "Flexible options" },
    ],
  },
];

const TRAY_LABELS = ["Q1", "Q2", "Q3"];

// ── Types ─────────────────────────────────────────────────────────────────────
type State = "intro" | "q1" | "q2" | "q3" | "profile" | "end";

async function main(): Promise<void> {
  // Wait for fonts to be ready before creating any Pixi Text objects.
  // In headless Chromium (SwiftShader), font metrics are unavailable until
  // the font loading pipeline completes — without this, canvas 2D fillText
  // produces empty or black results.
  try {
    await document.fonts.ready;
  } catch (_e) { /* ignore in environments where fonts.ready is unavailable */ }

  // Pre-warm the font engine with a throwaway draw so the glyph cache is primed
  try {
    const warmCanvas = document.createElement("canvas");
    warmCanvas.width = 4; warmCanvas.height = 4;
    const ctx = warmCanvas.getContext("2d");
    if (ctx) {
      ctx.font = "bold 14px Arial, sans-serif";
      ctx.fillStyle = "#1A2E2D";
      ctx.fillText("Ag", 0, 3);
    }
  } catch (_e) { /* ignore */ }

  // Small delay before WebGL init: in headless SwiftShader (se 375×667 viewport),
  // the GPU command processor needs time to settle after browser startup before
  // shader compilation succeeds. 80ms is enough; does not affect real-device UX.
  await new Promise<void>(r => setTimeout(r, 80));

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

  // ── Input routing ──────────────────────────────────────────────────────────
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  // (cards have their own interactivity; game layer children won't be interactive)

  // ── Layers ─────────────────────────────────────────────────────────────────
  const bgLayer = new Container();
  const gameLayer = new Container();
  const fxLayer = new Container();
  const uiLayer = new Container();
  const overlayLayer = new Container();
  app.stage.addChild(bgLayer, gameLayer, fxLayer, uiLayer, overlayLayer);

  // ── State ──────────────────────────────────────────────────────────────────
  let state: State = "intro";
  let busy = false;
  let idleAccum = 0;
  let idleCount = 0;
  const picks: number[] = []; // chosen answer index per question
  const trayIcons: Container[] = [];
  let stopwatchSec = 0;
  let stopwatchText: Text;
  let handCue: Container | null = null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function fit(t: Text, maxW: number): void {
    t.scale.set(1);
    if (t.width > maxW) t.scale.set(maxW / t.width);
  }

  function puff(x: number, y: number, color = ACCENT, n = 5): void {
    for (let i = 0; i < n; i++) {
      const d = new Graphics()
        .circle(0, 0, 3 + Math.random() * 4)
        .fill({ color, alpha: 0.75 });
      d.position.set(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 20);
      fxLayer.addChild(d);
      gsap.to(d, {
        y: d.y - 30 - Math.random() * 20,
        alpha: 0,
        duration: 0.5 + Math.random() * 0.3,
        ease: "power1.out",
        onComplete: () => { if (d.parent) { d.parent.removeChild(d); d.destroy(); } },
      });
    }
  }

  function sparkle(x: number, y: number): void {
    const s = new Text({
      text: "✦",
      style: { fill: cfg.style.colors.accent, fontFamily: FONT, fontWeight: "bold", fontSize: 26 },
    });
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.alpha = 0;
    fxLayer.addChild(s);
    gsap.timeline({
      onComplete: () => { if (s.parent) { s.parent.removeChild(s); s.destroy(); } },
    })
      .to(s, { alpha: 1, duration: 0.1 })
      .to(s.scale, { x: 1.5, y: 1.5, duration: 0.3, ease: "back.out(2)" }, 0)
      .to(s, { alpha: 0, y: y - 20, duration: 0.35 }, 0.2);
  }

  function removeHandCue(): void {
    if (handCue) {
      const h = handCue;
      handCue = null;
      gsap.killTweensOf(h);
      gsap.to(h, { alpha: 0, duration: 0.2, onComplete: () => { if (h.parent) { h.parent.removeChild(h); h.destroy({ children: true }); } } });
    }
  }

  function showHandCue(x: number, y: number): void {
    removeHandCue();
    const h = new Container();
    const finger = new Graphics();
    // Draw a simple hand/finger shape
    finger.roundRect(-12, -28, 24, 44, 12).fill({ color: 0xffe0b2, alpha: 0.95 });
    finger.roundRect(-8, -40, 16, 20, 8).fill({ color: 0xffe0b2, alpha: 0.95 });
    finger.circle(0, -40, 6).fill({ color: 0xffcc80, alpha: 0.9 });
    h.addChild(finger);
    h.position.set(x, y + 40);
    h.alpha = 0;
    uiLayer.addChild(h);
    handCue = h;
    gsap.to(h, { alpha: 0.85, duration: 0.3 });
    gsap.to(h, { y: y + 30, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // ── Background decoration ──────────────────────────────────────────────────
  function buildBg(): void {
    const g = new Graphics();
    // Soft gradient-ish top band
    g.rect(0, 0, window.innerWidth, window.innerHeight * 0.38).fill({ color: num("#E8F5F4") });
    g.rect(0, window.innerHeight * 0.38, window.innerWidth, window.innerHeight * 0.62).fill({ color: BG });
    bgLayer.addChild(g);
    // Subtle decorative circles
    const deco = new Graphics();
    deco.circle(window.innerWidth * 0.85, window.innerHeight * 0.1, 60).fill({ color: PRIMARY, alpha: 0.07 });
    deco.circle(window.innerWidth * 0.1, window.innerHeight * 0.85, 80).fill({ color: ACCENT, alpha: 0.06 });
    deco.circle(window.innerWidth * 0.9, window.innerHeight * 0.75, 45).fill({ color: PRIMARY, alpha: 0.05 });
    bgLayer.addChild(deco);
  }

  // ── Stopwatch (counts UP) ──────────────────────────────────────────────────
  let swContainer: Container;
  let swArcG: Graphics; // persistent arc graphics, redrawn each tick (no create/destroy)
  let lastSwFloor = -1;  // track last integer second to avoid re-rendering text every frame

  function buildStopwatch(): void {
    swContainer = new Container();
    // Arc ring (static background)
    const ring = new Graphics();
    ring.circle(0, 0, 24).stroke({ width: 4, color: PRIMARY, alpha: 0.18 });
    swContainer.addChild(ring);
    // Persistent arc progress graphics (inserted at index 1, below text)
    swArcG = new Graphics();
    swContainer.addChild(swArcG);
    stopwatchText = new Text({
      text: "0s",
      style: { fill: TXT, fontFamily: FONT, fontWeight: "700", fontSize: 13 },
    });
    stopwatchText.anchor.set(0.5);
    swContainer.addChild(stopwatchText);
    uiLayer.addChild(swContainer);
  }

  function updateStopwatch(dt: number): void {
    stopwatchSec += dt;
    // Only update text when the integer second changes (avoid per-frame texture re-render)
    const floorSec = Math.floor(stopwatchSec);
    if (floorSec !== lastSwFloor) {
      lastSwFloor = floorSec;
      stopwatchText.text = stopwatchSec < 60 ? `${floorSec}s` : `${Math.floor(stopwatchSec / 60)}m`;
    }
    // Redraw arc in-place (clear + redraw on persistent Graphics, no alloc)
    const fraction = Math.min(1, stopwatchSec / 30);
    swArcG.clear();
    if (fraction > 0) {
      const start = -Math.PI / 2;
      const end = start + fraction * Math.PI * 2;
      swArcG.arc(0, 0, 24, start, end).stroke({ width: 4, color: PRIMARY });
    }
  }

  // ── "Most people finish in 30s" chip — HTML overlay ──────────────────────
  // Replaced from Pixi Text to avoid black-bar rendering on se viewport.
  let subtitleEl: HTMLElement | null = null;

  function buildSubtitleEl(): void {
    subtitleEl = document.createElement("div");
    subtitleEl.textContent = "Most people finish in under 30 seconds";
    Object.assign(subtitleEl.style, {
      position: "absolute",
      left: "0",
      width: window.innerWidth + "px",
      textAlign: "center",
      fontFamily: FONT,
      fontWeight: "400",
      fontSize: "11px",
      color: TXT,
      background: `rgba(${(PRIMARY >> 16) & 255},${(PRIMARY >> 8) & 255},${PRIMARY & 255},0.1)`,
      borderRadius: "14px",
      padding: "5px 16px",
      pointerEvents: "none",
      zIndex: "10",
      boxSizing: "border-box",
    });
    document.body.appendChild(subtitleEl);
  }

  function layoutSubtitleEl(): void {
    if (!subtitleEl) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const topPx = Math.round(h * 0.06);
    const elW = Math.min(240, w - 40);
    subtitleEl.style.width = elW + "px";
    subtitleEl.style.left = Math.round((w - elW) / 2) + "px";
    subtitleEl.style.top = topPx + "px";
  }

  // ── Profile tray (3 slots at the bottom) ──────────────────────────────────
  let trayContainer: Container;
  const traySlots: Container[] = [];

  function buildTray(): void {
    trayContainer = new Container();
    const w = window.innerWidth;
    const trayW = Math.min(w - 32, 360);
    const trayBg = new Graphics();
    trayBg.roundRect(0, 0, trayW, 64, 16).fill({ color: 0xffffff, alpha: 0.9 });
    trayBg.roundRect(0, 0, trayW, 64, 16).stroke({ width: 2, color: PRIMARY, alpha: 0.3 });
    trayContainer.addChild(trayBg);

    const labelT = new Text({
      text: "Your profile",
      style: { fill: TXT, fontFamily: FONT, fontWeight: "700", fontSize: 11 },
    });
    labelT.anchor.set(0, 0.5);
    labelT.position.set(14, 12);
    trayContainer.addChild(labelT);

    // 3 slots
    const slotW = 54, slotH = 38, slotY = 22;
    const slotStart = (trayW - 3 * slotW - 2 * 12) / 2;
    for (let i = 0; i < 3; i++) {
      const slot = new Container();
      const slotBg = new Graphics();
      slotBg.roundRect(0, 0, slotW, slotH, 8).fill({ color: num("#E8F5F4") });
      slotBg.roundRect(0, 0, slotW, slotH, 8).stroke({ width: 2, color: PRIMARY, alpha: 0.2 });
      slot.addChild(slotBg);
      const lbl = new Text({
        text: TRAY_LABELS[i],
        style: { fill: TXT, fontFamily: FONT, fontSize: 10 },
      });
      lbl.alpha = 0.4;
      lbl.anchor.set(0.5);
      lbl.position.set(slotW / 2, slotH / 2);
      slot.addChild(lbl);
      slot.position.set(slotStart + i * (slotW + 12), slotY);
      trayContainer.addChild(slot);
      traySlots.push(slot);
    }
    uiLayer.addChild(trayContainer);
  }

  // Snap an icon into tray slot `idx`
  function snapToTray(idx: number, icon: string, srcX: number, srcY: number): void {
    const slot = traySlots[idx];
    // World position of slot center
    const slotWorld = trayContainer.toGlobal({ x: slot.x + 27, y: slot.y + 19 });

    // Create a flying icon from source to tray
    const fly = new Text({
      text: icon,
      style: { fontFamily: FONT, fontSize: 28 },
    });
    fly.anchor.set(0.5);
    fly.position.set(srcX, srcY);
    fxLayer.addChild(fly);

    gsap.timeline({
      onComplete: () => {
        if (fly.parent) { fly.parent.removeChild(fly); fly.destroy(); }
        // Show icon in slot
        const iconT = new Text({
          text: icon,
          style: { fontFamily: FONT, fontSize: 24 },
        });
        iconT.anchor.set(0.5);
        iconT.position.set(27, 19);
        iconT.scale.set(0);
        slot.addChild(iconT);
        trayIcons.push(slot);
        gsap.to(iconT.scale, { x: 1, y: 1, duration: 0.3, ease: "back.out(2)" });
        sparkle(slotWorld.x, slotWorld.y);
        puff(slotWorld.x, slotWorld.y, PRIMARY, 4);
        // "Added to profile" text
        const addedT = new Text({
          text: "Added to profile",
          style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontSize: 11 },
        });
        addedT.anchor.set(0.5);
        addedT.position.set(slotWorld.x, slotWorld.y - 36);
        addedT.alpha = 0;
        fxLayer.addChild(addedT);
        gsap.timeline({
          onComplete: () => { if (addedT.parent) { addedT.parent.removeChild(addedT); addedT.destroy(); } },
        })
          .to(addedT, { alpha: 1, y: slotWorld.y - 46, duration: 0.3 })
          .to(addedT, { alpha: 0, duration: 0.4 }, 0.6);
      },
    })
      .to(fly.scale, { x: 0.7, y: 0.7, duration: 0.1 })
      .to(fly, {
        x: slotWorld.x,
        y: slotWorld.y,
        duration: SNAP_DUR,
        ease: "power2.inOut",
      }, 0)
      .to(fly.scale, { x: 1.3, y: 1.3, duration: SNAP_DUR * 0.4, ease: "back.out(2)" }, SNAP_DUR * 0.7);
  }

  // ── Question cards ─────────────────────────────────────────────────────────
  let currentCardContainer: Container | null = null;
  let answerCards: Container[] = [];

  function buildQuestionCard(qIdx: number): Container {
    const q = QUESTIONS[qIdx];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cardW = Math.min(w - 32, 360);
    const card = new Container();

    // Question label chip
    const chipBg = new Graphics();
    chipBg.roundRect(0, 0, 80, 26, 13).fill({ color: PRIMARY, alpha: 0.12 });
    const chipT = new Text({
      text: `Q${qIdx + 1} of 3`,
      style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "700", fontSize: 12 },
    });
    chipT.anchor.set(0.5);
    chipT.position.set(40, 13);
    const chip = new Container();
    chip.addChild(chipBg, chipT);
    chip.position.set(cardW / 2 - 40, 0);
    card.addChild(chip);

    // Question text
    const qText = new Text({
      text: q.q,
      style: {
        fill: TXT,
        fontFamily: FONT,
        fontWeight: "700",
        fontSize: 22,
        align: "center",
        wordWrap: true,
        wordWrapWidth: cardW - 20,
      },
    });
    qText.anchor.set(0.5, 0);
    qText.position.set(cardW / 2, 38);
    fit(qText, cardW - 20);
    card.addChild(qText);

    // Answer cards (3 large cards) — min 88px tall
    const ansW = cardW - 20;
    const ansH = Math.max(88, Math.floor((h * 0.45) / 3 - 16));
    const ansGap = 16;
    const ansStartY = 90;
    answerCards = [];

    q.answers.forEach((ans, i) => {
      const ac = new Container();

      // Shadow layer (slightly larger offset rect underneath)
      const shadow = new Graphics();
      shadow.roundRect(2, 3, ansW, ansH, 14).fill({ color: 0x000000, alpha: 0.07 });
      ac.addChild(shadow);

      // Card BG
      const abg = new Graphics();
      abg.roundRect(0, 0, ansW, ansH, 14).fill({ color: 0xffffff });
      abg.roundRect(0, 0, ansW, ansH, 14).stroke({ width: 2, color: PRIMARY, alpha: 0.25 });
      ac.addChild(abg);

      // Icon circle
      const iconCircle = new Graphics();
      iconCircle.circle(38, ansH / 2, 24).fill({ color: num("#E8F5F4") });
      ac.addChild(iconCircle);

      const iconT = new Text({
        text: ans.icon,
        style: { fontFamily: FONT, fontSize: 24 },
      });
      iconT.anchor.set(0.5);
      iconT.position.set(38, ansH / 2);
      ac.addChild(iconT);

      // Label
      const lbl = new Text({
        text: ans.label,
        style: { fill: TXT, fontFamily: FONT, fontWeight: "700", fontSize: 17 },
      });
      lbl.anchor.set(0, 0.5);
      lbl.position.set(74, ansH / 2 - 11);
      fit(lbl, ansW - 90);
      ac.addChild(lbl);

      // Sub-label
      const sub = new Text({
        text: ans.sub,
        style: { fill: TXT, fontFamily: FONT, fontSize: 12 },
      });
      sub.alpha = 0.6;
      sub.anchor.set(0, 0.5);
      sub.position.set(74, ansH / 2 + 13);
      fit(sub, ansW - 90);
      ac.addChild(sub);

      // Tap arrow — larger, more visible chevron
      const arrow = new Text({
        text: "›",
        style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "700", fontSize: 28 },
      });
      arrow.anchor.set(1, 0.5);
      arrow.position.set(ansW - 14, ansH / 2);
      ac.addChild(arrow);

      ac.position.set(10, ansStartY + i * (ansH + ansGap));
      ac.eventMode = "static";
      ac.cursor = "pointer";

      let hoverTween: gsap.core.Tween | null = null;
      let pressTween: gsap.core.Tween | null = null;

      ac.on("pointerover", () => {
        if (busy) return;
        hoverTween?.kill();
        hoverTween = gsap.to(ac.scale, { x: 1.02, y: 1.02, duration: 0.15 });
        abg.clear().roundRect(0, 0, ansW, ansH, 14).fill({ color: num("#E8F5F4") })
          .roundRect(0, 0, ansW, ansH, 14).stroke({ width: 2.5, color: PRIMARY });
      });
      ac.on("pointerout", () => {
        if (busy) return;
        hoverTween?.kill();
        pressTween?.kill();
        hoverTween = gsap.to(ac.scale, { x: 1, y: 1, duration: 0.15 });
        abg.clear().roundRect(0, 0, ansW, ansH, 14).fill({ color: 0xffffff })
          .roundRect(0, 0, ansW, ansH, 14).stroke({ width: 2, color: PRIMARY, alpha: 0.25 });
      });

      // Pressed state: scale down to 0.97 on pointer down
      ac.on("pointerdown", () => {
        if (busy) return;
        pressTween?.kill();
        pressTween = gsap.to(ac.scale, { x: 0.97, y: 0.97, duration: 0.08, ease: "power2.out" });
      });
      ac.on("pointerup", () => {
        if (busy) return;
        pressTween?.kill();
        pressTween = gsap.to(ac.scale, { x: 1, y: 1, duration: 0.12, ease: "back.out(2)" });
      });

      ac.on("pointertap", () => {
        if (busy || state !== `q${qIdx + 1}`) return;
        busy = true;
        removeHandCue();
        idleAccum = 0;
        idleCount = 0;
        picks[qIdx] = i;

        // Flash selection
        abg.clear()
          .roundRect(0, 0, ansW, ansH, 14).fill({ color: ACCENT, alpha: 0.15 })
          .roundRect(0, 0, ansW, ansH, 14).stroke({ width: 3, color: ACCENT });

        // World center of the chosen card for snap animation
        const worldPos = ac.toGlobal({ x: 38, y: ansH / 2 });

        // Pulse the selected card then snap to tray
        gsap.timeline({
          onComplete: () => {
            snapToTray(qIdx, ans.icon, worldPos.x, worldPos.y);
            setTimeout(() => {
              busy = false;
              if (qIdx < 2) {
                goNextQuestion(qIdx + 1);
              } else {
                goProfile();
              }
            }, SNAP_DUR * 1000 + 400);
          },
        })
          .to(ac.scale, { x: 1.05, y: 1.05, duration: 0.1, ease: "power2.out" })
          .to(ac.scale, { x: 0.95, y: 0.95, duration: 0.1, ease: "power2.in" })
          .to(ac.scale, { x: 1, y: 1, duration: 0.1 });

        puff(worldPos.x, worldPos.y);
      });

      card.addChild(ac);
      answerCards.push(ac);
    });

    // Card container top is just below HUD; tray follows 24px after cards bottom.
    // If the result would push the tray off-screen, we compress by sliding card up.
    const hudBottom = 80;
    const TRAY_H = 64;
    const TRAY_GAP = 20;
    const TRAY_MARGIN_BOTTOM = 16; // min gap between tray bottom and viewport bottom
    const containerH = ansStartY + 3 * ansH + 2 * ansGap;
    // Ideal card top: just below hud with a small breathing gap
    const idealCardTop = hudBottom + 8;
    const trayBottomAtIdeal = idealCardTop + containerH + TRAY_GAP + TRAY_H;
    const overflow = trayBottomAtIdeal - (h - TRAY_MARGIN_BOTTOM);
    const cardY = overflow > 0
      ? Math.max(hudBottom, idealCardTop - overflow)
      : idealCardTop;

    card.position.set((w - cardW) / 2, cardY);
    return card;
  }

  // Compute the tray Y position: card bottom + TRAY_GAP, clamped to fit viewport
  function computeTrayY(h?: number): number {
    const height = h ?? window.innerHeight;
    const ansH = Math.max(88, Math.floor((height * 0.45) / 3 - 16));
    const ansGap = 16;
    const ansStartY = 90;
    const hudBottom = 80;
    const TRAY_H = 64;
    const TRAY_GAP = 20;
    const TRAY_MARGIN_BOTTOM = 16;
    const containerH = ansStartY + 3 * ansH + 2 * ansGap;
    const idealCardTop = hudBottom + 8;
    const trayBottomAtIdeal = idealCardTop + containerH + TRAY_GAP + TRAY_H;
    const overflow = trayBottomAtIdeal - (height - TRAY_MARGIN_BOTTOM);
    const cardY = overflow > 0
      ? Math.max(hudBottom, idealCardTop - overflow)
      : idealCardTop;
    return cardY + containerH + TRAY_GAP;
  }

  function showQuestion(qIdx: number, animate: boolean): void {
    if (currentCardContainer) {
      const old = currentCardContainer;
      gsap.to(old, {
        x: old.x - window.innerWidth,
        alpha: 0,
        duration: animate ? FLIP_DUR * 0.6 : 0,
        ease: "power2.in",
        onComplete: () => { old.parent?.removeChild(old); old.destroy({ children: true }); },
      });
    }
    const card = buildQuestionCard(qIdx);
    // Use 0.001 instead of 0 so Pixi still uploads text textures to GPU
    // (alpha===0 causes Pixi to skip rendering, leaving textures black on first reveal)
    card.alpha = 0.001;
    card.x += window.innerWidth * 0.15;
    gameLayer.addChild(card);
    currentCardContainer = card;

    // Force dirty-cycle on card texts to guarantee GPU texture upload before reveal.
    // The cycle runs asynchronously over ~3 RAF frames (~50ms) while the card tween
    // is also running (0.45s) — textures are uploaded well before card becomes visible.
    // Dirty-cycle MUST complete before the reveal tween starts, otherwise the
    // first visible frame in headless SwiftShader WebGL shows un-uploaded texture
    // (black/empty bars). Keep alpha=0.001 until onDone, then tween alpha→1.
    const cardTexts = collectTexts(card);
    forceDirtyCycle(cardTexts, () => {
      gsap.to(card, {
        x: card.x - window.innerWidth * 0.15,
        alpha: 1,
        duration: animate ? FLIP_DUR : 0,
        ease: "back.out(1.2)",
        onComplete: () => {
          // Pulse all 3 answer cards briefly
          answerCards.forEach((ac, idx) => {
            gsap.timeline({ delay: idx * 0.07 })
              .to(ac.scale, { x: 1.04, y: 1.04, duration: 0.25, ease: "power2.out" })
              .to(ac.scale, { x: 1, y: 1, duration: 0.25, ease: "power2.in" });
          });
        },
      });
    });
  }

  function goNextQuestion(qIdx: number): void {
    state = `q${qIdx + 1}` as State;
    idleAccum = 0;
    idleCount = 0;
    showQuestion(qIdx, true);
    updateInstructionText();
  }

  // ── Instruction text — HTML overlay (immune to WebGL texture upload issues) ──
  // Pixi Text on se (375px) intermittently renders as black bars in headless
  // Chromium due to GPU texture upload timing. HTML elements are unaffected.
  let instrEl: HTMLElement | null = null;

  function buildInstructionText(): void {
    instrEl = document.createElement("div");
    instrEl.textContent = "Pick what matters";
    Object.assign(instrEl.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: window.innerWidth + "px",
      textAlign: "center",
      fontFamily: FONT,
      fontWeight: "700",
      fontSize: "14px",
      color: TXT,
      pointerEvents: "none",
      zIndex: "10",
      padding: "0",
      margin: "0",
      lineHeight: "1.2",
    });
    document.body.appendChild(instrEl);
    // Position is set in layout()
  }

  function updateInstructionText(): void {
    // No-op: HTML element text is set at build time and stays stable
  }

  function layoutInstrText(): void {
    if (!instrEl) return;
    const h = window.innerHeight;
    const topPx = Math.round(h * 0.02);
    instrEl.style.top = topPx + "px";
    instrEl.style.width = window.innerWidth + "px";
  }

  // ── Profile reveal card ────────────────────────────────────────────────────
  function goProfile(): void {
    state = "profile";
    busy = true;
    removeHandCue();

    if (currentCardContainer) {
      const old = currentCardContainer;
      gsap.to(old, {
        alpha: 0,
        y: old.y - 30,
        duration: 0.4,
        onComplete: () => { old.parent?.removeChild(old); old.destroy({ children: true }); },
      });
      currentCardContainer = null;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const cardW = Math.min(w - 40, 340);
    const reveal = new Container();
    reveal.position.set((w - cardW) / 2, h * 0.1);
    reveal.alpha = 0;
    gameLayer.addChild(reveal);

    const cardBg = new Graphics();
    cardBg.roundRect(0, 0, cardW, h * 0.55, 20).fill({ color: 0xffffff });
    cardBg.roundRect(0, 0, cardW, h * 0.55, 20).stroke({ width: 3, color: PRIMARY });
    reveal.addChild(cardBg);

    // Header
    const hdrBg = new Graphics();
    hdrBg.roundRect(0, 0, cardW, 56, 20).fill({ color: PRIMARY });
    hdrBg.rect(0, 36, cardW, 20).fill({ color: PRIMARY }); // square bottom corners
    reveal.addChild(hdrBg);

    const hdrT = new Text({
      text: "Your Plan Profile",
      style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "700", fontSize: 17 },
    });
    hdrT.anchor.set(0.5);
    hdrT.position.set(cardW / 2, 28);
    reveal.addChild(hdrT);

    // Curiosity bridge text
    const bridge = new Text({
      text: "Plans with dental + vision benefits exist\n— see what's available",
      style: {
        fill: TXT,
        fontFamily: FONT,
        fontWeight: "700",
        fontSize: 14,
        align: "center",
        wordWrap: true,
        wordWrapWidth: cardW - 32,
      },
    });
    bridge.anchor.set(0.5, 0);
    bridge.position.set(cardW / 2, 70);
    reveal.addChild(bridge);

    // Dynamic icons from picks — fly from tray slots
    const iconItems = picks.map((pickIdx, qIdx) => {
      const ans = QUESTIONS[qIdx].answers[pickIdx];
      return { icon: ans.icon, label: ans.label };
    });

    const rowY = h * 0.55 * 0.42;
    const iconSpacing = cardW / 4;

    iconItems.forEach((item, i) => {
      const ic = new Container();
      ic.position.set(iconSpacing * (i + 0.5) + iconSpacing * 0.1, rowY);
      ic.alpha = 0;

      const circle = new Graphics();
      circle.circle(0, 0, 28).fill({ color: num("#E8F5F4") });
      circle.circle(0, 0, 28).stroke({ width: 2.5, color: ACCENT });
      ic.addChild(circle);

      const iconT = new Text({
        text: item.icon,
        style: { fontFamily: FONT, fontSize: 26 },
      });
      iconT.anchor.set(0.5);
      ic.addChild(iconT);

      const lbl = new Text({
        text: item.label,
        style: { fill: TXT, fontFamily: FONT, fontWeight: "700", fontSize: 11 },
      });
      lbl.anchor.set(0.5, 0);
      lbl.position.set(0, 36);
      ic.addChild(lbl);

      reveal.addChild(ic);

      // Animate with delay per icon
      gsap.timeline({ delay: 0.3 + i * 0.18 })
        .to(ic, { alpha: 1, duration: 0.3 })
        .from(ic.scale, { x: 0, y: 0, duration: 0.4, ease: "back.out(2)" }, 0)
        .add(() => puff(
          (w - cardW) / 2 + iconSpacing * (i + 0.5) + iconSpacing * 0.1,
          h * 0.1 + rowY,
          ACCENT, 4
        ));
    });

    // Endcard line
    const endLine = new Text({
      text: cfg.params.endcardLine as string ?? "Nice picks. See plans that match what you chose — with a licensed agent.",
      style: {
        fill: TXT,
        fontFamily: FONT,
        fontSize: 13,
        align: "center",
        wordWrap: true,
        wordWrapWidth: cardW - 28,
      },
    });
    endLine.anchor.set(0.5, 0);
    endLine.position.set(cardW / 2, h * 0.55 * 0.65);
    fit(endLine, cardW - 28);
    reveal.addChild(endLine);

    gsap.to(reveal, { alpha: 1, duration: 0.45, ease: "power2.out" });

    setTimeout(() => {
      busy = false;
      showEndcard();
    }, REVEAL_HOLD_MS);
  }

  // ── Endcard ────────────────────────────────────────────────────────────────
  function showEndcard(): void {
    if (state === "end") return;
    state = "end";
    removeHandCue();
    busy = true;

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Dim overlay
    const dim = new Graphics()
      .rect(0, 0, w, h)
      .fill({ color: 0x000000, alpha: 0.45 });
    overlayLayer.addChild(dim);

    const panelW = Math.min(w - 32, 340);
    const panelH = Math.min(h * 0.76, 560);
    const panel = new Container();
    panel.position.set((w - panelW) / 2, (h - panelH) / 2);
    panel.alpha = 0;
    panel.scale.set(0.8);
    overlayLayer.addChild(panel);

    // Panel BG
    const pbg = new Graphics();
    pbg.roundRect(0, 0, panelW, panelH, 20).fill({ color: num("#F7F9F9") });
    pbg.roundRect(0, 0, panelW, panelH, 20).stroke({ width: 3, color: PRIMARY });
    panel.addChild(pbg);

    // Brand name / logo (procedural text logo)
    const logoBg = new Graphics();
    logoBg.roundRect(0, 0, 160, 44, 10).fill({ color: PRIMARY });
    logoBg.position.set(panelW / 2 - 80, 22);
    panel.addChild(logoBg);

    const logoText = new Text({
      text: "ClearPath Plans",
      style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "700", fontSize: 14 },
    });
    logoText.anchor.set(0.5);
    logoText.position.set(panelW / 2, 44);
    panel.addChild(logoText);

    // Tagline
    const tagline = new Text({
      text: "Options, explained.",
      style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontSize: 12 },
    });
    tagline.anchor.set(0.5);
    tagline.position.set(panelW / 2, 70);
    panel.addChild(tagline);

    // Endcard line
    const endLine = new Text({
      text: "Nice picks. See plans that match what you chose — with a licensed agent.",
      style: {
        fill: TXT,
        fontFamily: FONT,
        fontWeight: "700",
        fontSize: 15,
        align: "center",
        wordWrap: true,
        wordWrapWidth: panelW - 40,
      },
    });
    endLine.anchor.set(0.5, 0);
    endLine.position.set(panelW / 2, 88);
    panel.addChild(endLine);

    // Picked icons row
    const pickedY = 155;
    const pickedSpacing = panelW / 4;
    picks.forEach((pickIdx, qIdx) => {
      const ans = QUESTIONS[qIdx].answers[pickIdx];
      const ic = new Container();
      ic.position.set(pickedSpacing * (qIdx + 0.5) + pickedSpacing * 0.1, pickedY);

      const circle = new Graphics();
      circle.circle(0, 0, 22).fill({ color: num("#E8F5F4") });
      circle.circle(0, 0, 22).stroke({ width: 2, color: ACCENT });
      ic.addChild(circle);

      const iconT = new Text({
        text: ans.icon,
        style: { fontFamily: FONT, fontSize: 20 },
      });
      iconT.anchor.set(0.5);
      ic.addChild(iconT);

      const lbl = new Text({
        text: ans.label,
        style: { fill: TXT, fontFamily: FONT, fontSize: 9 },
      });
      lbl.anchor.set(0.5, 0);
      lbl.position.set(0, 28);
      ic.addChild(lbl);

      panel.addChild(ic);
    });

    // Authority line
    const auth = new Text({
      text: "Licensed agents. We represent [X] organizations",
      style: {
        fill: TXT,
        fontFamily: FONT,
        fontSize: 11,
        align: "center",
        wordWrap: true,
        wordWrapWidth: panelW - 40,
      },
    });
    auth.alpha = 0.7;
    auth.anchor.set(0.5, 0);
    auth.position.set(panelW / 2, 210);
    panel.addChild(auth);

    // CTA button — bottom thumb zone, ≥44px height
    const ctaH = 56;
    const ctaW = panelW - 44;
    const ctaY = panelH - ctaH - 80; // space for disclaimer below
    const cta = new Container();
    const ctaBg = new Graphics();
    ctaBg.roundRect(0, 0, ctaW, ctaH, 28).fill({ color: ACCENT });
    ctaBg.roundRect(0, 0, ctaW, ctaH, 28).stroke({ width: 3, color: shade(ACCENT, -0.2) });
    cta.addChild(ctaBg);
    const ctaT = new Text({
      text: cfg.copy.cta,
      style: { fill: "#ffffff", fontFamily: FONT, fontWeight: "700", fontSize: 20 },
    });
    ctaT.anchor.set(0.5);
    ctaT.position.set(ctaW / 2, ctaH / 2);
    fit(ctaT, ctaW - 24);
    cta.addChild(ctaT);
    cta.position.set(22, ctaY);
    cta.eventMode = "static";
    cta.cursor = "pointer";
    cta.on("pointertap", (e) => {
      e.stopPropagation();
      window.FbPlayableAd.onCTAClick();
    });
    gsap.to(cta.scale, { x: 1.04, y: 1.04, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });
    panel.addChild(cta);

    // TPMO disclaimer — readable, visible without scroll (≥10px)
    const disclaimer = new Text({
      text: "We do not offer every plan available in your area. Currently we represent [X] organizations which offer [Y] products in your area. Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program to get information on all of your options. Not connected with or endorsed by the United States government or the federal Medicare program.",
      style: {
        fill: TXT,
        fontFamily: FONT,
        fontSize: 10,
        align: "left",
        wordWrap: true,
        wordWrapWidth: panelW - 28,
      },
    });
    disclaimer.alpha = 0.8;
    disclaimer.anchor.set(0, 0);
    disclaimer.position.set(14, panelH - 74);
    panel.addChild(disclaimer);

    // Replay link
    const replayT = new Text({
      text: "↻ Start over",
      style: { fill: cfg.style.colors.primary, fontFamily: FONT, fontWeight: "700", fontSize: 13 },
    });
    replayT.anchor.set(0.5);
    replayT.position.set(panelW / 2, panelH - 12);
    replayT.eventMode = "static";
    replayT.cursor = "pointer";
    replayT.on("pointertap", (e) => { e.stopPropagation(); resetAll(); });
    panel.addChild(replayT);

    gsap.to(panel, {
      alpha: 1,
      scale: 1,
      duration: 0.45,
      ease: "back.out(1.5)",
      onComplete: () => { busy = false; },
    });
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function resetAll(): void {
    // Kill tweens on answer cards before destroying
    answerCards.forEach(ac => { gsap.killTweensOf(ac); gsap.killTweensOf(ac.scale); });
    if (currentCardContainer) {
      gsap.killTweensOf(currentCardContainer);
    }
    overlayLayer.removeChildren();
    gameLayer.removeChildren();
    fxLayer.removeChildren();
    picks.length = 0;
    trayIcons.length = 0;
    stopwatchSec = 0;
    currentCardContainer = null;
    answerCards = [];

    // Rebuild tray slots (clear icons)
    traySlots.forEach(slot => {
      while (slot.children.length > 2) {
        const child = slot.children[slot.children.length - 1];
        slot.removeChild(child);
        child.destroy();
      }
    });

    startHook();
  }

  // ── Idle nudge / auto-demo ─────────────────────────────────────────────────
  app.ticker.add((ticker) => {
    try {
      if (busy || state === "intro" || state === "profile" || state === "end") return;
      const dt = Math.min(0.05, ticker.deltaMS / 1000);
      updateStopwatch(dt);
      idleAccum += ticker.deltaMS;
      if (idleAccum >= IDLE_HINT_MS) {
        idleAccum = 0;
        idleCount++;
        // Show ghost-finger hint over middle answer card (guard destroyed/null objects)
        if (answerCards.length >= 2) {
          const midCard = answerCards[1];
          if (midCard && !midCard.destroyed && midCard.parent) {
            try {
              const worldPos = midCard.toGlobal({ x: midCard.width / 2, y: midCard.height / 2 });
              showHandCue(worldPos.x, worldPos.y);
            } catch (_e) { /* card being destroyed */ }
          }
        }
        if (idleCount >= AUTO_DEMO_AFTER && !/dbg/.test(location.search)) {
          // Auto-pick middle answer
          if (answerCards.length >= 2) {
            const midCard = answerCards[1];
            if (midCard && !midCard.destroyed && midCard.parent) {
              midCard.emit("pointertap");
            }
          }
        }
      }
    } catch (_e) {
      // Swallow ticker errors to prevent crash cascade
    }
  });

  // ── Build header UI ────────────────────────────────────────────────────────
  function buildHeader(): void {
    // Stopwatch placement: top right (Pixi)
    buildStopwatch();

    // Sub-title chip and instruction text use HTML overlays to avoid
    // headless WebGL text-texture upload failures on se (375px) viewport
    buildSubtitleEl();
    buildInstructionText();
  }

  // ── Layout (called on init + resize) ──────────────────────────────────────
  function layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Stopwatch: top right
    if (swContainer) {
      swContainer.position.set(w - 44, 44);
    }

    // HTML overlay elements: instruction text + subtitle chip
    layoutInstrText();
    layoutSubtitleEl();

    // Tray: anchored near bottom with thumb-safe margin
    if (trayContainer) {
      const trayW = Math.min(w - 32, 360);
      trayContainer.position.set((w - trayW) / 2, computeTrayY(h));
      const tbg = trayContainer.getChildAt(0) as Graphics;
      tbg?.clear()
        .roundRect(0, 0, trayW, 64, 16).fill({ color: 0xffffff, alpha: 0.9 })
        .roundRect(0, 0, trayW, 64, 16).stroke({ width: 2, color: PRIMARY, alpha: 0.3 });
    }
  }

  // ── Hook intro ─────────────────────────────────────────────────────────────
  function startHook(): void {
    state = "intro";
    busy = false;
    idleAccum = 0;
    idleCount = 0;

    // Short delay then flip in Q1 with pulse
    gsap.delayedCall(0.4, () => {
      state = "q1";
      showQuestion(0, true);
      updateInstructionText();
    });
  }

  // ── Build everything ───────────────────────────────────────────────────────
  buildBg();
  buildHeader();
  buildTray();
  layout();
  window.addEventListener("resize", () => {
    layout();
    app.renderer.render(app.stage);
  });

  // ── Collect all Pixi Text objects for force-touch ───────────────────────
  function collectTexts(container: Container, out: Text[] = []): Text[] {
    for (let i = 0; i < container.children.length; i++) {
      const child = container.children[i];
      if (child instanceof Text) {
        out.push(child);
      } else if (child instanceof Container) {
        collectTexts(child, out);
      }
    }
    return out;
  }

  // Force a dirty-cycle on Text objects to guarantee GPU texture upload.
  // Uses app.ticker.addOnce() to hook into Pixi's natural render cycle (safe: no
  // manual renderer calls that race with the ticker). Strategy:
  //   1. Append ZWS → forces Pixi to re-generate canvas texture (marks dirty)
  //   2. Wait 2 ticker frames → Pixi renders the ZWS version, uploading to GPU
  //   3. Restore original text → marks dirty again
  //   4. Wait 2 ticker frames → Pixi re-uploads correct text
  //   5. onDone()
  // In headless Chromium the ticker still runs via setTimeout internally (GSAP drives it
  // or Pixi's own requestAnimationFrame polyfill), so this completes in real wall time.
  function forceDirtyCycle(texts: Text[], onDone: () => void): void {
    if (texts.length === 0) { onDone(); return; }
    const ZWS = '​'; // zero-width space — invisible, forces dirty
    const originals = texts.map(t => t.text);

    // Phase 1: dirty with ZWS, then wait for ticker to render it
    texts.forEach(t => { t.text = t.text + ZWS; });
    app.ticker.addOnce(() => {
      app.ticker.addOnce(() => {
        // Phase 2: restore, wait for ticker to render again
        texts.forEach((t, i) => { t.text = originals[i]; });
        app.ticker.addOnce(() => {
          app.ticker.addOnce(() => {
            onDone();
          });
        });
      });
    });
  }

  // Warm-up: wait 2 ticker frames for Pixi to do initial renders,
  // then dirty-cycle all stage texts, then start game.
  // Using app.ticker.addOnce keeps us in Pixi's render pipeline (no manual render calls).
  function warmUpAndStart(): void {
    app.ticker.addOnce(() => {
      app.ticker.addOnce(() => {
        const allTexts = collectTexts(app.stage);
        forceDirtyCycle(allTexts, () => { startHook(); });
      });
    });
  }
  warmUpAndStart();

  // QA hook
  if (/dbg/.test(location.search)) {
    (window as unknown as { __pmq: unknown }).__pmq = {
      get state() { return state; },
      pick: (i: number) => answerCards[i]?.emit("pointertap"),
      reset: () => resetAll(),
      end: () => showEndcard(),
      cta: () => window.FbPlayableAd.onCTAClick(),
    };
  }

  // Validator sentinel — literal must appear in file
  void (() => window.FbPlayableAd.onCTAClick);
}

main().catch((e) => {
  console.error("PlanMatch 30 failed to start:", e);
});
