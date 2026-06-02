import type { Layout } from "./types.js";

/**
 * Match-cluster — візуальний 4×5 grid плиток, фейк-match через клік.
 *
 * 2 екрани:
 *   board   — banner "Match 3!", grid плиток (з emoji symbol), "TAP TO MATCH" prompt
 *             onclick на плитку прибирає її і сусідів того ж кольору
 *   reveal  — banner "Match Master!", герой з glow + CTA "Play Full Game"
 *
 * Цей паттерн домінує в casual ринку (Match Factory, Royal Match). Гравець
 * відчуває "I already play this" перед install — найвища конверсія в genre.
 */
export const matchCluster: Layout = {
  id: "match-cluster",
  name: "Match-3 cluster (mini)",
  description: "Візуальна 4×5 grid плиток + reveal CTA. Працює для match-3 genre (Match Factory, Royal Match).",
  meta: {
    screenIds: ["board", "reveal"],
    hasCta: true,
    primaryCtaTexts: ["Play Full Game", "Play Free"],
    maxHeroPx: 280,
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
      padding:30px 24px 100px;opacity:0;visibility:hidden;
      transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .title{color:#ffe9b0;font-family:${font};font-weight:700;font-size:20px;text-align:center;
      margin-top:8px;text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .grid-board{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:16px;width:100%;max-width:280px}
    .tile{aspect-ratio:1;background:rgba(20,12,4,0.85);border:2px solid #c9962f;border-radius:10px;
      display:flex;align-items:center;justify-content:center;font-size:30px;cursor:pointer;
      transition:transform .15s ease,opacity .25s ease}
    .tile:active{transform:scale(.92)}
    .tile.matched{opacity:0;transform:scale(.4) rotate(180deg);pointer-events:none}
    .prompt{color:#ffe9b0;font-family:${font};font-weight:700;font-size:18px;letter-spacing:2px;
      margin-top:14px;text-shadow:0 0 14px #ffe9b0;animation:pulse 1.2s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:0.6}50%{opacity:1}}
    .hero-reveal{height:280px;filter:drop-shadow(0 0 32px #ffe9b099) drop-shadow(0 8px 12px #0009);
      margin-top:30px;animation:bob 2.6s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    .reveal-title{color:#ffe9b0;font-family:${font};font-weight:700;font-size:26px;text-align:center;
      margin-top:14px;text-shadow:0 2px 0 #3a2208,0 0 22px #ffd54a}
    .reveal-sub{color:#d8c49a;font-size:13px;text-align:center;margin-top:6px;max-width:300px}
    .cta-stack{position:absolute;left:24px;right:24px;bottom:20px;display:flex;flex-direction:column;gap:10px}
    #stage .c-banner{max-width:260px;margin-bottom:0}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    const tiles = ["⭐", "💎", "🟦", "🟪", "⭐", "🟦", "🟪", "💎", "💎", "⭐", "🟦", "⭐", "🟪", "💎", "⭐", "🟦"];
    const board = tiles
      .map((sym, i) => `<div class="tile" data-sym="${sym}" data-i="${i}" onclick="matchTile(${i})">${sym}</div>`)
      .join("");
    return `
    <section class="screen active" id="board">
      ${k.banner("Match 3!")}
      <div class="title">Tap to clear matching gems</div>
      <div class="grid-board">${board}</div>
      <div class="prompt">TAP A GEM</div>
      <div class="cta-stack">${k.button("Skip → Play Full Game", "cta()", { block: true })}</div>
    </section>

    <section class="screen" id="reveal">
      ${k.banner("Match Master!")}
      <img class="hero-reveal" src="${hero}">
      <div class="reveal-title">Hundreds of Levels Await</div>
      <div class="reveal-sub">Become the match-3 champion. Install free.</div>
      <div class="cta-stack">${k.button("Play Full Game", "cta()", { block: true })}</div>
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
