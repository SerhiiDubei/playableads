import type { Layout } from "./types.js";

/**
 * Endcard = класичний Meta playable формат: BG + hero + title-banner + CTA.
 * Один екран, нуль навігації. Гравець бачить продукт і клікає Install.
 */
export const endcard: Layout = {
  id: "endcard",
  name: "Endcard (single-screen install)",
  description: "Один екран: фон, hero у центрі, banner з title, великий CTA знизу. Найпоширеніший формат Meta playable.",
  meta: {
    screenIds: ["endcard"],
    hasCta: true,
    primaryCtaTexts: ["Install Free"],
    maxHeroPx: 480,
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
      padding:40px 24px 32px;opacity:0;visibility:hidden;transform:translateY(16px);
      transition:opacity .35s ease,transform .35s ease}
    .screen.active{opacity:1;visibility:visible;transform:none}
    .hero{height:420px;filter:drop-shadow(0 12px 22px #0009);margin:18px 0 8px;animation:bob 3.4s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    .tagline{color:#d8c49a;font-size:14px;text-align:center;margin-bottom:18px;max-width:320px;text-shadow:0 1px 2px #0008}
    .gold{color:#f7ead0;text-shadow:0 1px 0 #6b4a1e,0 2px 3px rgba(0,0,0,.55)}
    .pulse{animation:pulse 1.6s ease-in-out infinite}
    @keyframes pulse{0%,100%{filter:drop-shadow(0 0 0 #ffd54a00)}50%{filter:drop-shadow(0 0 18px #ffd54a99)}}
    #stage .c-banner{max-width:360px;margin-top:12px}
    .stack{display:flex;flex-direction:column;align-items:stretch;gap:13px;width:320px;margin-top:auto}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    return `
    <section class="screen active" id="endcard">
      ${k.banner("Play Now")}
      <img class="hero" src="${hero}">
      <div class="tagline gold">Become the legend. Embark on an epic adventure today.</div>
      <div class="stack">
        <div class="pulse">${k.button("Install Free", "cta()", { block: true })}</div>
      </div>
    </section>`;
  },
};
