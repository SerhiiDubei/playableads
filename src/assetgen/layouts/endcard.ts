import type { Layout } from "./types.js";
import { resolveLayout, zone, zonesOverlay } from "../kit/layout.js";

/**
 * Endcard = класичний Meta playable формат: BG + hero + title-banner + CTA.
 * Один екран, нуль навігації. Гравець бачить продукт і клікає Install.
 *
 * Zone-driven: розкладка через kit/layout.ts архетип "endcard" (title / stage /
 * actions). pageCss тут — ТІЛЬКИ візуал (анімації, кольори), не позиціонування.
 */
const L = resolveLayout("endcard");

export const endcard: Layout = {
  id: "endcard",
  name: "Endcard (single-screen install)",
  description: "Один екран: фон, hero у центрі, banner з title, великий CTA знизу. Найпоширеніший формат Meta playable.",
  meta: {
    screenIds: ["endcard"],
    hasCta: true,
    primaryCtaTexts: ["Install Free"],
    maxHeroPx: 480,
    zoneTypes: { endcard: "endcard" },
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transform:translateY(16px);
      transition:opacity .35s ease,transform .35s ease}
    .screen.active{opacity:1;visibility:visible;transform:none}
    .hero{height:300px;max-width:100%;width:auto;object-fit:contain;
      filter:drop-shadow(0 12px 22px #0009);animation:bob 3.4s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    .tagline{color:#d8c49a;font-size:14px;text-align:center;max-width:320px;text-shadow:0 1px 2px #0008}
    .gold{color:#f7ead0;text-shadow:0 1px 0 #6b4a1e,0 2px 3px rgba(0,0,0,.55)}
    .pulse{animation:pulse 1.6s ease-in-out infinite;width:100%}
    @keyframes pulse{0%,100%{filter:drop-shadow(0 0 0 #ffd54a00)}50%{filter:drop-shadow(0 0 18px #ffd54a99)}}
    .zone .c-btn.block{width:100%}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    return `
    <section class="screen active" id="endcard" data-type="endcard">
      ${zonesOverlay(L)}
      ${zone("title", k.banner("Play Now"))}
      ${zone("stage", `<img class="hero" src="${hero}"><div class="tagline gold">Become the legend. Embark on an epic adventure today.</div>`)}
      ${zone("actions", `<div class="pulse">${k.button("Install Free", "cta()", { block: true, level: "primary" })}</div>`)}
    </section>`;
  },
};
