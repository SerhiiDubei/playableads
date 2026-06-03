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

// ── Audio (Web Audio synthesis, 0 byte assets) ────────────────────────────────
// ── Audio: MP3 first (high-quality SFX/BGM merged from V2), WebAudio fallback ─
// Loads HTMLAudioElement from cfg.assets if present; otherwise synthesizes a
// short sound via Web Audio API so the game still has audible feedback even
// without baked MP3 files. BGM is a separate looped element started on the
// first user gesture (autoplay policy).
class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private sfxVolume = 0.55;
  private bgmVolume = 0.22;

  // Map of name → preloaded base HTMLAudioElement (kept paused; we clone on play).
  private sfx: Record<string, HTMLAudioElement> = {};
  private bgm: HTMLAudioElement | null = null;
  private bgmStarted = false;
  // Tiny per-name throttle so spammed sounds (pop) don't stack into a wall of noise.
  private lastPlayAt: Record<string, number> = {};

  ensure(): void {
    if (this.ctx) return;
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.4;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.4;
    if (this.bgm) this.bgm.volume = m ? 0 : this.bgmVolume;
  }

  // Register MP3 assets from cfg.assets — values are already data URIs.
  setAssets(assets: Record<string, string>): void {
    const NAMES = ["sfx-pop.mp3", "sfx-drop.mp3", "sfx-chime.mp3", "sfx-bomb.mp3", "sfx-fanfare.mp3", "sfx-spin.mp3"];
    for (const n of NAMES) {
      if (assets[n]) {
        const a = document.createElement("audio");
        a.src = assets[n];
        a.preload = "auto";
        a.volume = this.sfxVolume;
        this.sfx[n] = a;
      }
    }
    if (assets["bgm-ambient-loop.mp3"]) {
      const bgm = document.createElement("audio");
      bgm.src = assets["bgm-ambient-loop.mp3"];
      bgm.preload = "auto";
      bgm.loop = true;
      bgm.volume = 0;
      this.bgm = bgm;
    }
  }

  // Play a cached SFX. Clones the element so overlapping calls don't cut off.
  // pitch via playbackRate (also speeds it up — same effect as pitch shift).
  private playMp3(name: string, pitch = 1, throttleMs = 30): boolean {
    if (this.muted) return true; // treat as handled
    const base = this.sfx[name];
    if (!base) return false;
    const now = performance.now();
    const last = this.lastPlayAt[name] ?? 0;
    if (now - last < throttleMs) return true;
    this.lastPlayAt[name] = now;
    // Reuse the same element when possible (cheaper); clone on overlap.
    const node = base.paused || base.ended ? base : (base.cloneNode() as HTMLAudioElement);
    try {
      node.currentTime = 0;
      node.playbackRate = Math.max(0.5, Math.min(2.5, pitch));
      node.volume = this.sfxVolume;
      void node.play();
    } catch {
      /* ignore — playback gesture not yet granted */
    }
    return true;
  }

  // BGM kick-off on first user gesture (autoplay policy).
  startBgm(): void {
    if (this.bgmStarted || !this.bgm || this.muted) return;
    this.bgmStarted = true;
    // Fade in from 0 to bgmVolume over ~1.2s for soft entry.
    try {
      void this.bgm.play();
      const target = this.bgmVolume;
      const steps = 24;
      let i = 0;
      const id = window.setInterval(() => {
        i++;
        if (!this.bgm) { window.clearInterval(id); return; }
        this.bgm.volume = (i / steps) * target;
        if (i >= steps) window.clearInterval(id);
      }, 50);
    } catch {
      /* ignore */
    }
  }

  private env(start: number, attack: number, dur: number): GainNode {
    const ctx = this.ctx as AudioContext;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(start, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
    g.connect(this.master as GainNode);
    return g;
  }
  drop(): void {
    if (this.playMp3("sfx-drop.mp3")) return;
    if (this.muted) return; this.ensure();
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(420, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.18);
    const g = this.env(0.25, 0.005, 0.18);
    o.connect(g); o.start(); o.stop(ctx.currentTime + 0.22);
  }
  pop(pitch = 1): void {
    if (this.playMp3("sfx-pop.mp3", pitch, 25)) return;
    if (this.muted) return; this.ensure();
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = "triangle";
    const base = 880 * pitch;
    o.frequency.setValueAtTime(base, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(base * 1.6, ctx.currentTime + 0.08);
    const g = this.env(0.30, 0.003, 0.12);
    o.connect(g); o.start(); o.stop(ctx.currentTime + 0.14);
  }
  chime(): void {
    if (this.playMp3("sfx-chime.mp3")) return;
    if (this.muted) return; this.ensure();
    const ctx = this.ctx as AudioContext;
    [880, 1100, 1320, 1760].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = this.env(0.18, 0.01, 0.45);
      o.connect(g);
      o.start(ctx.currentTime + i * 0.07);
      o.stop(ctx.currentTime + 0.55 + i * 0.07);
    });
  }
  bomb(): void {
    if (this.playMp3("sfx-bomb.mp3")) return;
    if (this.muted) return; this.ensure();
    const ctx = this.ctx as AudioContext;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.8);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    const g = this.env(0.55, 0.001, 0.4);
    src.connect(filter).connect(g);
    src.start();
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.35);
    const g2 = this.env(0.4, 0.005, 0.35);
    o.connect(g2); o.start(); o.stop(ctx.currentTime + 0.4);
  }
  fanfare(): void {
    if (this.playMp3("sfx-fanfare.mp3")) return;
    if (this.muted) return; this.ensure();
    const ctx = this.ctx as AudioContext;
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const g = this.env(0.18, 0.01, 0.3);
      o.connect(g);
      o.start(ctx.currentTime + i * 0.08);
      o.stop(ctx.currentTime + 0.4 + i * 0.08);
    });
  }
  // Reel-spin whoosh — only available with MP3, no synth equivalent.
  spin(): void {
    this.playMp3("sfx-spin.mp3");
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
  // Wire MP3 SFX + BGM (merged from V2). If cfg.assets is missing audio,
  // every method falls back to its Web Audio synthesis.
  audio.setAssets(cfg.assets);

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
    const popScale = 1.5 + Math.min(0.5, chain * 0.10);
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
            // Unique per-symbol explosion (top-tier) or fallback juice burst.
            explodeSymbol(cell.sym!.id, node.x, node.y, cell.sym!.fallbackColor);
            promises.push(new Promise<void>((resolve) => {
              // Anticipation pop — small grow, hold a moment, then shrink-fade.
              gsap.to(sym.scale, { x: popScale, y: popScale, duration: 0.22, ease: "back.out(2)" });
              gsap.to(sym, { rotation: (Math.random() - 0.5) * 0.6, duration: 0.25, ease: "sine.inOut" });
              gsap.to(sym, {
                alpha: 0, duration: 0.35, delay: 0.22, ease: "power2.in",
                onComplete: () => resolve(),
              });
              gsap.to(sym.scale, { x: 0, y: 0, duration: 0.35, delay: 0.22, ease: "power2.in" });
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
  // Coins pour from a focal point (defaults to viewport center). For the
  // endcard we pass the window center + a tight horizontal spread so coins
  // visibly emerge FROM the frame opening — they go up a bit, then rain down.
  function coinShower(count = 40, opts?: { cx?: number; cy?: number; spreadX?: number; spreadY?: number; rainTopY?: number }): void {
    const w = app.screen.width, h = app.screen.height;
    const cx = opts?.cx ?? w / 2;
    const cy = opts?.cy ?? h / 2;
    const spreadX = opts?.spreadX ?? 100;
    const spreadY = opts?.spreadY ?? 40;
    const rainEndY = opts?.rainTopY != null ? opts.rainTopY + h * 0.5 : h + 30;
    const coinTex = tex(COIN_ASSET);
    for (let i = 0; i < count; i++) {
      let node: Container;
      if (coinTex) {
        const sp = new Sprite(coinTex);
        sp.anchor.set(0.5);
        const size = 22 + Math.random() * 18;
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
      const startX = cx + (Math.random() - 0.5) * spreadX;
      const startY = cy + (Math.random() - 0.5) * spreadY;
      node.position.set(startX, startY);
      node.alpha = 0;
      fxLayer.addChild(node);
      // Velocity: predominantly downward with light side drift — coins
      // pour out of the window opening, not blasted everywhere.
      const sideDrift = (Math.random() - 0.5) * 80;
      const liftPower = 30 + Math.random() * 50;       // small initial lift
      const apexX = startX + sideDrift * 0.4;
      const apexY = startY - liftPower;
      const dur = 1.2 + Math.random() * 1.0;
      gsap.to(node, { alpha: 1, duration: 0.12 });
      gsap.to(node, { x: apexX, duration: dur * 0.45, ease: "power2.out" });
      gsap.to(node, {
        y: apexY, duration: dur * 0.35, ease: "power2.out",
        onComplete: () => {
          gsap.to(node, {
            x: apexX + sideDrift * 0.6,
            y: rainEndY, duration: dur * 0.65, ease: "power2.in",
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

  // ── BIG win-number flyout (let the player SAVOR the win) ──────────────────
  // Replaces the small "+150" floater for symbol-group wins. Number flies in
  // an arc, settles at peak, holds for ~900ms, then drifts up + fades.
  function winNumberFlyout(x: number, y: number, value: number, baseColor: number): void {
    const text = `+${value.toLocaleString("uk-UA")}`;
    // Size scales with payout — bigger wins feel bigger.
    const size = Math.min(64, 26 + Math.floor(Math.log10(value + 1) * 8));
    const t = new Text({
      text,
      style: {
        fill: 0xffd84d,
        fontFamily: FONT_DISPLAY,
        fontWeight: "900",
        fontSize: size,
        stroke: { color: 0x3a0e00, width: 4, alpha: 0.9 },
        dropShadow: { color: 0x000000, blur: 6, distance: 4, alpha: 0.8, angle: Math.PI / 2 },
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.scale.set(0);
    t.alpha = 0;
    fxLayer.addChild(t);
    // 1) Pop-in with overshoot (250ms)
    gsap.to(t, { alpha: 1, duration: 0.18 });
    gsap.to(t.scale, { x: 1.25, y: 1.25, duration: 0.28, ease: "back.out(2.4)",
      onComplete: () => gsap.to(t.scale, { x: 1.0, y: 1.0, duration: 0.18, ease: "sine.out" }),
    });
    // 2) Arc trajectory: rise to apex, gently curve sideways, then HOLD.
    const sideDrift = (Math.random() - 0.5) * 50;
    const apexY = y - 70;
    gsap.to(t, { y: apexY, duration: 0.55, ease: "power2.out" });
    gsap.to(t, { x: x + sideDrift, duration: 1.4, ease: "sine.inOut" });
    // 3) Color throb — pull eye toward number
    gsap.to(t, {
      pixi: { tint: 0xffffff }, duration: 0.4, yoyo: true, repeat: 2, ease: "sine.inOut",
      onUpdate: () => { void baseColor; },
    });
    // 4) Slow ascent + fade after hold (total ~1.8s lifetime)
    gsap.to(t, {
      y: apexY - 70, duration: 1.1, delay: 0.7, ease: "sine.out",
    });
    gsap.to(t, {
      alpha: 0, duration: 0.5, delay: 1.3, ease: "power2.in",
      onComplete: () => t.destroy(),
    });
  }

  // ── Per-symbol unique explosion variants (high-tier symbols only) ─────────
  // Grape: bursts into 7 small purple balls flying outward with gravity.
  function explodeGrape(x: number, y: number): void {
    const n = 7;
    const baseR = Math.min(cellW, cellH) * 0.18;
    for (let i = 0; i < n; i++) {
      const ball = new Graphics()
        .circle(0, 0, baseR * (0.7 + Math.random() * 0.4))
        .fill({ color: 0x9b4dff })
        .circle(-baseR * 0.18, -baseR * 0.20, baseR * 0.25)
        .fill({ color: 0xc99cff, alpha: 0.8 });
      ball.position.set(x, y);
      fxLayer.addChild(ball);
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const power = 60 + Math.random() * 60;
      const tx = x + Math.cos(angle) * power;
      const ty = y + Math.sin(angle) * power;
      const land = y + 80 + Math.random() * 40;
      gsap.to(ball, { x: tx, duration: 0.7, ease: "power2.out" });
      gsap.to(ball, { y: ty, duration: 0.35, ease: "power2.out",
        onComplete: () => gsap.to(ball, { y: land, duration: 0.5, ease: "bounce.out" }) });
      gsap.to(ball, { alpha: 0, duration: 0.4, delay: 0.5, ease: "power2.in",
        onComplete: () => ball.destroy() });
      gsap.to(ball, { rotation: (Math.random() - 0.5) * Math.PI * 2, duration: 0.85, ease: "none" });
    }
  }

  // Watermelon: splits into 3 triangular wedges that scatter and rotate.
  function explodeWatermelon(x: number, y: number): void {
    const r = Math.min(cellW, cellH) * 0.38;
    for (let i = 0; i < 3; i++) {
      const piece = new Graphics();
      piece.moveTo(0, 0).lineTo(-r * 0.6, r * 0.95).lineTo(r * 0.6, r * 0.95).closePath()
        .fill({ color: 0xff5a7a });
      piece.moveTo(-r * 0.6, r * 0.95).lineTo(r * 0.6, r * 0.95).lineTo(r * 0.65, r * 1.1).lineTo(-r * 0.65, r * 1.1).closePath()
        .fill({ color: 0x3da64a });
      for (const [sx, sy] of [[-0.2, 0.5], [0.0, 0.65], [0.2, 0.5]] as [number, number][]) {
        piece.ellipse(sx * r, sy * r, r * 0.07, r * 0.10).fill({ color: 0x2a0a1a });
      }
      piece.position.set(x, y);
      piece.rotation = (i / 3) * Math.PI * 2 + Math.random() * 0.3;
      fxLayer.addChild(piece);
      const angle = (i / 3) * Math.PI * 2 + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
      const dist = 70 + Math.random() * 40;
      const tx = x + Math.cos(angle) * dist;
      const tyPeak = y + Math.sin(angle) * dist - 30;
      const tyLand = y + 90 + Math.random() * 40;
      gsap.to(piece, { x: tx, duration: 0.85, ease: "power2.out" });
      gsap.to(piece, { y: tyPeak, duration: 0.35, ease: "power2.out",
        onComplete: () => gsap.to(piece, { y: tyLand, duration: 0.55, ease: "bounce.out" }) });
      gsap.to(piece, { rotation: piece.rotation + (Math.random() - 0.5) * 6, duration: 0.9, ease: "none" });
      gsap.to(piece, { alpha: 0, duration: 0.4, delay: 0.55, ease: "power2.in",
        onComplete: () => piece.destroy() });
    }
  }

  // Apple: cracks into 2 halves with white flesh interior, flying apart.
  function explodeApple(x: number, y: number): void {
    const r = Math.min(cellW, cellH) * 0.38;
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1;
      const half = new Graphics();
      // Red outer
      half.moveTo(0, -r * 0.7)
        .bezierCurveTo(sign * r * 0.9, -r * 0.4, sign * r * 0.9, r * 0.6, 0, r * 0.7)
        .closePath()
        .fill({ color: 0xff4d2a });
      // White flesh on the cut side
      half.moveTo(0, -r * 0.7)
        .bezierCurveTo(sign * r * 0.15, -r * 0.3, sign * r * 0.15, r * 0.3, 0, r * 0.7)
        .closePath()
        .fill({ color: 0xfff5e0 });
      // Tiny seed
      half.ellipse(sign * r * 0.07, 0, r * 0.05, r * 0.10).fill({ color: 0x2a0a0a });
      half.position.set(x, y);
      fxLayer.addChild(half);
      const tx = x + sign * (70 + Math.random() * 30);
      const tyPeak = y - 30 - Math.random() * 20;
      const tyLand = y + 100;
      gsap.to(half, { x: tx, duration: 0.9, ease: "power2.out" });
      gsap.to(half, { y: tyPeak, duration: 0.35, ease: "power2.out",
        onComplete: () => gsap.to(half, { y: tyLand, duration: 0.5, ease: "bounce.out" }) });
      gsap.to(half, { rotation: sign * Math.PI * 1.5, duration: 0.9, ease: "none" });
      gsap.to(half, { alpha: 0, duration: 0.4, delay: 0.5, ease: "power2.in",
        onComplete: () => half.destroy() });
    }
  }

  // Blueberry: splatters juice (8 small droplets) in all directions.
  function explodeBlueberry(x: number, y: number): void {
    for (let i = 0; i < 9; i++) {
      const d = new Graphics()
        .circle(0, 0, 5 + Math.random() * 4)
        .fill({ color: i % 2 ? 0x4d6fff : 0x224488 });
      d.position.set(x, y);
      fxLayer.addChild(d);
      const angle = Math.random() * Math.PI * 2;
      const power = 50 + Math.random() * 80;
      gsap.to(d, { x: x + Math.cos(angle) * power, y: y + Math.sin(angle) * power,
        duration: 0.7, ease: "power2.out" });
      gsap.to(d, { alpha: 0, duration: 0.5, delay: 0.3, onComplete: () => d.destroy() });
    }
  }

  // Dispatch table — high-tier symbols get unique explosions; rest fall back
  // to the generic juice-drop burst.
  function explodeSymbol(id: string, x: number, y: number, fallbackColor: number): void {
    if (id === "grape") explodeGrape(x, y);
    else if (id === "watermelon") explodeWatermelon(x, y);
    else if (id === "blueberry") explodeBlueberry(x, y);
    else if (id === "apple") explodeApple(x, y);
    else spawnBurst(x, y, fallbackColor);
  }

  // Tumble: survivors keep their original tile (no animation). Only cells that
  // actually FELL (because something below them popped) animate downward into
  // their new resting row. Empty top slots get NEW cells that drop in from
  // above the viewport. This eliminates the "everything shuffles" jerkiness.
  async function tumble(): Promise<void> {
    const drops: Promise<void>[] = [];
    for (let col = 0; col < COLS; col++) {
      // Collect survivors in TOP-DOWN order, remembering their old rows.
      const survivors: { oldR: number; cell: Cell }[] = [];
      for (let r = 0; r < ROWS; r++) {
        if (board[r][col]) survivors.push({ oldR: r, cell: board[r][col]! });
      }
      // Build new column from bottom up: survivors land at the bottom,
      // new cells fill remaining top slots.
      const newCol: (Cell | null)[] = new Array(ROWS).fill(null);
      const isNew: boolean[] = new Array(ROWS).fill(false);
      for (let i = 0; i < survivors.length; i++) {
        const newR = ROWS - survivors.length + i;
        newCol[newR] = survivors[i].cell;
      }
      // newR before survivors[0]'s position is "freshly spawned"
      const firstSurvivorRow = ROWS - survivors.length;
      for (let r = 0; r < firstSurvivorRow; r++) {
        newCol[r] = newCell({ allowScatter: true, allowBomb: freeSpins === 0 });
        isNew[r] = true;
      }
      // Apply new state for this column.
      for (let r = 0; r < ROWS; r++) board[r][col] = newCol[r];

      // Compute per-row movement so we can animate the correct delta.
      const moveDelta: Record<number, number> = {};
      survivors.forEach((s, i) => {
        const newR = ROWS - survivors.length + i;
        const delta = newR - s.oldR;        // 0 = stayed, >0 = fell
        moveDelta[newR] = delta;
      });

      // Repaint and animate.
      for (let r = 0; r < ROWS; r++) {
        repaintCell(r, col);
        const node = cellNodes[r][col];
        const sym = node.children[1] as Container | undefined;
        if (!sym) continue;
        if (isNew[r]) {
          // Brand new cell — drops in from above the viewport.
          const offset = -((firstSurvivorRow - r) + 1) * cellH;
          sym.y = offset;
          sym.alpha = 0;
          sym.scale.y = 1.3;
          drops.push(new Promise<void>((resolve) => {
            gsap.to(sym, {
              y: 0, alpha: 1, duration: TUMBLE_DUR, ease: "bounce.out",
              delay: col * 0.025 + r * 0.025,
              onComplete: () => resolve(),
            });
            gsap.to(sym.scale, { y: 1, duration: TUMBLE_DUR * 0.7, ease: "power2.out", delay: col * 0.025 + r * 0.025 });
          }));
        } else {
          const delta = moveDelta[r] ?? 0;
          if (delta > 0) {
            // Survivor that fell — animate from old position to new.
            sym.y = -delta * cellH;
            sym.alpha = 1;
            sym.scale.set(1);
            drops.push(new Promise<void>((resolve) => {
              gsap.to(sym, {
                y: 0, duration: TUMBLE_DUR * 0.85, ease: "bounce.out",
                delay: col * 0.025,
                onComplete: () => resolve(),
              });
            }));
          } else {
            // Survivor that didn't move — keep at rest, no animation.
            sym.y = 0;
            sym.alpha = 1;
            sym.scale.set(1);
          }
        }
      }
    }
    audio.drop();
    await Promise.all(drops);
  }

  // Spin reel: every SPIN now uses the intro-drop pattern — column by column
  // staggered with bounce. Replaces the entire board (each spin is a fresh
  // round in slot terms) but the VISUAL feels like the onboarding intro.
  async function spinReel(): Promise<void> {
    audio.spin();
    const blockBombsOnNewSpin = freeSpins === 0;
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        board[r][col] = newCell({ allowScatter: true, allowBomb: blockBombsOnNewSpin });
      }
    }
    const drops: Promise<void>[] = [];
    // Column-by-column stagger (matches intro). 80ms between columns + 30ms
    // between rows within a column for a soft "waterfall" feel.
    for (let col = 0; col < COLS; col++) {
      for (let r = 0; r < ROWS; r++) {
        repaintCell(r, col);
        const node = cellNodes[r][col];
        const sym = node.children[1] as Container | undefined;
        if (!sym) continue;
        sym.y = -((ROWS - r) + 1) * cellH;
        sym.alpha = 0;
        sym.scale.y = 1.4;
        const cellDelay = col * 0.08 + r * 0.03;
        drops.push(new Promise<void>((resolve) => {
          gsap.to(sym, {
            y: 0, alpha: 1, duration: SPIN_REEL_DUR, ease: "bounce.out",
            delay: cellDelay,
            onComplete: () => resolve(),
          });
          gsap.to(sym.scale, { y: 1, duration: SPIN_REEL_DUR * 0.7, ease: "power2.out", delay: cellDelay });
        }));
      }
      // Soft per-column landing tick.
      setTimeout(() => audio.pop(0.55 + col * 0.05), col * 90 + 240);
    }
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
  const ctaWindow = new Graphics();                // dark panel inside frame cutout
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
  // Order matters: scrim → fallback bg → DARK WINDOW (closes the frame cutout)
  // → AI frame border → crown → text content → button.
  ctaPanel.addChild(ctaBg, ctaWindow, ctaFrameSprite, ctaCrownSprite, ctaTitle, ctaScore, ctaSub, ctaBtn);
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

    // ── DARK WINDOW INSIDE THE FRAME CUTOUT ──────────────────────────────────
    // The AI frame asset has a transparent center — without this fill, the
    // game board behind would show through. Build a dark panel sized to fit
    // INSIDE the gold ornament. Approximate inner cutout: 60% wide × 64% tall
    // of the frame display, slightly offset down (the AI top ribbon area
    // occupies a few percent at the top).
    const winW = frameDisplayW * 0.60;
    const winH = frameDisplayH * 0.66;
    const winYOff = frameDisplayH * 0.02;       // slight vertical bias down
    const winLeft = -winW / 2;
    const winTop = -winH / 2 + winYOff;
    ctaWindow.clear();
    // Inner gradient: deep purple at top to slightly warmer purple bottom.
    const gradSteps = 16;
    for (let i = 0; i < gradSteps; i++) {
      const t = i / (gradSteps - 1);
      const col = mix(0x180228, 0x3a0e44, t);
      ctaWindow.rect(winLeft, winTop + (winH * i) / gradSteps, winW, winH / gradSteps + 1)
        .fill({ color: col });
    }
    // Subtle inner border + soft glow on the inside edge of the gold.
    ctaWindow.roundRect(winLeft, winTop, winW, winH, 8)
      .stroke({ color: 0x000000, width: 3, alpha: 0.55 });

    // ── CONTENT POSITIONED INSIDE THE WINDOW ─────────────────────────────────
    // All text lives WITHIN winTop..winTop+winH (the dark panel), nothing on
    // the gold ornament or the crown ribbon.
    ctaTitle.y = winTop + winH * 0.12;   // top of dark window
    ctaScore.y = winTop + winH * 0.42;   // upper-middle (dominant element)
    ctaSub.y = winTop + winH * 0.65;     // lower-middle
    ctaBtn.y = winTop + winH * 0.88;     // anchored inside bottom of window

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
    // Coins POUR from inside the window — spawn at window center with the
    // window's bounds as spread. Rain ends at viewport bottom.
    const winCenterX = w / 2;
    const winCenterY = h / 2 + winYOff;
    const coinOpts = {
      cx: winCenterX,
      cy: winCenterY,
      spreadX: winW * 0.7,
      spreadY: winH * 0.3,
      rainTopY: h - 30,
    };
    coinShower(40, coinOpts);
    // Continuous slow rain of coins from the window
    const coinInterval = setInterval(() => {
      if (!cta.visible) { clearInterval(coinInterval); return; }
      coinShower(6, coinOpts);
    }, 900);
    void coinInterval;
  }

  // ── Main spin loop ──────────────────────────────────────────────────────────
  async function doSpin(): Promise<void> {
    if (spinning) return;
    spinning = true;
    spinBtn.alpha = 0.6;
    showCombo(1);

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
      // BIG win-number flyouts — let the player savor each one with arc + hold.
      for (const w of wins) {
        outer:
        for (let r = 0; r < ROWS; r++) {
          for (let col = 0; col < COLS; col++) {
            const cell = board[r][col];
            if (cell && cell.kind === "sym" && cell.sym!.id === w.sym.id) {
              const node = cellNodes[r][col];
              winNumberFlyout(node.x, node.y, w.payout, w.sym.fallbackColor);
              break outer;
            }
          }
        }
        spinWin += w.payout;
      }
      // Beat — give the number a moment to land before the explosion.
      await sleep(250);
      await popWinningNodes(ids, chain);
      // Chain-escalation effects (Sprint C1).
      if (chain >= 3) setBoardGlow(true, Math.min(1, 0.6 + chain * 0.1));
      if (chain >= 5) {
        slowMo(0.5, 0.4);
        audio.chime();
      }
      // Hold — let the explosions and number register before tumble.
      await sleep(420);
      await tumble();
      // Between-cascade beat — savor pause before the next round resolves.
      await sleep(280);
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
        // Announcement beat — chime + 350ms pause so the player notices the
        // mode change BEFORE bombs start firing. Avoids "instant explosion" feel.
        audio.chime();
        await sleep(350);
        let runningSum = 0;
        showTally("×0", false);
        for (let i = 0; i < bombs.length; i++) {
          const b = bombs[i];
          runningSum += b.mult;
          const node = cellNodes[b.r][b.col];
          const sym = node.children[1] as Container | undefined;
          // ── CHARGE-UP phase (200ms): bomb wobbles, scales down, then snaps ──
          // up before the big boom. This sells the explosion as "intentional".
          if (sym) {
            gsap.to(sym.scale, { x: 0.85, y: 1.15, duration: 0.08, ease: "power2.in" });
            gsap.to(sym.scale, { x: 1.15, y: 0.85, duration: 0.08, delay: 0.08, ease: "power2.in" });
            gsap.to(sym.scale, { x: 1.6 + i * 0.15, y: 1.6 + i * 0.15, duration: 0.10, delay: 0.18, ease: "back.out(2.4)" });
            // Tiny per-bomb shake
            gsap.to(sym, { x: (Math.random() - 0.5) * 5, duration: 0.04, yoyo: true, repeat: 5, ease: "none" });
          }
          // Charging tick (low pitch)
          audio.pop(0.45);
          await sleep(200);
          // ── DETONATION ────────────────────────────────────────────────────
          shockwave(node.x, node.y);
          // Extra inner flash for a "bigger boom" feel
          const innerR = Math.min(cellW, cellH) * 1.2;
          const flash = new Graphics()
            .circle(0, 0, innerR)
            .fill({ color: 0xffe680, alpha: 0.95 });
          flash.position.set(node.x, node.y);
          fxLayer.addChild(flash);
          gsap.to(flash.scale, { x: 2.4, y: 2.4, duration: 0.45, ease: "power3.out" });
          gsap.to(flash, { alpha: 0, duration: 0.45, ease: "power2.out",
            onComplete: () => flash.destroy() });
          // Radial debris (16 black sparks)
          for (let s = 0; s < 16; s++) {
            const angle = (s / 16) * Math.PI * 2 + Math.random() * 0.3;
            const dist = 60 + Math.random() * 80;
            const spark = new Graphics()
              .circle(0, 0, 3 + Math.random() * 3)
              .fill({ color: s % 2 ? 0xffd84d : 0x1a1a1a });
            spark.position.set(node.x, node.y);
            fxLayer.addChild(spark);
            gsap.to(spark, {
              x: node.x + Math.cos(angle) * dist,
              y: node.y + Math.sin(angle) * dist + 20,
              alpha: 0, duration: 0.7, ease: "power2.out",
              onComplete: () => spark.destroy(),
            });
          }
          // Ground crater (briefly visible at impact)
          const crater = new Graphics()
            .ellipse(0, 0, cellW * 0.55, cellH * 0.18)
            .fill({ color: 0x000000, alpha: 0.55 });
          crater.position.set(node.x, node.y + cellH * 0.3);
          fxLayer.addChild(crater);
          gsap.to(crater, {
            alpha: 0, duration: 0.6, delay: 0.25, ease: "power2.out",
            onComplete: () => crater.destroy(),
          });
          // Big multiplier text flying up
          floatText(node.x, node.y - 12, `×${b.mult}`, 0xffd84d, 30 + Math.min(28, i * 5));
          // Bomb sprite vanishes
          if (sym) {
            gsap.to(sym, { alpha: 0, duration: 0.22, ease: "power2.in" });
            gsap.to(sym.scale, { x: 0, y: 0, duration: 0.22, ease: "power2.in" });
          }
          // Escalating shake + audio
          screenShake(10 + i * 3, 0.35);
          audio.bomb();
          // Update running tally
          showTally(`×${runningSum}`, i === bombs.length - 1);
          if (freeSpins === 0) board[b.r][b.col] = null;
          // Sprint B3: slow-mo on the FINAL ignition.
          if (i === bombs.length - 1) {
            slowMo(0.4, 0.6);
            audio.fanfare();
          }
          // Stagger between explosions — longer than before for savor.
          await sleep(280 + i * 50);
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
    audio.startBgm(); // first user gesture → start ambient loop
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
    if (e.code === "Space") { e.preventDefault(); audio.startBgm(); doSpin(); }
    if (e.code === "KeyM") { audio.setMuted(!audio.muted); muteIcon.text = audio.muted ? "✕" : "♪"; }
  });
  // Mute button also serves as a "user gesture" for BGM start.
  muteBtn.on("pointerdown", () => audio.startBgm());

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

  // ── Intro drop animation ────────────────────────────────────────────────────
  // On first paint, all symbols are at their final positions instantly.
  // For visual onboarding, animate them dropping in column-by-column with
  // a slight stagger — same gravity feel as the reel-drop, but slower and
  // with a deliberate beat between columns so the player reads "this is the
  // board". Mirrors the tumble pattern so onboarding is consistent with play.
  void (async () => {
    // Hide all symbols and offset them upward, ready to drop.
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const node = cellNodes[r]?.[col];
        const sym = node?.children[1] as Container | undefined;
        if (sym) {
          sym.y = -((ROWS - r) + 2) * cellH;
          sym.alpha = 0;
          sym.scale.y = 1.5;
        }
      }
    }
    // Wait a tick so the user sees the empty board before symbols fall in.
    await new Promise<void>(res => setTimeout(res, 200));
    audio.drop();
    // Drop column by column, each column drops top→bottom internally.
    for (let col = 0; col < COLS; col++) {
      for (let r = 0; r < ROWS; r++) {
        const node = cellNodes[r]?.[col];
        const sym = node?.children[1] as Container | undefined;
        if (!sym) continue;
        const cellDelay = col * 0.10 + r * 0.04;
        gsap.to(sym, {
          y: 0, alpha: 1, duration: 0.65, ease: "bounce.out", delay: cellDelay,
        });
        gsap.to(sym.scale, { y: 1, duration: 0.5, ease: "power2.out", delay: cellDelay });
      }
      // Soft tick sound per column landing
      setTimeout(() => audio.pop(0.6 + col * 0.05), col * 100 + 250);
    }
  })();
}

void main();
