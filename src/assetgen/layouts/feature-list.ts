import type { Layout } from "./types.js";

/**
 * Feature-list — вертикальний список з 3-4 фічами замість 2×2 grid.
 *
 * Один екран: banner + малий hero + 3 row-фічі (іконка ліворуч, label+desc праворуч),
 * sticky CTA знизу. Альтернатива до feature-grid для випадку коли фічі
 * описуються довшим текстом.
 *
 * Краще для strategy/RPG де кожна фіча потребує пояснення (3-5 слів desc).
 * feature-grid 2×2 краще для коротких labels (1-2 слова).
 */
export const featureList: Layout = {
  id: "feature-list",
  name: "Feature list (vertical)",
  description: "Banner + малий hero + 3 rows з іконкою+label+desc + sticky CTA. Для довших feature-описів.",
  meta: {
    screenIds: ["features"],
    hasCta: true,
    primaryCtaTexts: ["Install Free", "Play Free"],
    maxHeroPx: 200,
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
      padding:24px 20px 100px;opacity:0;visibility:hidden;
      transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .hero-small{height:180px;filter:drop-shadow(0 8px 12px #0009);margin-top:4px}
    .feat-list{display:flex;flex-direction:column;gap:10px;width:100%;max-width:360px;margin-top:18px}
    .feat-row{display:flex;align-items:center;gap:12px;padding:4px 4px}
    .feat-row .feat-text{flex:1}
    .feat-row .feat-label{color:#ffe9b0;font-weight:700;font-size:15px;letter-spacing:0.4px;
      text-shadow:0 1px 2px #0008;margin-bottom:2px}
    .feat-row .feat-desc{color:#d8c49a;font-size:12px;line-height:1.4;opacity:0.9}
    .cta-stack{position:absolute;left:24px;right:24px;bottom:20px;display:flex;flex-direction:column;gap:10px}
    #stage .c-banner{max-width:320px;margin-bottom:4px}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    const featRow = (icon: string, label: string, desc: string) =>
      k.panel(`<div class="feat-row">${k.iconBtn(icon, "")}<div class="feat-text"><div class="feat-label">${label}</div><div class="feat-desc">${desc}</div></div></div>`, "");
    return `
    <section class="screen active" id="features">
      ${k.banner("Realm of Valor")}
      <img class="hero-small" src="${hero}">
      <div class="feat-list">
        ${featRow("ic-settings", "Build Your Hero", "Customize gear, abilities, and class trees")}
        ${featRow("ic-plus", "Collect Loot", "Hundreds of unique drops from boss battles")}
        ${featRow("ic-check", "Conquer Realms", "Epic campaign with cinematic story")}
      </div>
      <div class="cta-stack">${k.button("Install Free", "cta()", { block: true })}</div>
    </section>`;
  },
};
