import type { Layout } from "./types.js";

/**
 * Tap-to-reveal — mini-game шаблон з лічильником.
 *
 * 2 екрани:
 *   tap     — герой у центрі, лічильник 0/5, "TAP!" pulse, тапаєш — інкремент
 *   reward  — банер "You Won!", герой з glow, CTA "Collect & Play"
 *
 * Логіка через onclick на герої — рахує тапи, після 5 переходить на reward.
 * Це найвища-конверсійна форма (5-10% CTR) бо engagement → install природне.
 *
 * Zones: hero в hero zone, банери в topbar zone (на reward), CTA в cta zone.
 */
export const tapReveal: Layout = {
  id: "tap-reveal",
  name: "Tap-to-reveal mini-game",
  description: "Тапни 5 разів героя → reward з install CTA. Найвища CTR (5-10%) серед playable форматів.",
  meta: {
    screenIds: ["tap", "reward"],
    hasCta: true,
    primaryCtaTexts: ["Collect & Play", "Play Free"],
    maxHeroPx: 320,
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
      padding:30px 24px 100px;opacity:0;visibility:hidden;
      transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .counter{position:absolute;top:30px;left:50%;transform:translateX(-50%);color:#ffe9b0;font-family:${font};
      font-weight:700;font-size:32px;text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .counter small{color:#d8c49a;font-size:14px;font-weight:400;margin-left:4px}
    .hero-tap{height:300px;filter:drop-shadow(0 8px 12px #0009);margin-top:120px;cursor:pointer;animation:hover 2.4s ease-in-out infinite}
    @keyframes hover{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    .hero-tap:active{transform:scale(.95);transition:transform .1s}
    .tap-prompt{color:#ffe9b0;font-family:${font};font-weight:700;font-size:28px;letter-spacing:2px;
      margin-top:18px;text-shadow:0 0 18px #ffe9b0;animation:pulse 1.2s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:0.6;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}
    .tagline{color:#d8c49a;font-size:13px;margin-top:8px;text-align:center}
    .hero-reward{height:280px;filter:drop-shadow(0 0 30px #ffe9b0aa) drop-shadow(0 8px 12px #0009);
      margin-top:40px;animation:bob 2.6s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-10px) rotate(2deg)}}
    .reward-title{color:#ffe9b0;font-family:${font};font-weight:700;font-size:30px;text-align:center;
      margin-top:16px;text-shadow:0 2px 0 #3a2208,0 0 24px #ffd54a}
    .reward-sub{color:#d8c49a;font-size:14px;text-align:center;margin-top:6px;max-width:300px}
    .cta-stack{position:absolute;left:24px;right:24px;bottom:20px;display:flex;flex-direction:column;gap:10px}
    #stage .c-banner{max-width:280px;margin-top:0}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    return `
    <section class="screen active" id="tap">
      <div class="counter"><span id="cnt">0</span><small>/ 5 taps</small></div>
      <img class="hero-tap" src="${hero}" onclick="tapHero()">
      <div class="tap-prompt">TAP!</div>
      <div class="tagline">Tap the hero to wake them up</div>
      <div class="cta-stack">${k.button("Skip → Play Free", "cta()", { block: true })}</div>
    </section>

    <section class="screen" id="reward">
      ${k.banner("You Won!")}
      <img class="hero-reward" src="${hero}">
      <div class="reward-title">+100 Gold</div>
      <div class="reward-sub">Continue your adventure in the full game!</div>
      <div class="cta-stack">${k.button("Collect & Play", "cta()", { block: true })}</div>
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
