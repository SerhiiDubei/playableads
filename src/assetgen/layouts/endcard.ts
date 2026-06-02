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

  pageCss: () => `
    .hero{height:300px;max-width:100%;width:auto;object-fit:contain;
      filter:drop-shadow(0 12px 22px #0009);animation:bob 3.4s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    .tagline{color:#d8c49a;font-size:14px;text-align:center;max-width:320px;text-shadow:0 1px 2px #0008}
    .pulse{animation:pulse 1.6s ease-in-out infinite;width:100%}
    @keyframes pulse{0%,100%{filter:drop-shadow(0 0 0 #ffd54a00)}50%{filter:drop-shadow(0 0 18px #ffd54a99)}}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    return `
    <section class="screen active" id="endcard" data-type="endcard">
      ${zonesOverlay(L)}
      ${zone("title", `<div class="title">Realm of Valor</div>`)}
      ${zone("stage", `<img class="hero" src="${hero}"><div class="tagline gold">Become the legend. Embark on an epic adventure today.</div>`)}
      ${zone("actions", `<div class="pulse">${k.button("Install Free", "cta()", { block: true, level: "primary" })}</div>`)}
    </section>`;
  },
};
