import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  Ticker,
} from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";
import { BUNGEE_B64, RUSSO_LATIN_B64, RUSSO_CYR_B64 } from "./fonts.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

// ── Inject custom display fonts (woff2 base64, ~26 KB total) ──────────────────
// Bungee = chunky display for English (BIG WIN, SUPER BONUS, COMBO, SCORE).
// Russo One = chunky display with Cyrillic for title + CTA + any UA text.
(function injectFonts(): void {
  const css = `
@font-face{font-family:'Bungee';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${BUNGEE_B64}) format('woff2')}
@font-face{font-family:'RussoOne';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${RUSSO_LATIN_B64}) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:'RussoOne';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${RUSSO_CYR_B64}) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

const FONT_DISPLAY = "Bungee, 'RussoOne', 'Arial Black', system-ui, sans-serif";
const FONT_BODY = "'RussoOne', Bungee, 'Arial Black', system-ui, sans-serif";

// ── Tunables (brief params override manifest defaults) ────────────────────────
const COLS = Number(cfg.params.cols ?? 6);
const ROWS = Number(cfg.params.rows ?? 5);
const MIN_MATCH = Number(cfg.params.minMatch ?? 8);
const BOMB_CHANCE = Number(cfg.params.bombChance ?? 0.045);
const SCATTER_CHANCE = Number(cfg.params.scatterChance ?? 0.06);
const FREE_SPINS_TRIGGER = Number(cfg.params.freeSpinsTrigger ?? 4);
const FREE_SPINS_AWARDED = Number(cfg.params.freeSpinsAwarded ?? 10);
const SPIN_REEL_DUR = Number(cfg.params.spinReelDuration ?? 0.75);
const TUMBLE_DUR = Number(cfg.params.tumbleDuration ?? 0.55);
const DEMO_SPINS = Number(cfg.params.demoSpins ?? 8);

// ── Color helpers ─────────────────────────────────────────────────────────────
function num(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}
const TXT = cfg.style.colors.text;
const COL_BG = num(cfg.style.colors.background);
const COL_ACCENT = num(cfg.style.colors.accent);

// ── Symbol catalog ────────────────────────────────────────────────────────────
type SymbolKind = "sym" | "scatter" | "bomb";
interface SymbolDef {
  id: string;
  assetKey: string;
  fallbackColor: number;
  fallbackDecor: "grape" | "watermelon" | "blueberry" | "apple" | "banana" | "candy" | "heart";
  pay: number;
  weight: number;
}
const SYMBOLS: SymbolDef[] = [
  { id: "grape",     assetKey: "fruit-grape.webp",     fallbackColor: 0x9b4dff, fallbackDecor: "grape",      pay: 40, weight: 3 },
  { id: "watermelon",assetKey: "fruit-watermelon.webp",fallbackColor: 0xff3a5a, fallbackDecor: "watermelon", pay: 30, weight: 4 },
  { id: "blueberry", assetKey: "fruit-blueberry.webp", fallbackColor: 0x4d6fff, fallbackDecor: "blueberry",  pay: 25, weight: 5 },
  { id: "apple",     assetKey: "fruit-apple.webp",     fallbackColor: 0xff4d2a, fallbackDecor: "apple",      pay: 20, weight: 6 },
  { id: "banana",    assetKey: "fruit-banana.webp",    fallbackColor: 0xffd84d, fallbackDecor: "banana",     pay: 12, weight: 8 },
  { id: "candy",     assetKey: "fruit-candy-green.webp",fallbackColor: 0x38f06b,fallbackDecor: "candy",      pay: 8,  weight: 10 },
  { id: "heart",     assetKey: "fruit-heart-red.webp", fallbackColor: 0xff3aa5, fallbackDecor: "heart",      pay: 5,  weight: 12 },
];
const SCATTER_ASSET = "fruit-scatter-lollipop.webp";
const BOMB_ASSET = "bomb.webp";
const BG_ASSET = "bg-candy.webp";
const LOGO_ASSET = "logo-fruits.webp";
const ENDCARD_FRAME = "endcard-frame.webp";
const ENDCARD_CROWN = "endcard-crown.webp";
const COIN_ASSET = "coin.webp";

const BOMB_MULTS = [2, 3, 5, 10, 25, 100];
const BOMB_WEIGHTS = [40, 28, 18, 8, 5, 1];

// ── Texture cache ─────────────────────────────────────────────────────────────
const TEX: Record<string, Texture> = {};
async function preloadTextures(): Promise<void> {
  await Promise.all(
    Object.entries(cfg.assets).map(async ([k, uri]) => {
      const img = new Image();
      img.src = uri;
      try {
        await img.decode();
      } catch {
        /* ignore decode errors; fall back to procedural */
      }
      TEX[k] = Texture.from(img);
    }),
  );
}
function tex(key: string): Texture | null {
  return TEX[key] ?? null;
}

// ── Procedural sprite fallback (used when asset is missing) ───────────────────
function drawFruit(g: Graphics, def: SymbolDef, r: number): void {
  const c = def.fallbackColor;
  const hi = shade(c, 0.35);
  const lo = shade(c, -0.35);
  switch (def.fallbackDecor) {
    case "grape": {
      const positions: [number, number][] = [
        [-0.42, -0.32],[ 0.0, -0.42],[ 0.42, -0.32],
        [-0.55,  0.05],[-0.18,  0.0 ],[ 0.18,  0.0 ],[ 0.55,  0.05],
        [-0.35,  0.40],[ 0.0,  0.50],[ 0.35,  0.40],
      ];
      for (const [x, y] of positions) {
        g.circle(x * r, y * r, r * 0.28).fill({ color: c });
        g.circle(x * r - r * 0.07, y * r - r * 0.10, r * 0.10).fill({ color: hi, alpha: 0.7 });
      }
      // Leaf
      g.ellipse(0, -r * 0.55, r * 0.20, r * 0.10).fill({ color: 0x4ade80 });
      break;
    }
    case "watermelon": {
      // Triangle slice
      g.moveTo(0, -r * 0.7).lineTo(-r * 0.75, r * 0.55).lineTo(r * 0.75, r * 0.55).closePath()
        .fill({ color: 0xff5a7a });
      // Rind
      g.moveTo(-r * 0.75, r * 0.55).lineTo(r * 0.75, r * 0.55).lineTo(r * 0.78, r * 0.7).lineTo(-r * 0.78, r * 0.7).closePath()
        .fill({ color: 0x3da64a });
      // Seeds
      for (const [x, y] of [[-0.3,0.1],[0.0,0.25],[0.3,0.1],[-0.15,0.35],[0.15,0.35]] as [number,number][]) {
        g.ellipse(x * r, y * r, r * 0.06, r * 0.10).fill({ color: 0x2a0a1a });
      }
      break;
    }
    case "blueberry": {
      const positions: [number, number][] = [[-0.3, 0.1], [0.3, 0.1], [0.0, -0.25]];
      for (const [x, y] of positions) {
        g.circle(x * r, y * r, r * 0.36).fill({ color: c });
        g.circle(x * r - r * 0.10, y * r - r * 0.12, r * 0.12).fill({ color: hi, alpha: 0.7 });
        g.star(x * r, y * r - r * 0.36, 5, r * 0.10, r * 0.05).fill({ color: 0x224488 });
      }
      break;
    }
    case "apple": {
      g.ellipse(0, r * 0.05, r * 0.65, r * 0.62).fill({ color: c });
      g.ellipse(-r * 0.20, -r * 0.15, r * 0.18, r * 0.20).fill({ color: hi, alpha: 0.7 });
      g.rect(-r * 0.05, -r * 0.62, r * 0.10, r * 0.20).fill({ color: 0x6b4423 });
      g.ellipse(r * 0.15, -r * 0.55, r * 0.20, r * 0.10).fill({ color: 0x4ade80 });
      break;
    }
    case "banana": {
      g.ellipse(0, 0, r * 0.65, r * 0.20).fill({ color: c });
      g.ellipse(-r * 0.10, -r * 0.05, r * 0.45, r * 0.10).fill({ color: hi, alpha: 0.6 });
      g.rect(r * 0.55, -r * 0.05, r * 0.10, r * 0.10).fill({ color: 0x6b4423 });
      break;
    }
    case "candy": {
      g.circle(0, 0, r * 0.55).fill({ color: c });
      g.circle(-r * 0.15, -r * 0.18, r * 0.18).fill({ color: hi, alpha: 0.8 });
      g.circle(0, 0, r * 0.55).stroke({ color: lo, width: 2 });
      break;
    }
    case "heart": {
      g.moveTo(0, r * 0.5)
        .bezierCurveTo(-r * 0.95, r * 0.0, -r * 0.55, -r * 0.55, 0, -r * 0.15)
        .bezierCurveTo(r * 0.55, -r * 0.55, r * 0.95, r * 0.0, 0, r * 0.5)
        .fill({ color: c });
      g.ellipse(-r * 0.25, -r * 0.10, r * 0.12, r * 0.10).fill({ color: hi, alpha: 0.7 });
      break;
    }
  }
}

function drawScatter(g: Graphics, r: number): void {
  // Glow ring
  g.circle(0, 0, r * 0.75).fill({ color: 0xffd84d, alpha: 0.18 });
  g.circle(0, 0, r * 0.62).fill({ color: 0xffd84d, alpha: 0.32 });
  // Lollipop disc
  g.circle(0, 0, r * 0.52).fill({ color: 0xffffff });
  // Swirl
  const swirlColors = [0xff3aa5, 0x9b4dff, 0xffd84d, 0xff7ad6];
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2;
    const r0 = (i / 16) * r * 0.5;
    const a1 = a0 + 0.4;
    const r1 = r0 + r * 0.08;
    g.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0)
      .lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1)
      .stroke({ color: swirlColors[i % swirlColors.length], width: r * 0.10 });
  }
  // Stick
  g.rect(-r * 0.05, r * 0.45, r * 0.10, r * 0.45).fill({ color: 0xfff5d8 });
}

function drawBomb(g: Graphics, r: number, mult: number): void {
  // Energy ring
  g.circle(0, 0, r * 0.78).fill({ color: 0xffd84d, alpha: 0.15 });
  g.circle(0, 0, r * 0.68).fill({ color: 0xffd84d, alpha: 0.25 });
  // Body
  g.circle(0, r * 0.05, r * 0.50).fill({ color: 0x1a1a22 });
  // Shine
  g.ellipse(-r * 0.18, -r * 0.12, r * 0.14, r * 0.18).fill({ color: 0x6a6a78, alpha: 0.7 });
  // Fuse
  g.rect(-r * 0.04, -r * 0.55, r * 0.08, r * 0.18).fill({ color: 0xc9a76d });
  // Spark
  g.star(0, -r * 0.58, 6, r * 0.14, r * 0.06).fill({ color: 0xfff5a0 });
  g.star(0, -r * 0.58, 6, r * 0.08, r * 0.03).fill({ color: 0xff7e2e });
  void mult; // multiplier label is drawn as Text overlay
}

function shade(c: number, f: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const t = f > 0 ? 255 : 0;
  const a = Math.abs(f);
  const nr = Math.round(r + (t - r) * a);
  const ng = Math.round(g + (t - g) * a);
  const nb = Math.round(b + (t - b) * a);
  return (nr << 16) | (ng << 8) | nb;
}

// ── Random helpers ────────────────────────────────────────────────────────────
function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

interface Cell {
  kind: SymbolKind;
  sym?: SymbolDef;     // for "sym"
  mult?: number;       // for "bomb"
}

function newCell(opts: { allowScatter?: boolean; allowBomb?: boolean } = {}): Cell {
  const allowScatter = opts.allowScatter ?? true;
  const allowBomb = opts.allowBomb ?? true;
  if (allowBomb && Math.random() < BOMB_CHANCE) {
    return { kind: "bomb", mult: weightedPick(BOMB_MULTS, BOMB_WEIGHTS) };
  }
  if (allowScatter && Math.random() < SCATTER_CHANCE) {
    return { kind: "scatter" };
  }
  return { kind: "sym", sym: weightedPick(SYMBOLS, SYMBOLS.map(s => s.weight)) };
}

// ── Audio (V2 MUSIC: ElevenLabs MP3 samples + ambient BGM loop) ───────────────
// Drop-in API-compatible with the V1 procedural shim:
//   audio.drop() / pop(pitch) / chime() / bomb() / fanfare() / setMuted(m)
// New in V2:
//   audio.spin() — reel-start whoosh (called from doSpin)
//   audio.preload(cfg.assets) — decode all base64 MP3 into AudioBuffers
//   audio.startBgm() — auto-called on the first SFX after a user gesture
class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private buffers: Record<string, AudioBuffer> = {};
  private bgmSource: AudioBufferSourceNode | null = null;
  private preloaded: Promise<void> | null = null;
  muted = false;

  ensure(): void {
    if (this.ctx) return;
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ctx.destination);
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.225; // BGM at -6dB (≈ half perceived loudness)
    this.bgmGain.connect(this.master);
  }

  // Try to start BGM immediately. If the browser keeps the context suspended
  // (autoplay policy), wire a one-shot gesture listener that resumes + starts.
  async tryStartBgm(): Promise<void> {
    this.ensure();
    const ctx = this.ctx as AudioContext;
    try { await ctx.resume(); } catch { /* ignored */ }
    if (ctx.state === "running") { this.startBgm(); return; }
    const onGesture = (): void => {
      void ctx.resume().then(() => this.startBgm()).catch(() => { /* ignored */ });
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("touchstart", onGesture);
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    window.addEventListener("touchstart", onGesture, { passive: true });
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.7;
  }

  // Decode every assets[key] whose name ends in .mp3/.ogg/.wav.
  // Safe to call before any user gesture — decodeAudioData works in suspended ctx.
  async preload(assets: Record<string, string>): Promise<void> {
    if (this.preloaded) return this.preloaded;
    this.ensure();
    const ctx = this.ctx as AudioContext;
    const keys = Object.keys(assets).filter((k) => /\.(mp3|ogg|wav)$/i.test(k));
    this.preloaded = (async () => {
      await Promise.all(keys.map(async (key) => {
        try {
          const res = await fetch(assets[key]);
          const ab = await res.arrayBuffer();
          this.buffers[key] = await ctx.decodeAudioData(ab);
        } catch (err) {
          // Decode can fail on some Safari versions if URI is malformed; log and move on.
          // eslint-disable-next-line no-console
          console.warn(`[audio] failed to decode ${key}:`, err);
        }
      }));
    })();
    return this.preloaded;
  }

  // Lazy unlock for browsers that create AudioContext in "suspended" state.
  private async unlock(): Promise<void> {
    this.ensure();
    const ctx = this.ctx as AudioContext;
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { /* ignored */ }
    }
  }

  private playSample(
    key: string,
    opts: { pitch?: number; gain?: number; loop?: boolean; bgm?: boolean } = {},
  ): AudioBufferSourceNode | null {
    if (this.muted) return null;
    const ctx = this.ctx;
    const buf = this.buffers[key];
    if (!ctx || !buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (opts.pitch != null) src.playbackRate.value = opts.pitch;
    if (opts.loop) src.loop = true;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    src.connect(g).connect(opts.bgm ? (this.bgmGain as GainNode) : (this.master as GainNode));
    src.start();
    return src;
  }

  // Public SFX API — drop-in compatible with V1.
  drop(): void { void this.unlock().then(() => { this.playSample("sfx-drop.mp3"); this.startBgm(); }); }
  pop(pitch = 1): void { void this.unlock().then(() => { this.playSample("sfx-pop.mp3", { pitch }); this.startBgm(); }); }
  chime(): void { void this.unlock().then(() => { this.playSample("sfx-chime.mp3"); this.startBgm(); }); }
  bomb(): void { void this.unlock().then(() => { this.playSample("sfx-bomb.mp3"); this.startBgm(); }); }
  fanfare(): void { void this.unlock().then(() => { this.playSample("sfx-fanfare.mp3"); this.startBgm(); }); }
  spin(): void { void this.unlock().then(() => { this.playSample("sfx-spin.mp3"); this.startBgm(); }); }

  startBgm(): void {
    if (this.bgmSource || this.muted) return;
    const src = this.playSample("bgm-ambient-loop.mp3", { loop: true, gain: 1, bgm: true });
    if (src) this.bgmSource = src;
  }
  stopBgm(): void {
    if (!this.bgmSource) return;
    try { this.bgmSource.stop(); } catch { /* ignored */ }
    this.bgmSource = null;
  }
}
const audio = new Audio();

// ── Main app ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: COL_BG,
    antialias: true,
  });
  document.body.appendChild(app.canvas);
  await preloadTextures();
  // V2 MUSIC: decode MP3 SFX + BGM in the background (does not block first paint).
  // Buffers become playable as soon as decode finishes; if a player taps SPIN
  // before that, the SFX call is silently skipped (playSample early-returns).
  // After decode: start BGM immediately if the browser allows; otherwise wait
  // for the first user gesture (autoplay policy).
  void audio.preload(cfg.assets).then(() => audio.tryStartBgm());

  // Stage layers
  const bgLayer = new Container();
  const parallaxLayer = new Container();
  const uiLayer = new Container();
  const boardLayer = new Container();
  const fxLayer = new Container();
  const overlayLayer = new Container();
  app.stage.addChild(bgLayer, parallaxLayer, uiLayer, boardLayer, fxLayer, overlayLayer);

  // ── Background (image or gradient fallback) ─────────────────────────────────
  const bgSprite = new Sprite();
  const bgGrad = new Graphics();
  bgLayer.addChild(bgGrad, bgSprite);
  function paintBgGradient(w: number, h: number): void {
    bgGrad.clear();
    bgGrad.rect(0, 0, w, h).fill({ color: 0x2a0a4a });
    const bands = 60;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const top = mix(0x2a0a4a, 0x6a1a8a, t * 0.6);
      const bot = mix(0x6a1a8a, 0xff3aa5, t);
      const col = t < 0.5 ? top : bot;
      bgGrad.rect(0, (h * i) / bands, w, h / bands + 1).fill({ color: col, alpha: 0.95 });
    }
    // Subtle vignette
    bgGrad.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.18 });
  }
  function mix(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg2 = (b >> 8) & 255, bb = b & 255;
    return ((ar + (br - ar) * t) << 16) | ((ag + (bg2 - ag) * t) << 8) | (ab + (bb - ab) * t);
  }

  // ── Parallax: drifting fruit silhouettes + golden particles ────────────────
  interface Drifter { node: Container; speed: number; baseX: number; sway: number; t: number; }
  const drifters: Drifter[] = [];
  function buildDrifters(w: number, h: number): void {
    parallaxLayer.removeChildren();
    drifters.length = 0;
    // Background blurred fruit silhouettes (back layer)
    for (let i = 0; i < 6; i++) {
      const def = SYMBOLS[i % SYMBOLS.length];
      const c = new Container();
      const g = new Graphics();
      drawFruit(g, def, 90);
      g.alpha = 0.10;
      c.addChild(g);
      c.scale.set(1.4);
      const x = Math.random() * w;
      const y = Math.random() * h;
      c.position.set(x, y);
      parallaxLayer.addChild(c);
      drifters.push({ node: c, speed: 0.08 + Math.random() * 0.06, baseX: x, sway: 20 + Math.random() * 30, t: Math.random() * 100 });
    }
    // Falling golden sparkles (front layer)
    for (let i = 0; i < 40; i++) {
      const g = new Graphics();
      const r = 1 + Math.random() * 2.5;
      g.circle(0, 0, r).fill({ color: 0xffd84d, alpha: 0.6 + Math.random() * 0.4 });
      g.position.set(Math.random() * w, Math.random() * h);
      parallaxLayer.addChild(g);
      drifters.push({ node: g as unknown as Container, speed: 0.4 + Math.random() * 0.8, baseX: g.x, sway: 6 + Math.random() * 10, t: Math.random() * 100 });
    }
  }
  app.ticker.add((tickerObj: Ticker) => {
    const dt = tickerObj.deltaTime;
    const h = app.screen.height;
    for (const d of drifters) {
      d.t += dt * 0.01;
      d.node.y += d.speed * dt;
      d.node.x = d.baseX + Math.sin(d.t) * d.sway;
      if (d.node.y > h + 30) {
        d.node.y = -30;
        d.baseX = Math.random() * app.screen.width;
      }
    }
  });

  // ── Board state ─────────────────────────────────────────────────────────────
  let board: (Cell | null)[][] = makeFreshBoard();
  function makeFreshBoard(): Cell[][] {
    return Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => newCell()),
    );
  }

  // Visual grid: 2D array of Containers
  const cellNodes: Container[][] = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));

  // Board frame
  const boardFrame = new Graphics();
  boardLayer.addChild(boardFrame);
  // Cell positions are computed in layout() and stored here.
  let cellW = 60, cellH = 60, boardX = 0, boardY = 0;

  // ── HUD ─────────────────────────────────────────────────────────────────────
  const hud = new Container();
  uiLayer.addChild(hud);

  function makePill(label: string): { node: Container; val: Text } {
    const c = new Container();
    const bg = new Graphics()
      .roundRect(-80, -22, 160, 44, 14)
      .fill({ color: 0x000000, alpha: 0.45 })
      .roundRect(-80, -22, 160, 44, 14)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.18 });
    const k = new Text({
      text: label,
      style: { fill: TXT, fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: 2 },
    });
    k.anchor.set(0.5);
    k.y = -8;
    k.alpha = 0.7;
    const v = new Text({
      text: "0",
      style: { fill: cfg.style.colors.accent, fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: "900" },
    });
    v.anchor.set(0.5);
    v.y = 8;
    c.addChild(bg, k, v);
    return { node: c, val: v };
  }
  const pillSpins = makePill("SPINS");
  const pillScore = makePill("SCORE");
  const pillLast  = makePill("WIN");
  hud.addChild(pillSpins.node, pillScore.node, pillLast.node);

  // Title (top, displayed only when logo asset missing)
  const titleText = new Text({
    text: cfg.copy.title,
    style: {
      fill: COL_ACCENT,
      fontFamily: FONT_DISPLAY,
      fontWeight: "900",
      fontSize: 32,
      letterSpacing: 1,
      align: "center",
      dropShadow: { color: 0x3a0e00, blur: 0, distance: 2, alpha: 0.5, angle: Math.PI / 2 },
    },
  });
  titleText.anchor.set(0.5);
  uiLayer.addChild(titleText);

  // Logo (when asset exists)
  const logoSprite = new Sprite();
  if (tex(LOGO_ASSET)) {
    logoSprite.texture = tex(LOGO_ASSET) as Texture;
    logoSprite.anchor.set(0.5);
    uiLayer.addChild(logoSprite);
    titleText.visible = false;
  } else {
    logoSprite.visible = false;
  }

  // Spin button
  const spinBtn = new Container();
  const spinBg = new Graphics();
  const spinLabel = new Text({
    text: "SPIN",
    style: { fill: 0x04220c, fontFamily: FONT_DISPLAY, fontWeight: "900", fontSize: 26, letterSpacing: 2 },
  });
  spinLabel.anchor.set(0.5);
  spinBtn.addChild(spinBg, spinLabel);
  spinBtn.eventMode = "static";
  spinBtn.cursor = "pointer";
  uiLayer.addChild(spinBtn);

  function paintSpinButton(w: number): void {
    spinBg.clear();
    spinBg.roundRect(-w / 2, -36, w, 72, 22).fill({ color: 0x14a83a });
    spinBg.roundRect(-w / 2, -36, w, 64, 22).fill({ color: 0x38f06b });
    spinBg.roundRect(-w / 2 + 6, -32, w - 12, 16, 10).fill({ color: 0xffffff, alpha: 0.32 });
  }

  // Sound toggle button
  const muteBtn = new Container();
  const muteBg = new Graphics()
    .circle(0, 0, 18)
    .fill({ color: 0x000000, alpha: 0.5 })
    .stroke({ color: 0xffffff, width: 1, alpha: 0.3 });
  const muteIcon = new Text({
    text: "♪",
    style: { fill: 0xffffff, fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: "900" },
  });
  muteIcon.anchor.set(0.5);
  muteBtn.addChild(muteBg, muteIcon);
  muteBtn.eventMode = "static";
  muteBtn.cursor = "pointer";
  muteBtn.on("pointertap", () => {
    audio.setMuted(!audio.muted);
    muteIcon.text = audio.muted ? "✕" : "♪";
  });
  uiLayer.addChild(muteBtn);

  // Banner & combo
  const banner = new Container();
  const bannerBg = new Graphics();
  const bannerTxt = new Text({
    text: "",
    style: {
      fill: 0x3a0e00, fontFamily: FONT_DISPLAY, fontWeight: "900", fontSize: 32, letterSpacing: 1,
    },
  });
  bannerTxt.anchor.set(0.5);
  banner.addChild(bannerBg, bannerTxt);
  banner.visible = false;
  overlayLayer.addChild(banner);

  const comboPill = new Container();
  const comboBg = new Graphics()
    .roundRect(-50, -16, 100, 32, 999)
    .fill({ color: 0x000000, alpha: 0.55 })
    .roundRect(-50, -16, 100, 32, 999)
    .stroke({ color: COL_ACCENT, width: 1 });
  const comboTxt = new Text({
    text: "COMBO ×1",
    style: { fill: cfg.style.colors.accent, fontFamily: FONT_DISPLAY, fontWeight: "900", fontSize: 13, letterSpacing: 1 },
  });
  comboTxt.anchor.set(0.5);
  comboPill.addChild(comboBg, comboTxt);
  comboPill.visible = false;
  overlayLayer.addChild(comboPill);

  // Free spins overlay
  const fsBadge = new Container();
  const fsBg = new Graphics()
    .roundRect(-70, -22, 140, 44, 14)
    .fill({ color: 0xffd84d })
    .roundRect(-70, -22, 140, 44, 14)
    .stroke({ color: 0x3a0e00, width: 2 });
  const fsTxt = new Text({
    text: "FREE 10",
    style: { fill: 0x3a0e00, fontFamily: FONT_DISPLAY, fontWeight: "900", fontSize: 18 },
  });
  fsTxt.anchor.set(0.5);
  fsBadge.addChild(fsBg, fsTxt);
  fsBadge.visible = false;
  overlayLayer.addChild(fsBadge);

  // ── State ───────────────────────────────────────────────────────────────────
  let score = 0;
  let lastWin = 0;
  let spinsUsed = 0;
  let freeSpins = 0;
  let fsAccMult = 0; // accumulated bomb multiplier within a free-spin round
  let spinning = false;
  let ctaShown = false;

  function refreshHud(): void {
    pillSpins.val.text = freeSpins > 0
      ? `FREE ${freeSpins}`
      : `${spinsUsed}/${DEMO_SPINS}`;
    pillScore.val.text = String(score);
    pillLast.val.text = String(lastWin);
    fsBadge.visible = freeSpins > 0;
    fsTxt.text = fsAccMult > 0 ? `FREE ${freeSpins} ×${fsAccMult}` : `FREE ${freeSpins}`;
  }

  // ── Cell rendering ──────────────────────────────────────────────────────────
  function buildCellNode(cell: Cell | null, w: number, h: number): Container {
    const c = new Container();
    if (!cell) return c;
    const r = Math.min(w, h) * 0.42;
    if (cell.kind === "sym") {
      const t = tex(cell.sym!.assetKey);
      if (t) {
        const sp = new Sprite(t);
        sp.anchor.set(0.5);
        const target = r * 2 * 0.95;
        const scale = target / Math.max(t.width, t.height);
        sp.scale.set(scale);
        c.addChild(sp);
      } else {
        const g = new Graphics();
        drawFruit(g, cell.sym!, r);
        c.addChild(g);
      }
    } else if (cell.kind === "scatter") {
      const t = tex(SCATTER_ASSET);
      if (t) {
        const sp = new Sprite(t);
        sp.anchor.set(0.5);
        const target = r * 2 * 1.0;
        const scale = target / Math.max(t.width, t.height);
        sp.scale.set(scale);
        c.addChild(sp);
      } else {
        const g = new Graphics();
        drawScatter(g, r);
        c.addChild(g);
      }
      // Pulse glow
      const ring = new Graphics().circle(0, 0, r * 0.85).stroke({ color: 0xffd84d, width: 2, alpha: 0.7 });
      c.addChild(ring);
      gsap.to(ring.scale, { x: 1.12, y: 1.12, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut" });
      gsap.to(ring, { alpha: 0.2, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut" });
    } else if (cell.kind === "bomb") {
      // Sprint C4: idle pulsing power ring — bombs telegraph latent energy.
      const idleRing = new Graphics()
        .circle(0, 0, r * 0.85)
        .stroke({ color: 0xffd84d, width: 3, alpha: 0.85 });
      c.addChild(idleRing);
      gsap.to(idleRing.scale, { x: 1.15, y: 1.15, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });
      gsap.to(idleRing, { alpha: 0.25, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });
      const t = tex(BOMB_ASSET);
      if (t) {
        const sp = new Sprite(t);
        sp.anchor.set(0.5);
        const target = r * 2 * 0.92;
        const scale = target / Math.max(t.width, t.height);
        sp.scale.set(scale);
        c.addChild(sp);
      } else {
        const g = new Graphics();
        drawBomb(g, r, cell.mult!);
        c.addChild(g);
      }
      const lbl = new Text({
        text: `×${cell.mult}`,
        style: {
          fill: 0xffd84d, fontFamily: FONT_DISPLAY, fontWeight: "900", fontSize: Math.max(11, r * 0.30),
          dropShadow: { color: 0x000000, blur: 0, distance: 1, alpha: 1, angle: Math.PI / 2 },
        },
      });
      lbl.anchor.set(0.5);
      lbl.y = r * 0.55;
      c.addChild(lbl);
    }
    return c;
  }

  function rebuildVisualGrid(): void {
    boardLayer.removeChildren();
    boardLayer.addChild(boardFrame);
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const wrap = new Container();
        wrap.position.set(boardX + col * cellW + cellW / 2, boardY + r * cellH + cellH / 2);
        const tile = new Graphics()
          .roundRect(-cellW / 2 + 2, -cellH / 2 + 2, cellW - 4, cellH - 4, 8)
          .fill({ color: 0xffffff, alpha: 0.04 })
          .roundRect(-cellW / 2 + 2, -cellH / 2 + 2, cellW - 4, cellH - 4, 8)
          .stroke({ color: 0xffffff, width: 1, alpha: 0.08 });
        wrap.addChild(tile);
        const sym = buildCellNode(board[r][col], cellW, cellH);
        wrap.addChild(sym);
        cellNodes[r][col] = wrap;
        boardLayer.addChild(wrap);
      }
    }
  }

  function repaintCell(r: number, c: number): void {
    const wrap = cellNodes[r][c];
    if (!wrap) return;
    // Remove old symbol (keep tile background at index 0)
    while (wrap.children.length > 1) wrap.removeChildAt(1);
    const sym = buildCellNode(board[r][c], cellW, cellH);
    wrap.addChild(sym);
  }

  // ── Win detection ───────────────────────────────────────────────────────────
  function countSymbols(): Map<string, number> {
    const counts = new Map<string, number>();
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const cell = board[r][col];
        if (!cell || cell.kind !== "sym") continue;
        counts.set(cell.sym!.id, (counts.get(cell.sym!.id) ?? 0) + 1);
      }
    }
    return counts;
  }
  function countScatters(): number {
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        if (board[r][col]?.kind === "scatter") n++;
      }
    }
    return n;
  }
  function tierMultiplier(n: number): number {
    if (n >= 12) return 10;
    if (n >= 10) return 3;
    return 1;
  }
  interface Win { sym: SymbolDef; count: number; payout: number; }
  function findWins(): Win[] {
    const counts = countSymbols();
    const wins: Win[] = [];
    for (const sym of SYMBOLS) {
      const n = counts.get(sym.id) ?? 0;
      if (n >= MIN_MATCH) wins.push({ sym, count: n, payout: sym.pay * n * tierMultiplier(n) });
    }
    return wins;
  }
  function totalBombMultiplier(): number {
    let m = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        if (board[r][col]?.kind === "bomb") m += board[r][col]!.mult!;
      }
    }
    return m;
  }

  // ── Animations ──────────────────────────────────────────────────────────────
  function popWinningNodes(winIds: Set<string>, chain: number): Promise<void> {
    const promises: Promise<void>[] = [];
    const popScale = 1.4 + Math.min(0.4, chain * 0.08);
    const pitchBase = 0.7 + Math.min(1.0, chain * 0.18);
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const cell = board[r][col];
        if (cell && cell.kind === "sym" && winIds.has(cell.sym!.id)) {
          const node = cellNodes[r][col];
          const sym = node.children[1] as Container | undefined;
          // Pre-pop tile flash (Sprint C5).
          tileFlash(r, col);
          if (sym) {
            spawnBurst(node.x, node.y, cell.sym!.fallbackColor);
            promises.push(new Promise<void>((resolve) => {
              gsap.to(sym.scale, { x: popScale, y: popScale, duration: 0.12, ease: "back.out(2)" });
              gsap.to(sym, { rotation: 0.3, duration: 0.15, ease: "sine.inOut" });
              gsap.to(sym, {
                alpha: 0, duration: 0.22, delay: 0.10, ease: "power2.in",
                onComplete: () => resolve(),
              });
              gsap.to(sym.scale, { x: 0, y: 0, duration: 0.22, delay: 0.10, ease: "power2.in" });
            }));
          }
          board[r][col] = null;
          audio.pop(pitchBase + Math.random() * 0.5);
        }
      }
    }
    return Promise.all(promises).then(() => undefined);
  }

  function spawnBurst(x: number, y: number, color: number): void {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const drop = new Graphics()
        .ellipse(0, 0, 4, 6)
        .fill({ color });
      drop.position.set(x, y);
      drop.rotation = Math.random() * Math.PI * 2;
      fxLayer.addChild(drop);
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 30 + Math.random() * 45;
      gsap.to(drop, {
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist + 14,
        alpha: 0,
        rotation: drop.rotation + Math.PI,
        duration: 0.55,
        ease: "power2.out",
        onComplete: () => drop.destroy(),
      });
    }
  }

  function shockwave(x: number, y: number): void {
    const ring = new Graphics()
      .circle(0, 0, 8)
      .stroke({ color: 0xffd84d, width: 6, alpha: 0.9 });
    ring.position.set(x, y);
    fxLayer.addChild(ring);
    gsap.to(ring.scale, { x: 18, y: 18, duration: 0.7, ease: "power2.out" });
    gsap.to(ring, { alpha: 0, duration: 0.7, ease: "power2.out", onComplete: () => ring.destroy() });
    // Inner flash
    const flash = new Graphics().circle(0, 0, 60).fill({ color: 0xfff7c2, alpha: 0.8 });
    flash.position.set(x, y);
    fxLayer.addChild(flash);
    gsap.to(flash.scale, { x: 4, y: 4, duration: 0.45, ease: "power2.out" });
    gsap.to(flash, { alpha: 0, duration: 0.45, ease: "power2.out", onComplete: () => flash.destroy() });
  }

  function screenShake(intensity = 8, duration = 0.35): void {
    const origX = app.stage.x, origY = app.stage.y;
    const tl = gsap.timeline({
      onComplete: () => { app.stage.x = origX; app.stage.y = origY; },
    });
    for (let i = 0; i < 8; i++) {
      tl.to(app.stage, {
        x: origX + (Math.random() - 0.5) * intensity * 2,
        y: origY + (Math.random() - 0.5) * intensity * 2,
        duration: duration / 8,
        ease: "none",
      });
    }
    tl.to(app.stage, { x: origX, y: origY, duration: duration / 8, ease: "none" });
  }

  function floatText(x: number, y: number, text: string, color: number, size = 22): void {
    const t = new Text({
      text,
      style: {
        fill: color, fontFamily: FONT_DISPLAY, fontWeight: "900", fontSize: size,
        dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.6, angle: Math.PI / 2 },
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    fxLayer.addChild(t);
    gsap.to(t, { y: y - 60, alpha: 0, duration: 0.9, ease: "power2.out", onComplete: () => t.destroy() });
    gsap.fromTo(t.scale, { x: 0.5, y: 0.5 }, { x: 1.2, y: 1.2, duration: 0.25, ease: "back.out(2)" });
  }

  // ── Polish helpers (Sprint B+C) ───────────────────────────────────────────────
  // Reusable vignette overlay (full screen, dark edges fading to clear center).
  let vignetteGfx: Graphics | null = null;
  function showVignette(intensity = 0.55): Graphics {
    if (vignetteGfx) { vignetteGfx.destroy(); vignetteGfx = null; }
    const w = app.screen.width, h = app.screen.height;
    const g = new Graphics();
    // Four corner rects with radial-ish gradient feel via multiple alpha layers.
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const inset = t * Math.min(w, h) * 0.5;
      const a = intensity * (1 - t) * 0.18;
      g.rect(0, 0, w, inset).fill({ color: 0x000000, alpha: a });
      g.rect(0, h - inset, w, inset).fill({ color: 0x000000, alpha: a });
      g.rect(0, inset, inset, h - inset * 2).fill({ color: 0x000000, alpha: a });
      g.rect(w - inset, inset, inset, h - inset * 2).fill({ color: 0x000000, alpha: a });
    }
    g.alpha = 0;
    overlayLayer.addChild(g);
    gsap.to(g, { alpha: 1, duration: 0.25, ease: "power2.out" });
    vignetteGfx = g;
    return g;
  }
  function hideVignette(): void {
    if (!vignetteGfx) return;
    const g = vignetteGfx;
    vignetteGfx = null;
    gsap.to(g, { alpha: 0, duration: 0.3, ease: "power2.in", onComplete: () => g.destroy() });
  }

  // Temporarily slow the entire game tick by a factor for `seconds` real-time.
  function slowMo(factor: number, seconds: number): void {
    const prev = app.ticker.speed;
    app.ticker.speed = factor;
    setTimeout(() => { app.ticker.speed = prev; }, seconds * 1000);
  }

  // Candy confetti — 100 colored small rects falling from top, swaying.
  function confettiBurst(count = 80, fromTop = true): void {
    const w = app.screen.width, h = app.screen.height;
    const COLORS = [0xff3aa5, 0xffd84d, 0x9b4dff, 0x38f06b, 0xff7e2e, 0xff5a5a, 0x7ad6ff];
    for (let i = 0; i < count; i++) {
      const c = COLORS[i % COLORS.length];
      const piece = new Graphics()
        .rect(-3, -6, 6, 12)
        .fill({ color: c });
      piece.rotation = Math.random() * Math.PI * 2;
      const startX = Math.random() * w;
      const startY = fromTop ? -20 - Math.random() * 60 : h / 2 + (Math.random() - 0.5) * 40;
      piece.position.set(startX, startY);
      fxLayer.addChild(piece);
      const dur = 1.8 + Math.random() * 1.2;
      const endY = h + 30;
      const sway = 80 + Math.random() * 80;
      gsap.to(piece, {
        y: endY, duration: dur, ease: "power1.in",
        onComplete: () => piece.destroy(),
      });
      gsap.to(piece, {
        x: startX + (Math.random() < 0.5 ? -sway : sway),
        duration: dur, ease: "sine.inOut",
      });
      gsap.to(piece, {
        rotation: piece.rotation + (Math.random() - 0.5) * 12,
        duration: dur, ease: "none",
      });
    }
  }

  // Coin shower — uses AI coin asset (fallback: golden circle). Lifts off and falls.
  function coinShower(count = 40): void {
    const w = app.screen.width, h = app.screen.height;
    const coinTex = tex(COIN_ASSET);
    for (let i = 0; i < count; i++) {
      let node: Container;
      if (coinTex) {
        const sp = new Sprite(coinTex);
        sp.anchor.set(0.5);
        const size = 26 + Math.random() * 18;
        const scale = size / Math.max(coinTex.width, coinTex.height);
        sp.scale.set(scale);
        node = sp;
      } else {
        const g = new Graphics();
        g.circle(0, 0, 12).fill({ color: 0xffd84d });
        g.circle(-3, -3, 4).fill({ color: 0xfff5c2, alpha: 0.7 });
        g.circle(0, 0, 12).stroke({ color: 0xc98a00, width: 2 });
        node = g;
      }
      const startX = w / 2 + (Math.random() - 0.5) * 80;
      const startY = h / 2 + (Math.random() - 0.5) * 40;
      node.position.set(startX, startY);
      node.alpha = 0;
      fxLayer.addChild(node);
      const angle = (Math.random() - 0.5) * Math.PI * 0.9 - Math.PI / 2;
      const power = 80 + Math.random() * 220;
      const apexX = startX + Math.cos(angle) * power;
      const apexY = startY + Math.sin(angle) * power;
      const dur = 1.2 + Math.random() * 1.0;
      gsap.to(node, { alpha: 1, duration: 0.12 });
      gsap.to(node, {
        x: apexX, duration: dur * 0.5, ease: "power2.out",
      });
      gsap.to(node, {
        y: apexY, duration: dur * 0.5, ease: "power2.out",
        onComplete: () => {
          gsap.to(node, {
            x: apexX + (Math.random() - 0.5) * 40,
            y: h + 30, duration: dur * 0.5, ease: "power2.in",
            onComplete: () => node.destroy(),
          });
        },
      });
      const rotEnd = (Math.random() - 0.5) * 8;
      gsap.to(node, { rotation: rotEnd, duration: dur, ease: "none" });
    }
  }

  // Flash the tile background under a cell (called just before a symbol pops).
  function tileFlash(r: number, c: number): void {
    const wrap = cellNodes[r]?.[c];
    if (!wrap) return;
    const tile = wrap.children[0] as Graphics;
    if (!tile) return;
    const flash = new Graphics()
      .roundRect(-cellW / 2 + 2, -cellH / 2 + 2, cellW - 4, cellH - 4, 8)
      .fill({ color: 0xffd84d, alpha: 0.85 });
    wrap.addChildAt(flash, 1);
    gsap.to(flash, {
      alpha: 0, duration: 0.32, ease: "power2.out",
      onComplete: () => flash.destroy(),
    });
    void tile;
  }

  // Score pop animation on a HUD pill value text.
  function scorePop(txt: Text): void {
    gsap.killTweensOf(txt.scale);
    gsap.fromTo(txt.scale,
      { x: 1, y: 1 },
      { x: 1.35, y: 1.35, duration: 0.12, ease: "back.out(2.4)",
        onComplete: () => gsap.to(txt.scale, { x: 1, y: 1, duration: 0.25, ease: "elastic.out(1, 0.5)" }) },
    );
  }

  // Big "tally" text in board center for super bonus reveal. Persists, accumulates.
  let tallyNode: Container | null = null;
  function showTally(text: string, isBig: boolean): void {
    if (!tallyNode) {
      tallyNode = new Container();
      overlayLayer.addChild(tallyNode);
    }
    while (tallyNode.children.length) tallyNode.removeChildAt(0).destroy();
    const t = new Text({
      text,
      style: {
        fill: 0xffd84d,
        fontFamily: FONT_DISPLAY,
        fontWeight: "900",
        fontSize: isBig ? 64 : 44,
        dropShadow: { color: 0x000000, blur: 0, distance: 3, alpha: 0.8, angle: Math.PI / 2 },
        align: "center",
      },
    });
    t.anchor.set(0.5);
    tallyNode.addChild(t);
    tallyNode.position.set(app.screen.width / 2, boardY + (ROWS * cellH) / 2);
    gsap.fromTo(t.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.25, ease: "back.out(2.2)" });
    if (isBig) {
      gsap.to(t.scale, { x: 1.15, y: 1.15, duration: 0.3, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }
  }
  function hideTally(): void {
    if (!tallyNode) return;
    const n = tallyNode;
    tallyNode = null;
    gsap.to(n, { alpha: 0, duration: 0.3, onComplete: () => n.destroy() });
  }

  // Anticipation glow — pulse a gold ring on cells that match a winning symbol.
  function anticipationGlow(symId: string): Container[] {
    const rings: Container[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const cell = board[r][col];
        if (cell && cell.kind === "sym" && cell.sym!.id === symId) {
          const wrap = cellNodes[r]?.[col];
          if (!wrap) continue;
          const ring = new Graphics()
            .circle(0, 0, Math.min(cellW, cellH) * 0.5)
            .stroke({ color: 0xffd84d, width: 3, alpha: 0.9 });
          wrap.addChild(ring);
          gsap.to(ring.scale, { x: 1.2, y: 1.2, duration: 0.45, yoyo: true, repeat: -1, ease: "sine.inOut" });
          gsap.to(ring, { alpha: 0.3, duration: 0.45, yoyo: true, repeat: -1, ease: "sine.inOut" });
          rings.push(ring);
        }
      }
    }
    return rings;
  }
  function killAnticipation(rings: Container[]): void {
    for (const r of rings) {
      gsap.killTweensOf(r);
      gsap.killTweensOf(r.scale);
      gsap.to(r, { alpha: 0, duration: 0.2, onComplete: () => r.destroy() });
    }
  }

  // Board glow ring — used at high combo chain.
  let boardGlowRing: Graphics | null = null;
  function setBoardGlow(enabled: boolean, intensity = 1): void {
    if (!enabled) {
      if (boardGlowRing) {
        gsap.killTweensOf(boardGlowRing);
        gsap.to(boardGlowRing, { alpha: 0, duration: 0.3, onComplete: () => {
          boardGlowRing?.destroy(); boardGlowRing = null;
        }});
      }
      return;
    }
    const bw = cellW * COLS, bh = cellH * ROWS;
    if (boardGlowRing) { boardGlowRing.destroy(); boardGlowRing = null; }
    const g = new Graphics()
      .roundRect(boardX - 14, boardY - 14, bw + 28, bh + 28, 22)
      .stroke({ color: 0xffd84d, width: 4, alpha: 0.9 });
    g.alpha = 0;
    fxLayer.addChildAt(g, 0);
    gsap.to(g, { alpha: 0.9 * intensity, duration: 0.25 });
    gsap.to(g.scale, { x: 1.02, y: 1.02, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
    boardGlowRing = g;
  }

  async function tumble(): Promise<void> {
    // Collect persistent cells per column, fill from top, animate drop.
    const drops: Promise<void>[] = [];
    for (let col = 0; col < COLS; col++) {
      const stack: Cell[] = [];
      for (let r = ROWS - 1; r >= 0; r--) if (board[r][col]) stack.push(board[r][col]!);
      // Lay them out from bottom
      const newBoardCol: Cell[] = new Array(ROWS).fill(null);
      for (let r = ROWS - 1, idx = 0; r >= 0; r--, idx++) {
        if (idx < stack.length) {
          newBoardCol[r] = stack[idx];
        } else {
          // New cells — in FS, don't spawn new bombs (they're "sticky" only from existing)
          newBoardCol[r] = newCell({ allowScatter: true, allowBomb: freeSpins === 0 });
        }
      }
      for (let r = 0; r < ROWS; r++) {
        board[r][col] = newBoardCol[r];
      }
    }
    // Repaint then animate drop-in.
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        repaintCell(r, col);
        const node = cellNodes[r][col];
        const sym = node.children[1] as Container | undefined;
        if (sym) {
          const fromY = node.y - (ROWS - r) * cellH * 0.6;
          sym.y = -((ROWS - r) * cellH * 0.6);
          drops.push(new Promise<void>((resolve) => {
            gsap.to(sym, {
              y: 0, duration: TUMBLE_DUR, ease: "bounce.out", delay: col * 0.02 + r * 0.01,
              onComplete: () => resolve(),
            });
          }));
          void fromY;
        }
      }
    }
    audio.drop();
    await Promise.all(drops);
  }

  async function spinReel(): Promise<void> {
    // Replace entire board, animate reel-style drop.
    const blockBombsOnNewSpin = freeSpins === 0; // in FS, base reel keeps bombs growing chance
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        board[r][col] = newCell({ allowScatter: true, allowBomb: blockBombsOnNewSpin });
      }
    }
    const drops: Promise<void>[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        repaintCell(r, col);
        const node = cellNodes[r][col];
        const sym = node.children[1] as Container | undefined;
        if (sym) {
          sym.y = -(ROWS - r + 1) * cellH;
          sym.alpha = 0;
          // Motion blur via scale stretch
          sym.scale.y = 1.6;
          drops.push(new Promise<void>((resolve) => {
            gsap.to(sym, {
              y: 0, alpha: 1, duration: SPIN_REEL_DUR, ease: "back.out(1.4)",
              delay: col * 0.04,
              onComplete: () => resolve(),
            });
            gsap.to(sym.scale, { y: 1, duration: SPIN_REEL_DUR * 0.8, ease: "power2.out", delay: col * 0.04 });
          }));
        }
      }
    }
    audio.drop();
    await Promise.all(drops);
    // Sprint C3: anticipation — if any symbol has 7+ (near or at win threshold),
    // briefly pulse those cells for drama before the cascade resolves.
    const counts = countSymbols();
    let bestSym: string | null = null;
    let bestN = 0;
    for (const [id, n] of counts) {
      if (n >= 7 && n > bestN) { bestN = n; bestSym = id; }
    }
    if (bestSym) {
      const rings = anticipationGlow(bestSym);
      audio.pop(1.3);
      await sleep(380);
      killAnticipation(rings);
    }
  }

  function showBanner(text: string, dur = 1100): Promise<void> {
    return new Promise((resolve) => {
      bannerTxt.text = text;
      const tw = bannerTxt.width + 36;
      bannerBg.clear();
      bannerBg.roundRect(-tw / 2, -28, tw, 56, 18).fill({ color: 0xffd84d });
      bannerBg.roundRect(-tw / 2, -28, tw, 56, 18).stroke({ color: 0x3a0e00, width: 2 });
      banner.visible = true;
      banner.scale.set(0);
      banner.alpha = 1;
      gsap.to(banner.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(1.8)" });
      gsap.to(banner, {
        alpha: 0, delay: dur / 1000, duration: 0.3,
        onComplete: () => { banner.visible = false; resolve(); },
      });
    });
  }

  function showCombo(n: number): void {
    if (n <= 1) { comboPill.visible = false; return; }
    comboTxt.text = `COMBO ×${n}`;
    comboPill.visible = true;
    comboPill.scale.set(0.6);
    gsap.to(comboPill.scale, { x: 1, y: 1, duration: 0.18, ease: "back.out(1.8)" });
  }

  function animateScoreTo(target: number): void {
    const from = lastWin;
    const tween = { v: from };
    gsap.to(tween, {
      v: target, duration: 0.6, ease: "power2.out",
      onUpdate: () => { pillLast.val.text = String(Math.round(tween.v)); },
      onComplete: () => { lastWin = target; pillLast.val.text = String(target); },
    });
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── CTA endcard (cinematic, AI-frame based, Sprint A5) ─────────────────────
  const cta = new Container();
  const ctaScrim = new Graphics();
  const ctaPanel = new Container();
  const ctaBg = new Graphics();                    // procedural fallback
  const ctaFrameSprite = new Sprite();             // AI endcard-frame
  const ctaCrownSprite = new Sprite();             // AI endcard-crown
  const ctaTitle = new Text({
    text: "BIG WIN!",
    style: {
      fill: 0xffd84d,
      fontFamily: FONT_DISPLAY,
      fontWeight: "900",
      fontSize: 44,
      letterSpacing: 2,
      dropShadow: { color: 0x3a0e00, blur: 0, distance: 3, alpha: 0.9, angle: Math.PI / 2 },
    },
  });
  ctaTitle.anchor.set(0.5);
  const ctaScore = new Text({
    text: "",
    style: {
      fill: 0xffd84d,
      fontFamily: FONT_DISPLAY,
      fontWeight: "900",
      fontSize: 56,
      dropShadow: { color: 0x3a0e00, blur: 0, distance: 3, alpha: 0.9, angle: Math.PI / 2 },
    },
  });
  ctaScore.anchor.set(0.5);
  const ctaSub = new Text({
    text: "TRY YOUR LUCK",
    style: {
      fill: 0xffffff, fontFamily: FONT_BODY, fontSize: 16, letterSpacing: 1,
    },
  });
  ctaSub.anchor.set(0.5);
  const ctaBtn = new Container();
  const ctaBtnBg = new Graphics();
  const ctaBtnGlow = new Graphics();
  const ctaBtnTxt = new Text({
    text: cfg.copy.cta,
    style: { fill: 0x04220c, fontFamily: FONT_BODY, fontWeight: "900", fontSize: 22, letterSpacing: 1 },
  });
  ctaBtnTxt.anchor.set(0.5);
  ctaBtn.addChild(ctaBtnGlow, ctaBtnBg, ctaBtnTxt);
  ctaBtn.eventMode = "static";
  ctaBtn.cursor = "pointer";
  ctaBtn.on("pointertap", () => {
    if (window.FbPlayableAd) window.FbPlayableAd.onCTAClick();
  });
  // Order matters: frame back, then crown on top, then content, then button.
  ctaPanel.addChild(ctaBg, ctaFrameSprite, ctaCrownSprite, ctaTitle, ctaScore, ctaSub, ctaBtn);
  cta.addChild(ctaScrim, ctaPanel);
  cta.visible = false;
  overlayLayer.addChild(cta);

  async function showCTA(scoreVal: number): Promise<void> {
    if (ctaShown) return;
    ctaShown = true;
    const w = app.screen.width, h = app.screen.height;

    // Sprint A5 Step 1: pre-roll glow on board (250ms).
    setBoardGlow(true, 1);
    audio.chime();
    await sleep(250);

    // Step 2: zoom-in stage (400ms).
    gsap.to(app.stage.scale, { x: 1.08, y: 1.08, duration: 0.4, ease: "power2.in" });
    gsap.to(app.stage, { x: -w * 0.04, y: -h * 0.04, duration: 0.4, ease: "power2.in" });
    await sleep(250);

    // Step 3: black wipe scrim fades in (200ms).
    ctaScrim.clear();
    ctaScrim.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.78 });
    cta.visible = true;
    cta.alpha = 0;
    ctaPanel.position.set(w / 2, h / 2);
    gsap.to(cta, { alpha: 1, duration: 0.2 });
    await sleep(220);

    // Reset stage zoom (now hidden behind scrim).
    gsap.to(app.stage.scale, { x: 1, y: 1, duration: 0.3 });
    gsap.to(app.stage, { x: 0, y: 0, duration: 0.3 });
    setBoardGlow(false);

    // Step 4: frame slam from top (450ms with bounce + screen shake).
    const frameTex = tex(ENDCARD_FRAME);
    const crownTex = tex(ENDCARD_CROWN);
    // Bounding box for the endcard — use most of the viewport.
    const pwBound = Math.min(380, w - 24);
    const phBound = Math.min(620, h - 70);

    // Compute frame display dimensions BASED ON its native aspect, so content
    // can be positioned as % of the ACTUAL visible frame, not the constraint box.
    let frameDisplayW = pwBound;
    let frameDisplayH = phBound;
    if (frameTex) {
      const fs = Math.min(pwBound / frameTex.width, phBound / frameTex.height);
      frameDisplayW = frameTex.width * fs;
      frameDisplayH = frameTex.height * fs;
      ctaFrameSprite.texture = frameTex;
      ctaFrameSprite.anchor.set(0.5);
      ctaFrameSprite.scale.set(fs);
      ctaFrameSprite.alpha = 1;
      ctaBg.clear();
    } else {
      // Procedural fallback frame fills the bounding box.
      ctaFrameSprite.alpha = 0;
      ctaBg.clear();
      ctaBg.roundRect(-pwBound / 2, -phBound / 2, pwBound, phBound, 28).fill({ color: 0x1a052a, alpha: 0.96 });
      ctaBg.roundRect(-pwBound / 2, -phBound / 2, pwBound, phBound, 28).stroke({ color: 0xffd84d, width: 4 });
      ctaBg.roundRect(-pwBound / 2 + 6, -phBound / 2 + 6, pwBound - 12, phBound - 12, 22)
        .stroke({ color: 0xff7e2e, width: 2, alpha: 0.6 });
    }

    // Content positioning (relative to ACTUAL frame display, not bounding box).
    // The AI frame asset visually divides into ~15% top ornament + ribbon area,
    // ~70% empty center panel, ~15% bottom ornament. Place content in middle 70%.
    ctaTitle.y = -frameDisplayH * 0.34;  // sits on top ribbon area
    ctaScore.y = -frameDisplayH * 0.04;  // upper-middle of empty center
    ctaSub.y = frameDisplayH * 0.10;     // lower-middle
    ctaBtn.y = frameDisplayH * 0.28;     // inside bottom band, above ornament

    // Crown sits ABOVE the frame ribbon, centered horizontally with frame.
    const finalFrameY = 0;
    const finalCrownY = -frameDisplayH * 0.46;
    ctaFrameSprite.y = -h;
    ctaCrownSprite.y = -h;
    if (crownTex) {
      ctaCrownSprite.texture = crownTex;
      ctaCrownSprite.anchor.set(0.5);
      const targetCrownW = frameDisplayW * 0.78;
      const targetCrownH = Math.min(80, frameDisplayH * 0.18);
      const cs = Math.min(targetCrownW / crownTex.width, targetCrownH / crownTex.height);
      ctaCrownSprite.scale.set(cs);
    } else {
      ctaCrownSprite.alpha = 0;
    }

    // Hide content until frame arrives
    ctaTitle.alpha = 0; ctaScore.alpha = 0; ctaSub.alpha = 0; ctaBtn.alpha = 0;
    ctaTitle.scale.set(0.5); ctaScore.scale.set(0.5);

    // Frame slam
    gsap.to(ctaFrameSprite, { y: finalFrameY, duration: 0.5, ease: "back.out(1.8)" });
    audio.drop();
    await sleep(280);
    screenShake(8, 0.3);
    await sleep(220);

    // Step 5: crown rotate-in (300ms)
    if (crownTex) {
      ctaCrownSprite.rotation = -Math.PI;
      gsap.to(ctaCrownSprite, { y: finalCrownY, duration: 0.4, ease: "back.out(1.6)" });
      gsap.to(ctaCrownSprite, { rotation: 0, duration: 0.5, ease: "back.out(1.8)" });
    }
    audio.chime();
    await sleep(350);

    // Step 6: BIG WIN typewriter (per-char scale-pop, 400ms total)
    ctaTitle.alpha = 1;
    const titleText = scoreVal >= 2000 ? "BIG WIN!" : scoreVal >= 500 ? "NICE WIN!" : "GOOD TRY!";
    ctaTitle.text = titleText;
    gsap.fromTo(ctaTitle.scale, { x: 0, y: 0 }, { x: 1, y: 1, duration: 0.4, ease: "back.out(2.2)" });
    await sleep(300);

    // Step 7: score odometer count up (1000ms)
    ctaScore.alpha = 1;
    ctaScore.text = "0";
    gsap.fromTo(ctaScore.scale, { x: 0.5, y: 0.5 }, { x: 1, y: 1, duration: 0.3, ease: "back.out(2)" });
    const odo = { v: 0 };
    let lastTickK = 0;
    gsap.to(odo, {
      v: scoreVal, duration: 1.0, ease: "power2.out",
      onUpdate: () => {
        ctaScore.text = String(Math.round(odo.v));
        const k = Math.floor(odo.v / 800);
        if (k > lastTickK) { audio.pop(1.4); lastTickK = k; }
      },
      onComplete: () => { ctaScore.text = String(scoreVal); audio.fanfare(); },
    });
    await sleep(800);

    // Step 8: sub text + CTA button reveal (600ms)
    ctaSub.alpha = 1;
    gsap.fromTo(ctaSub, { y: ctaSub.y + 20 }, { y: ctaSub.y, alpha: 1, duration: 0.3, ease: "power2.out" });

    const bw = Math.min(frameDisplayW * 0.72, 280);
    ctaBtnGlow.clear();
    ctaBtnGlow.roundRect(-bw / 2 - 6, -32, bw + 12, 64, 26).fill({ color: 0xffd84d, alpha: 0.45 });
    ctaBtnBg.clear();
    ctaBtnBg.roundRect(-bw / 2, -28, bw, 56, 22).fill({ color: 0x0a6d24 });
    ctaBtnBg.roundRect(-bw / 2, -28, bw, 50, 22).fill({ color: 0x14a83a });
    ctaBtnBg.roundRect(-bw / 2, -28, bw, 42, 22).fill({ color: 0x38f06b });
    ctaBtnBg.roundRect(-bw / 2 + 8, -24, bw - 16, 14, 8).fill({ color: 0xffffff, alpha: 0.34 });
    ctaBtn.alpha = 1;
    ctaBtn.scale.set(0.6);
    gsap.to(ctaBtn.scale, { x: 1, y: 1, duration: 0.45, ease: "back.out(1.8)" });

    // Step 9: button breathing + glow pulse, coin shower
    gsap.to(ctaBtn, { y: ctaBtn.y - 5, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });
    gsap.to(ctaBtnGlow, { alpha: 0.2, duration: 0.8, yoyo: true, repeat: -1, ease: "sine.inOut" });

    audio.fanfare();
    confettiBurst(120, true);
    coinShower(50);
    // Continuous slow rain of coins
    const coinInterval = setInterval(() => {
      if (!cta.visible) { clearInterval(coinInterval); return; }
      coinShower(8);
    }, 1100);
    // Cleanup if user navigates away (Pixi destroys cta)
    void coinInterval;
  }

  // ── Main spin loop ──────────────────────────────────────────────────────────
  async function doSpin(): Promise<void> {
    if (spinning) return;
    spinning = true;
    spinBtn.alpha = 0.6;
    showCombo(1);
    audio.spin(); // V2 MUSIC: reel-start whoosh (also unlocks ctx + starts BGM on first tap)

    // 1) Reel-style fresh spin (skipped only for the very first spin? — always do it for feel)
    await spinReel();

    // 2) Scatter check (trigger free spins)
    const scatters = countScatters();
    if (scatters >= FREE_SPINS_TRIGGER && freeSpins === 0) {
      freeSpins = FREE_SPINS_AWARDED;
      fsAccMult = 0;
      audio.chime();
      await showBanner(`FREE SPINS! ×${FREE_SPINS_AWARDED}`, 1300);
      screenShake(6, 0.3);
    }

    // 3) Tumble cascades
    let spinWin = 0;
    let chain = 0;
    while (true) {
      const wins = findWins();
      if (wins.length === 0) break;
      chain++;
      showCombo(chain);

      const ids = new Set(wins.map(w => w.sym.id));
      for (const w of wins) {
        // Find a representative cell for the floater
        outer:
        for (let r = 0; r < ROWS; r++) {
          for (let col = 0; col < COLS; col++) {
            const cell = board[r][col];
            if (cell && cell.kind === "sym" && cell.sym!.id === w.sym.id) {
              const node = cellNodes[r][col];
              floatText(node.x, node.y, `+${w.payout}`, 0xffd84d, 24);
              break outer;
            }
          }
        }
        spinWin += w.payout;
      }
      await popWinningNodes(ids, chain);
      // Chain-escalation effects (Sprint C1).
      if (chain >= 3) setBoardGlow(true, Math.min(1, 0.6 + chain * 0.1));
      if (chain >= 5) {
        slowMo(0.5, 0.4);
        audio.chime();
      }
      await tumble();
    }
    setBoardGlow(false);

    // 4) Bombs — Sequential ignition reveal (Sprint B1+B2+B3+B5).
    let bombSum = 0;
    if (spinWin > 0 || freeSpins > 0) {
      bombSum = totalBombMultiplier();
      if (bombSum > 0) {
        // Collect bombs in row-major order; we'll ignite one by one.
        const bombs: { r: number; col: number; mult: number }[] = [];
        for (let r = 0; r < ROWS; r++) {
          for (let col = 0; col < COLS; col++) {
            const cell = board[r][col];
            if (cell?.kind === "bomb") bombs.push({ r, col, mult: cell.mult! });
          }
        }
        // Sprint B2: vignette focuses attention.
        showVignette(0.6);
        let runningSum = 0;
        showTally("×0", false);
        for (let i = 0; i < bombs.length; i++) {
          const b = bombs[i];
          runningSum += b.mult;
          const node = cellNodes[b.r][b.col];
          // Ignite this bomb
          shockwave(node.x, node.y);
          floatText(node.x, node.y - 8, `×${b.mult}`, 0xffd84d, 28 + Math.min(20, i * 4));
          const sym = node.children[1] as Container | undefined;
          if (sym) {
            gsap.to(sym.scale, { x: 1.8 + i * 0.2, y: 1.8 + i * 0.2, duration: 0.12, ease: "back.out(2)" });
            gsap.to(sym, { alpha: 0, duration: 0.25, delay: 0.10, ease: "power2.in" });
          }
          // Escalating shake + audio pitch
          screenShake(8 + i * 2, 0.25);
          audio.bomb();
          // Update running tally with pulse
          showTally(`×${runningSum}`, i === bombs.length - 1);
          if (freeSpins === 0) board[b.r][b.col] = null;
          // Sprint B3: slow-mo on the FINAL ignition.
          if (i === bombs.length - 1) {
            slowMo(0.4, 0.5);
            audio.fanfare();
          }
          await sleep(180 + i * 30); // stagger grows slightly
        }
        // Sprint B5: confetti at high multipliers.
        if (runningSum >= 50) confettiBurst(120, true);
        await sleep(600);
        hideTally();
        hideVignette();
        if (freeSpins > 0) {
          fsAccMult += bombSum;
          await showBanner(`MULTIPLIER +${bombSum} → ×${fsAccMult}`, 1400);
        } else {
          await tumble();
        }
      }
    }

    // 5) Apply multipliers
    if (spinWin > 0) {
      if (freeSpins > 0) {
        // FS: multiply this spin's win by accumulated multiplier
        if (fsAccMult > 0) spinWin = spinWin * fsAccMult;
      } else {
        // Base: multiply by this-spin's bomb sum
        if (bombSum > 0) spinWin = spinWin * bombSum;
      }
    }

    // 6) Commit + banner
    if (spinWin > 0) {
      if (spinWin >= 1000) {
        await showBanner(`SUPER BONUS!  +${spinWin}`, 1400);
        screenShake(12, 0.5);
      } else if (chain >= 3) {
        await showBanner(`BIG WIN!  +${spinWin}`, 900);
        screenShake(6, 0.3);
      } else if (chain >= 2) {
        await showBanner(`NICE!  +${spinWin}`, 700);
      }
    }

    score += spinWin;
    animateScoreTo(spinWin);
    pillScore.val.text = String(score);
    // Sprint C2: score pop animation
    if (spinWin > 0) {
      scorePop(pillScore.val);
      scorePop(pillLast.val);
    }

    showCombo(1);
    if (freeSpins > 0) {
      freeSpins--;
      refreshHud();
      if (freeSpins === 0) {
        await sleep(400);
        await showBanner(`FREE SPINS DONE!`, 1100);
        fsAccMult = 0;
      }
    } else {
      spinsUsed++;
      refreshHud();
    }

    spinBtn.alpha = 1;
    spinning = false;

    // Endcard after demo spins (or earlier on a huge win)
    if (!ctaShown && (spinsUsed >= DEMO_SPINS || score >= 5000)) {
      await sleep(300);
      await showCTA(score);
    } else if (freeSpins > 0) {
      // Auto-chain free spins
      await sleep(450);
      doSpin();
    }
  }

  // Sprint C6: spin button feel — pressdown/up with elastic scale
  spinBtn.on("pointerdown", () => {
    if (spinning) return;
    gsap.to(spinBtn.scale, { x: 0.93, y: 0.93, duration: 0.08, ease: "power2.out" });
  });
  spinBtn.on("pointerup", () => {
    gsap.to(spinBtn.scale, { x: 1.05, y: 1.05, duration: 0.12, ease: "back.out(2)",
      onComplete: () => gsap.to(spinBtn.scale, { x: 1, y: 1, duration: 0.15, ease: "elastic.out(1, 0.4)" }) });
  });
  spinBtn.on("pointertap", () => doSpin());
  // Idle pulse: subtle breathing when player hasn't spun in a while
  gsap.to(spinLabel.scale, { x: 1.05, y: 1.05, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut" });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); doSpin(); }
    if (e.code === "KeyM") { audio.setMuted(!audio.muted); muteIcon.text = audio.muted ? "✕" : "♪"; }
  });

  // ── Layout / resize ─────────────────────────────────────────────────────────
  function layout(): void {
    const w = app.screen.width, h = app.screen.height;
    const isNarrow = w < 480;

    // Background: use sprite if asset present, else gradient.
    const bgTex = tex(BG_ASSET);
    if (bgTex) {
      bgGrad.visible = false;
      bgSprite.visible = true;
      bgSprite.texture = bgTex;
      const sx = w / bgTex.width, sy = h / bgTex.height;
      const s = Math.max(sx, sy);
      bgSprite.scale.set(s);
      bgSprite.anchor.set(0.5);
      bgSprite.position.set(w / 2, h / 2);
    } else {
      bgSprite.visible = false;
      bgGrad.visible = true;
      paintBgGradient(w, h);
    }
    buildDrifters(w, h);

    // ── HUD: 3 pills (SPINS, SCORE, WIN) + mute on far right ──────────────────
    const muteSize = 22;
    const muteX = w - muteSize - 10;
    const muteY = 28;
    muteBtn.position.set(muteX, muteY);

    // Pills fit between left edge and mute button.
    const hudLeftPad = 10;
    const hudRightPad = muteSize * 2 + 16;
    const pillSlotW = (w - hudLeftPad - hudRightPad) / 3;
    const pillTargetW = Math.min(140, pillSlotW - 6);
    const pillScale = Math.max(0.7, pillTargetW / 160);
    const hudY = 28;
    [pillSpins, pillScore, pillLast].forEach((p, i) => {
      p.node.position.set(hudLeftPad + pillSlotW * (i + 0.5), hudY);
      p.node.scale.set(pillScale);
    });

    // ── Title / logo: small, just under HUD ───────────────────────────────────
    const headerBottom = hudY + Math.ceil(22 * pillScale); // bottom of HUD pills
    const logoMaxW = Math.min(w * 0.42, 170);
    const logoMaxH = isNarrow ? 56 : 72;
    let titleY = headerBottom + 8 + logoMaxH / 2;
    if (logoSprite.visible) {
      const t = logoSprite.texture;
      const s = Math.min(logoMaxW / t.width, logoMaxH / t.height);
      logoSprite.scale.set(s);
      logoSprite.position.set(w / 2, titleY);
    } else {
      titleText.position.set(w / 2, titleY);
    }

    // ── Spin button: ANCHORED to bottom of viewport ───────────────────────────
    // Spin sits at a fixed offset from the bottom edge so it always lives in
    // the natural thumb-zone, regardless of viewport height.
    const spinH = 64;
    const bottomPad = 24;
    const spinY = h - bottomPad - spinH / 2;

    // ── Board: fills the vertical space BETWEEN header bottom and spin top ────
    // boardMaxW is constrained by viewport width; boardMaxH by the gap.
    const boardMargin = 10;
    const boardMaxW = w - boardMargin * 2;
    const headerBottomY = titleY + logoMaxH / 2;
    const topGap = 14;
    const bottomGap = 18;
    const availableTop = headerBottomY + topGap;
    const availableBot = spinY - spinH / 2 - bottomGap;
    const boardMaxH = availableBot - availableTop;
    cellW = Math.floor(Math.min(boardMaxW / COLS, boardMaxH / ROWS));
    cellH = cellW;
    const bw = cellW * COLS;
    const bh = cellH * ROWS;
    boardX = Math.floor((w - bw) / 2);
    // Vertically center the board in the available middle band.
    boardY = Math.floor(availableTop + (boardMaxH - bh) / 2);
    boardFrame.clear();
    boardFrame.roundRect(boardX - 8, boardY - 8, bw + 16, bh + 16, 18)
      .fill({ color: 0x1a052a, alpha: 0.75 });
    boardFrame.roundRect(boardX - 8, boardY - 8, bw + 16, bh + 16, 18)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.25 });
    rebuildVisualGrid();

    // ── Spin button: full board width, anchored to bottom ─────────────────────
    const sbW = Math.min(bw, 320);
    paintSpinButton(sbW);
    spinBtn.position.set(w / 2, spinY);

    // ── Overlays ──────────────────────────────────────────────────────────────
    banner.position.set(w / 2, boardY + bh / 2);
    // Combo: between header and board, right-aligned with board (no overlap).
    comboPill.position.set(boardX + bw - 56, boardY - 14);
    // FS badge: between header and board, left side.
    fsBadge.position.set(boardX + 70, boardY - 14);
  }
  layout();
  window.addEventListener("resize", layout);

  refreshHud();
}

void main();
