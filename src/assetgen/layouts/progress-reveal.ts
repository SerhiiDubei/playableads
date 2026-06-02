import type { Layout } from "./types.js";

/**
 * Progress-reveal — анімований XP-бар і level-up.
 *
 * 2 екрани:
 *   xp        — герой + XP бар анімовано наповнюється + counter "+1250 XP"
 *   levelup   — банер "Level 8!", герой з glow, "new gear unlocked" + CTA
 *
 * Loss-aversion психологія: гравець вже отримав progress, "втратить його якщо
 * не install'не". Цей паттерн працює сильно у RPG/idle progression genre.
 */
export const progressReveal: Layout = {
  id: "progress-reveal",
  name: "Progress reveal (XP bar fill)",
  description: "XP-бар наповнюється + level-up + reward + CTA. Loss-aversion для RPG/idle progression.",
  meta: {
    screenIds: ["xp", "levelup"],
    hasCta: true,
    primaryCtaTexts: ["Claim Reward", "Play Free"],
    maxHeroPx: 320,
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
      padding:30px 24px 100px;opacity:0;visibility:hidden;
      transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .topbar{position:absolute;top:24px;left:24px;right:24px;display:flex;justify-content:space-between;align-items:center;z-index:5}
    .xp-gain{color:#ffe9b0;font-family:${font};font-weight:700;font-size:22px;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .level-badge{background:#c9962f;color:#1a0f04;padding:6px 14px;border-radius:14px;font-weight:700;font-size:14px;letter-spacing:1px}
    .hero-xp{height:280px;filter:drop-shadow(0 8px 12px #0009);margin-top:80px}
    .panel-wrap{width:340px;margin-top:24px;background:rgba(20,12,4,0.8);border:1px solid #c9962f55;border-radius:12px;padding:14px}
    .bar-label{display:flex;justify-content:space-between;color:#d8c49a;font-size:12px;margin-bottom:6px}
    .bar-outer{height:14px;background:#1a0f04;border-radius:7px;overflow:hidden;border:1px solid #c9962f33}
    .bar-fill{height:100%;background:linear-gradient(90deg,#c9962f,#ffe9b0);width:30%;border-radius:7px;
      animation:fillBar 2.5s ease-out forwards;box-shadow:0 0 10px #ffe9b099}
    @keyframes fillBar{0%{width:30%}80%{width:90%}100%{width:90%}}
    .hero-levelup{height:300px;filter:drop-shadow(0 0 32px #ffe9b0bb) drop-shadow(0 8px 12px #0009);
      margin-top:36px;animation:bob 2.4s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.04)}}
    .levelup-title{color:#ffe9b0;font-family:${font};font-weight:700;font-size:32px;text-align:center;
      margin-top:14px;text-shadow:0 2px 0 #3a2208,0 0 28px #ffd54a}
    .reward-row{display:flex;justify-content:center;gap:10px;margin-top:14px;flex-wrap:wrap}
    .cta-stack{position:absolute;left:24px;right:24px;bottom:20px;display:flex;flex-direction:column;gap:10px}
    #stage .c-banner{max-width:280px;margin-bottom:6px}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    return `
    <section class="screen active" id="xp">
      <div class="topbar">
        <div class="level-badge">LV 7</div>
        <div class="xp-gain">+1 250 XP</div>
      </div>
      <img class="hero-xp" src="${hero}">
      <div class="panel-wrap">
        <div class="bar-label"><span>Level 7</span><span>Level 8</span></div>
        <div class="bar-outer"><div class="bar-fill"></div></div>
      </div>
      <div class="cta-stack">${k.button("Continue Quest", "go('levelup')", { block: true })}</div>
    </section>

    <section class="screen" id="levelup">
      ${k.banner("Level Up!")}
      <img class="hero-levelup" src="${hero}">
      <div class="levelup-title">Level 8 Unlocked</div>
      <div class="reward-row">
        ${k.pill("ic-plus", "+100 Gold")}
        ${k.pill("ic-check", "New Gear")}
      </div>
      <div class="cta-stack">${k.button("Claim Reward", "cta()", { block: true })}</div>
    </section>`;
  },
};
