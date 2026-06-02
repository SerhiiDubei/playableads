import type { Layout } from "./types.js";
import { resolveLayout, zone, zonesOverlay } from "../kit/layout.js";

/**
 * Match-cluster — 4×4 grid плиток, фейк-match через клік → reveal CTA.
 * Домінує в casual ринку (Match Factory, Royal Match): "I already play this".
 *
 * Zone-driven: board → `grid` (board у stage, CTA в actions),
 * reveal → `immersive` (великий hero). pageCss — лише візуал.
 */
const BOARD = resolveLayout("grid");
const REVEAL = resolveLayout("immersive");

export const matchCluster: Layout = {
  id: "match-cluster",
  name: "Match-3 cluster (mini)",
  description: "Візуальна 4×4 grid плиток + reveal CTA. Працює для match-3 genre (Match Factory, Royal Match).",
  meta: {
    screenIds: ["board", "reveal"],
    hasCta: true,
    primaryCtaTexts: ["Play Full Game", "Play Free"],
    maxHeroPx: 280,
    zoneTypes: { board: "grid", reveal: "immersive" },
  },

  pageCss: () => `
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .title{color:#ffe9b0;font-weight:700;font-size:20px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .grid-board{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:100%;max-width:260px}
    .tile{aspect-ratio:1;background:rgba(20,12,4,0.85);border:2px solid #c9962f;border-radius:10px;
      display:flex;align-items:center;justify-content:center;font-size:28px;cursor:pointer;
      transition:transform .15s ease,opacity .25s ease}
    .tile:active{transform:scale(.92)}
    .tile.matched{opacity:0;transform:scale(.4) rotate(180deg);pointer-events:none}
    .prompt{color:#ffe9b0;font-weight:700;font-size:16px;letter-spacing:2px;
      text-shadow:0 0 14px #ffe9b0;animation:pulse 1.2s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:0.6}50%{opacity:1}}
    .hero-reveal{height:196px;max-width:100%;object-fit:contain;
      filter:drop-shadow(0 0 32px #ffe9b099) drop-shadow(0 8px 12px #0009);animation:bob 2.6s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    .reveal-title{color:#ffe9b0;font-weight:700;font-size:24px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 22px #ffd54a}
    .reveal-sub{color:#d8c49a;font-size:13px;text-align:center;max-width:300px}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    const tiles = ["⭐", "💎", "🟦", "🟪", "⭐", "🟦", "🟪", "💎", "💎", "⭐", "🟦", "⭐", "🟪", "💎", "⭐", "🟦"];
    const board = tiles
      .map((sym, i) => `<div class="tile" data-sym="${sym}" data-i="${i}" onclick="matchTile(${i})">${sym}</div>`)
      .join("");
    return `
    <section class="screen active" id="board" data-type="grid">
      ${zonesOverlay(BOARD)}
      ${zone("title", `<div class="title">Match 3!</div>`)}
      ${zone("stage", `
        <div class="grid-board">${board}</div>
        <div class="prompt">TAP A GEM</div>`)}
      ${zone("actions", k.button("Skip → Play Full Game", "cta()", { block: true }))}
    </section>

    <section class="screen" id="reveal" data-type="immersive">
      ${zonesOverlay(REVEAL)}
      ${zone("title", `<div class="title">Match Master!</div>`)}
      ${zone("stage", `
        <img class="hero-reveal" src="${hero}">
        <div class="reveal-title">Hundreds of Levels Await</div>
        <div class="reveal-sub">Become the match-3 champion. Install free.</div>`)}
      ${zone("actions", k.button("Play Full Game", "cta()", { block: true, level: "primary" }))}
    </section>

    <script>
      var matches = 0;
      function matchTile(i) {
        var tile = document.querySelector('[data-i="' + i + '"]');
        if (!tile || tile.classList.contains('matched')) return;
        var sym = tile.dataset.sym;
        var siblings = [...document.querySelectorAll('[data-sym="' + sym + '"]:not(.matched)')].slice(0, 3);
        siblings.forEach(function(s){ s.classList.add('matched'); });
        matches++;
        if (matches >= 2) setTimeout(function(){ go('reveal'); }, 600);
      }
    </script>`;
  },
};
