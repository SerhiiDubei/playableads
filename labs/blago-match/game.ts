import { Application, Container } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";
import { buildEndcard } from "../../src/assetgen/kit/ui.js"; // game-UI набір (гілка B) — НЕ малюй UI сам

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;
declare global { interface Window { FbPlayableAd: { onCTAClick: () => void } } }

async function main(): Promise<void> {
  if (!window.FbPlayableAd) window.FbPlayableAd = { onCTAClick: () => {} };
  void (() => window.FbPlayableAd.onCTAClick); // validator anchor

  const app = new Application();
  await app.init({ width: window.innerWidth, height: window.innerHeight, background: 0x101820, antialias: true });
  app.canvas.style.touchAction = "none";
  document.body.appendChild(app.canvas);

  // TODO(blago-match): build the mechanic here (станція 5). Keep UI in the game-UI kit.
  void Container; void gsap; void cfg;

  // Endcard is WIRED to the official game-UI kit — do NOT draw your own.
  function endGame(): void {
    buildEndcard({
      brand: "Brand Name",
      avoided: 1,
      total: 1,
      headline: cfg.copy?.title ?? "Result",
      subline: "TODO: result line.",
      ctaText: cfg.copy?.cta ?? "Learn more",
      trustText: "TODO trust line",
      onCta: () => window.FbPlayableAd.onCTAClick(),
    });
  }
  void endGame; // call when the game ends
}
void main();
