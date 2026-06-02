import type { Layout } from "./types.js";
import { resolveLayout, zone, zonesOverlay } from "../kit/layout.js";

/**
 * Feature grid — hero (компактний) + 2×2 ґрід фіч-карток + CTA знизу.
 * Для ігор з багатими механіками.
 *
 * Zone-driven: архетип `grid` (title / stage / actions). stage тримає hero +
 * підзаголовок + ґрід; actions — sticky CTA (зона гарантує bottom-розміщення).
 */
const L = resolveLayout("grid");

export const featureGrid: Layout = {
  id: "feature-grid",
  name: "Feature grid (2×2 + sticky CTA)",
  description: "Hero угорі, 4 feature-картки 2×2 з іконками, CTA знизу. Для ігор з багатими механіками.",
  meta: {
    screenIds: ["features"],
    hasCta: true,
    primaryCtaTexts: ["Install Free"],
    maxHeroPx: 180,
    zoneTypes: { features: "grid" },
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .title{color:#ffe9b0;font-weight:700;letter-spacing:1px;font-size:20px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .subtitle{color:#d8c49a;font-size:13px;text-align:center}
    .hero{height:84px;max-width:100%;object-fit:contain;filter:drop-shadow(0 8px 12px #0009)}
    .features{display:grid;grid-template-columns:1fr 1fr;gap:6px;width:100%;max-width:330px}
    .features .c-panel{border-width:16px;padding:4px 6px}
    .feat{display:flex;flex-direction:column;align-items:center;gap:3px;padding:2px}
    .feat .label{color:#ffe9b0;font-size:12.5px;font-weight:700;letter-spacing:0.4px;text-align:center;text-shadow:0 1px 2px #0008}
    .feat .desc{color:#d8c49a;font-size:10px;text-align:center;line-height:1.3;opacity:0.85}
    .zone .c-btn.block{width:100%}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    const featCard = (icon: string, label: string, desc: string) =>
      k.panel(`<div class="feat">${k.iconBtn(icon, "")}<div class="label">${label}</div><div class="desc">${desc}</div></div>`, "");
    return `
    <section class="screen active" id="features" data-type="grid">
      ${zonesOverlay(L)}
      ${zone("title", `<div class="title">Realm of Valor</div>`)}
      ${zone("stage", `
        <img class="hero" src="${hero}">
        <div class="features">
          ${featCard("ic-settings", "Customize", "Forge your unique hero")}
          ${featCard("ic-plus", "Collect", "Hundreds of loot drops")}
          ${featCard("ic-check", "Conquer", "Epic boss battles")}
          ${featCard("ic-sound", "Immerse", "Cinematic soundtrack")}
        </div>`)}
      ${zone("actions", k.button("Install Free", "cta()", { block: true, level: "primary" }))}
    </section>`;
  },
};
