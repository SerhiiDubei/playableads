import type { Layout } from "./types.js";

/**
 * Feature grid — hero угорі (компактний), 2×2 ґрід фіч-карток, CTA STICKY знизу.
 *
 * Дизайн-розміщення (DESIGN canvas 400×860):
 *   topbar/banner       ~70px
 *   hero                160-170px
 *   title               ~30px (margin + font)
 *   features 2×2        ~250px (each ~120 tall)
 *   sticky CTA          ~70px (absolute bottom)
 *   sum                 ≤ 580px (з запасом до 860px)
 *
 * STICKY CTA через `position:absolute;left:0;right:0;bottom:24px` — CTA НІКОЛИ
 * не вилазить за canvas, навіть якщо вміст вище раптом виріс. Це рятувальний
 * паттерн для будь-якого layout де є фіксований CTA.
 */
export const featureGrid: Layout = {
  id: "feature-grid",
  name: "Feature grid (2×2 + sticky CTA)",
  description: "Hero угорі, 4 feature-картки 2×2 з іконками, CTA STICKY знизу. Для ігор з багатими механіками.",
  meta: {
    screenIds: ["features"],
    hasCta: true,
    primaryCtaTexts: ["Install Free"],
    maxHeroPx: 180,
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
      padding:30px 18px 100px;opacity:0;visibility:hidden;
      transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .title{color:#ffe9b0;font-family:${font};font-weight:700;letter-spacing:1px;font-size:22px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55;margin:8px 0 4px}
    .hero{height:170px;filter:drop-shadow(0 8px 12px #0009);margin-top:4px}
    .features{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;max-width:360px;margin:10px 0 0}
    .feat{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 4px 8px}
    .feat .label{color:#ffe9b0;font-size:12.5px;font-weight:700;letter-spacing:0.4px;text-align:center;text-shadow:0 1px 2px #0008}
    .feat .desc{color:#d8c49a;font-size:10px;text-align:center;line-height:1.3;opacity:0.85}
    .cta-stack{position:absolute;left:24px;right:24px;bottom:20px;display:flex;flex-direction:column;gap:10px}
    #stage .c-banner{max-width:340px}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    const featCard = (icon: string, label: string, desc: string) =>
      k.panel(`<div class="feat">${k.iconBtn(icon, "")}<div class="label">${label}</div><div class="desc">${desc}</div></div>`, "");
    return `
    <section class="screen active" id="features">
      ${k.banner("Realm of Valor")}
      <img class="hero" src="${hero}">
      <div class="title">A World of Adventure</div>
      <div class="features">
        ${featCard("ic-settings", "Customize", "Forge your unique hero")}
        ${featCard("ic-plus", "Collect", "Hundreds of loot drops")}
        ${featCard("ic-check", "Conquer", "Epic boss battles")}
        ${featCard("ic-sound", "Immerse", "Cinematic soundtrack")}
      </div>
      <div class="cta-stack">${k.button("Install Free", "cta()", { block: true })}</div>
    </section>`;
  },
};
