import type { Layout } from "./types.js";
import { resolveLayout, zone, zonesOverlay } from "../kit/layout.js";

/**
 * Tap-to-reveal — mini-game: тапни героя 5 разів → reward з install CTA.
 * Найвища CTR (5-10%) бо engagement → install природне.
 *
 * Zone-driven:архетип `immersive` (великий hero у stage). counter → title,
 * hero+prompt → stage, CTA → actions. pageCss — лише візуал.
 */
const L = resolveLayout("immersive");

export const tapReveal: Layout = {
  id: "tap-reveal",
  name: "Tap-to-reveal mini-game",
  description: "Тапни 5 разів героя → reward з install CTA. Найвища CTR (5-10%) серед playable форматів.",
  meta: {
    screenIds: ["tap", "reward"],
    hasCta: true,
    primaryCtaTexts: ["Collect & Play", "Play Free"],
    maxHeroPx: 320,
    zoneTypes: { tap: "immersive", reward: "immersive" },
  },

  pageCss: () => `
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .counter{color:#ffe9b0;font-weight:700;font-size:30px;text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .counter small{color:#d8c49a;font-size:14px;font-weight:400;margin-left:4px}
    .hero-tap{height:230px;max-width:100%;object-fit:contain;filter:drop-shadow(0 8px 12px #0009);
      cursor:pointer;animation:hover 2.4s ease-in-out infinite}
    @keyframes hover{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    .hero-tap:active{transform:scale(.95);transition:transform .1s}
    .tap-prompt{color:#ffe9b0;font-weight:700;font-size:26px;letter-spacing:2px;
      text-shadow:0 0 18px #ffe9b0;animation:pulse 1.2s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:0.6;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}
    .tagline{color:#d8c49a;font-size:13px;text-align:center}
    .hero-reward{height:210px;max-width:100%;object-fit:contain;
      filter:drop-shadow(0 0 30px #ffe9b0aa) drop-shadow(0 8px 12px #0009);animation:bob 2.6s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-10px) rotate(2deg)}}
    .reward-title{color:#ffe9b0;font-weight:700;font-size:26px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 24px #ffd54a}
    .reward-sub{color:#d8c49a;font-size:14px;text-align:center;max-width:300px}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    return `
    <section class="screen active" id="tap" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("title", `<div class="counter"><span id="cnt">0</span><small>/ 5 taps</small></div>`)}
      ${zone("stage", `
        <img class="hero-tap" src="${hero}" onclick="tapHero()">
        <div class="tap-prompt">TAP!</div>
        <div class="tagline">Tap the hero to wake them up</div>`)}
      ${zone("actions", k.button("Skip → Play Free", "cta()", { block: true }))}
    </section>

    <section class="screen" id="reward" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("title", `<div class="reward-title">You Won!</div>`)}
      ${zone("stage", `
        <img class="hero-reward" src="${hero}">
        <div class="reward-title">+100 Gold</div>
        <div class="reward-sub">Continue your adventure in the full game!</div>`)}
      ${zone("actions", k.button("Collect & Play", "cta()", { block: true, level: "primary" }))}
    </section>

    <script>
      var taps = 0;
      function tapHero() {
        taps++;
        var c = document.getElementById('cnt');
        if (c) c.textContent = taps;
        if (taps >= 5) setTimeout(function(){ go('reward'); }, 250);
      }
    </script>`;
  },
};
