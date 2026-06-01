import { Application, Container, Graphics, Text } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

// Injected at build time by esbuild `define` (see src/build/bundler.ts).
declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

const tapsToWin = Number(cfg.params.tapsToWin ?? 8);

function num(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: num(cfg.style.colors.background),
    antialias: true,
  });
  document.body.appendChild(app.canvas);

  const root = new Container();
  app.stage.addChild(root);

  // Title.
  const title = new Text({
    text: cfg.copy.title,
    style: {
      fill: cfg.style.colors.text,
      fontFamily: cfg.style.font.family,
      fontWeight: String(cfg.style.font.weight) as "bold",
      fontSize: 64,
      align: "center",
    },
  });
  title.anchor.set(0.5);
  root.addChild(title);

  // Progress counter.
  let taps = 0;
  const counter = new Text({
    text: `0 / ${tapsToWin}`,
    style: {
      fill: cfg.style.colors.accent,
      fontFamily: cfg.style.font.family,
      fontWeight: "bold",
      fontSize: 48,
    },
  });
  counter.anchor.set(0.5);
  root.addChild(counter);

  // The coin (a layered gold disc drawn in code).
  const coin = new Container();
  const disc = new Graphics()
    .circle(0, 0, 110)
    .fill({ color: cfg.style.colors.primary })
    .circle(0, 0, 92)
    .fill({ color: cfg.style.colors.accent });
  const star = new Text({
    text: "★",
    style: { fill: cfg.style.colors.primary, fontSize: 96, fontWeight: "bold" },
  });
  star.anchor.set(0.5);
  coin.addChild(disc, star);
  coin.eventMode = "static";
  coin.cursor = "pointer";
  root.addChild(coin);

  // CTA button (hidden until the goal is reached).
  const cta = new Container();
  const ctaBg = new Graphics()
    .roundRect(-180, -44, 360, 88, 44)
    .fill({ color: cfg.style.colors.accent });
  const ctaText = new Text({
    text: cfg.copy.cta,
    style: {
      fill: cfg.style.colors.background,
      fontFamily: cfg.style.font.family,
      fontWeight: "bold",
      fontSize: 40,
    },
  });
  ctaText.anchor.set(0.5);
  cta.addChild(ctaBg, ctaText);
  cta.visible = false;
  cta.eventMode = "static";
  cta.cursor = "pointer";
  cta.on("pointertap", () => {
    window.FbPlayableAd.onCTAClick();
  });
  root.addChild(cta);

  let won = false;
  coin.on("pointertap", () => {
    if (won) return;
    taps++;
    counter.text = `${taps} / ${tapsToWin}`;
    gsap.fromTo(
      coin.scale,
      { x: 1.18, y: 0.82 },
      { x: 1, y: 1, duration: 0.4, ease: "elastic.out(1, 0.4)" },
    );
    if (taps >= tapsToWin) win();
  });

  function win(): void {
    won = true;
    gsap.to(coin, { alpha: 0, duration: 0.3, onComplete: () => (coin.visible = false) });
    counter.visible = false;
    cta.visible = true;
    cta.scale.set(0);
    gsap.to(cta.scale, { x: 1, y: 1, duration: 0.6, ease: "back.out(1.6)" });
    gsap.to(cta, { y: cta.y - 6, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  function layout(): void {
    const w = app.screen.width;
    const h = app.screen.height;
    title.position.set(w / 2, h * 0.18);
    counter.position.set(w / 2, h * 0.32);
    coin.position.set(w / 2, h * 0.55);
    cta.position.set(w / 2, h * 0.55);
  }
  layout();
  window.addEventListener("resize", layout);
}

void main();
