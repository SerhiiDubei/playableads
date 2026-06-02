import type { Layout } from "./types.js";
import { resolveLayout, zone, zonesOverlay } from "../kit/layout.js";

/**
 * Feature-list — вертикальний список з 3 фічами (іконка ліворуч, label+desc праворуч).
 * Краще за feature-grid коли кожна фіча потребує довшого опису (strategy/RPG).
 *
 * Zone-driven: архетип `grid` (title / stage / actions). pageCss — лише візуал.
 */
const L = resolveLayout("grid");

export const featureList: Layout = {
  id: "feature-list",
  name: "Feature list (vertical)",
  description: "Малий hero + 3 rows з іконкою+label+desc + sticky CTA. Для довших feature-описів.",
  meta: {
    screenIds: ["features"],
    hasCta: true,
    primaryCtaTexts: ["Install Free", "Play Free"],
    maxHeroPx: 200,
    zoneTypes: { features: "grid" },
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .title{color:#ffe9b0;font-weight:700;letter-spacing:1px;font-size:20px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .hero-small{height:96px;max-width:100%;object-fit:contain;filter:drop-shadow(0 8px 12px #0009)}
    .feat-list{display:flex;flex-direction:column;gap:8px;width:100%;max-width:344px}
    .feat-list .c-panel{border-width:16px;padding:4px 10px}
    .feat-row{display:flex;align-items:center;gap:12px}
    .feat-row .feat-text{flex:1}
    .feat-row .feat-label{color:#ffe9b0;font-weight:700;font-size:15px;letter-spacing:0.4px;
      text-shadow:0 1px 2px #0008;margin-bottom:2px}
    .feat-row .feat-desc{color:#d8c49a;font-size:12px;line-height:1.4;opacity:0.9}
    .zone .c-btn.block{width:100%}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    const featRow = (icon: string, label: string, desc: string) =>
      k.panel(`<div class="feat-row">${k.iconBtn(icon, "")}<div class="feat-text"><div class="feat-label">${label}</div><div class="feat-desc">${desc}</div></div></div>`, "");
    return `
    <section class="screen active" id="features" data-type="grid">
      ${zonesOverlay(L)}
      ${zone("title", `<div class="title">Realm of Valor</div>`)}
      ${zone("stage", `
        <img class="hero-small" src="${hero}">
        <div class="feat-list">
          ${featRow("ic-settings", "Build Your Hero", "Customize gear, abilities, and class trees")}
          ${featRow("ic-plus", "Collect Loot", "Hundreds of unique drops from boss battles")}
          ${featRow("ic-check", "Conquer Realms", "Epic campaign with cinematic story")}
        </div>`)}
      ${zone("actions", k.button("Install Free", "cta()", { block: true, level: "primary" }))}
    </section>`;
  },
};
