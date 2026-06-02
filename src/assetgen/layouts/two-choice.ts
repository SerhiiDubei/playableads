import type { Layout } from "./types.js";

/**
 * Two-choice — ілюзія вибору, обидва шляхи ведуть до CTA.
 *
 * 2 екрани:
 *   choose    — банер "What will you do?", герой, 2 великі кнопки Attack/Defend
 *   outcome   — банер "Excellent choice!", герой з glow + CTA "Play Free"
 *
 * Принцип agency — гравець відчуває що ВИРІШИВ долю, навіть якщо обидві опції
 * ведуть на ту саму install CTA. Працює у narrative/RPG/decision-heavy games.
 */
export const twoChoice: Layout = {
  id: "two-choice",
  name: "Two-choice branching",
  description: "2 рівносильні опції → той самий CTA. Дає гравцю feeling of agency, знижує bounce.",
  meta: {
    screenIds: ["choose", "outcome"],
    hasCta: true,
    primaryCtaTexts: ["Play Free", "Continue"],
    maxHeroPx: 260,
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
      padding:30px 24px 100px;opacity:0;visibility:hidden;
      transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .hero-choose{height:260px;filter:drop-shadow(0 8px 12px #0009);margin-top:20px}
    .title{color:#ffe9b0;font-family:${font};font-weight:700;font-size:22px;text-align:center;
      margin-top:12px;text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55;letter-spacing:0.6px}
    .choice-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px;width:100%;max-width:340px}
    .choice{display:flex;flex-direction:column;align-items:center;padding:6px 6px 8px}
    .choice .ico{font-size:38px;margin-bottom:4px}
    .choice .label{color:#ffe9b0;font-weight:700;font-size:16px;letter-spacing:0.4px}
    .choice .desc{color:#d8c49a;font-size:11px;text-align:center;margin-top:2px;line-height:1.3}
    .hero-outcome{height:260px;filter:drop-shadow(0 0 32px #ffe9b099) drop-shadow(0 8px 12px #0009);
      margin-top:20px;animation:bob 2.6s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    .outcome-title{color:#ffe9b0;font-family:${font};font-weight:700;font-size:26px;text-align:center;
      margin-top:14px;text-shadow:0 2px 0 #3a2208,0 0 22px #ffd54a}
    .outcome-sub{color:#d8c49a;font-size:13px;text-align:center;margin-top:6px;max-width:300px}
    .cta-stack{position:absolute;left:24px;right:24px;bottom:20px;display:flex;flex-direction:column;gap:10px}
    #stage .c-banner{max-width:280px;margin-bottom:4px}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    const choiceCard = (icon: string, label: string, desc: string, action: string) =>
      k.panel(`<div class="choice" onclick="${action}"><div class="ico">${icon}</div><div class="label">${label}</div><div class="desc">${desc}</div></div>`, "cursor:pointer");
    return `
    <section class="screen active" id="choose">
      ${k.banner("Your Choice")}
      <img class="hero-choose" src="${hero}">
      <div class="title">What Will You Do?</div>
      <div class="choice-row">
        ${choiceCard("⚔", "Attack", "Charge forward", "go('outcome')")}
        ${choiceCard("🛡", "Defend", "Hold the line", "go('outcome')")}
      </div>
      <div class="cta-stack">${k.button("Continue", "go('outcome')", { block: true })}</div>
    </section>

    <section class="screen" id="outcome">
      ${k.banner("Excellent!")}
      <img class="hero-outcome" src="${hero}">
      <div class="outcome-title">Victory Awaits</div>
      <div class="outcome-sub">Your choices shape your destiny. Continue the adventure.</div>
      <div class="cta-stack">${k.button("Play Free", "cta()", { block: true })}</div>
    </section>`;
  },
};
