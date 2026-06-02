import type { Layout } from "./types.js";
import { resolveLayout, zone, zonesOverlay } from "../kit/layout.js";

/**
 * Progress-reveal — анімований XP-бар і level-up. Loss-aversion для RPG/idle.
 *
 * 2 екрани: xp (бар наповнюється) → levelup (reward + CTA).
 * Zone-driven: архетип `immersive`. topbar (level+XP) → hud; hero+бар → stage; CTA → actions.
 */
const L = resolveLayout("immersive");

export const progressReveal: Layout = {
  id: "progress-reveal",
  name: "Progress reveal (XP bar fill)",
  description: "XP-бар наповнюється + level-up + reward + CTA. Loss-aversion для RPG/idle progression.",
  meta: {
    screenIds: ["xp", "levelup"],
    hasCta: true,
    primaryCtaTexts: ["Claim Reward", "Play Free"],
    maxHeroPx: 320,
    zoneTypes: { xp: "immersive", levelup: "immersive" },
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .xp-gain{color:#ffe9b0;font-weight:700;font-size:20px;text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .level-badge{background:#c9962f;color:#1a0f04;padding:6px 14px;border-radius:14px;font-weight:700;font-size:14px;letter-spacing:1px}
    .hero-xp{height:230px;max-width:100%;object-fit:contain;filter:drop-shadow(0 8px 12px #0009)}
    .panel-wrap{width:340px;max-width:100%;background:rgba(20,12,4,0.8);border:1px solid #c9962f55;border-radius:12px;padding:14px}
    .bar-label{display:flex;justify-content:space-between;color:#d8c49a;font-size:12px;margin-bottom:6px}
    .bar-outer{height:14px;background:#1a0f04;border-radius:7px;overflow:hidden;border:1px solid #c9962f33}
    .bar-fill{height:100%;background:linear-gradient(90deg,#c9962f,#ffe9b0);width:30%;border-radius:7px;
      animation:fillBar 2.5s ease-out forwards;box-shadow:0 0 10px #ffe9b099}
    @keyframes fillBar{0%{width:30%}80%{width:90%}100%{width:90%}}
    .hero-levelup{height:210px;max-width:100%;object-fit:contain;
      filter:drop-shadow(0 0 32px #ffe9b0bb) drop-shadow(0 8px 12px #0009);animation:bob 2.4s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.04)}}
    .levelup-title{color:#ffe9b0;font-weight:700;font-size:28px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 28px #ffd54a}
    .reward-row{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
    .zone .c-btn.block{width:100%}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    return `
    <section class="screen active" id="xp" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("hud", `<div class="level-badge">LV 7</div><div class="xp-gain">+1 250 XP</div>`)}
      ${zone("stage", `
        <img class="hero-xp" src="${hero}">
        <div class="panel-wrap">
          <div class="bar-label"><span>Level 7</span><span>Level 8</span></div>
          <div class="bar-outer"><div class="bar-fill"></div></div>
        </div>`)}
      ${zone("actions", k.button("Continue Quest", "go('levelup')", { block: true, level: "primary" }))}
    </section>

    <section class="screen" id="levelup" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("title", `<div class="levelup-title">Level Up!</div>`)}
      ${zone("stage", `
        <img class="hero-levelup" src="${hero}">
        <div class="levelup-title">Level 8 Unlocked</div>
        <div class="reward-row">
          ${k.pill("ic-plus", "+100 Gold")}
          ${k.pill("ic-check", "New Gear")}
        </div>`)}
      ${zone("actions", k.button("Claim Reward", "cta()", { block: true, level: "primary" }))}
    </section>`;
  },
};
