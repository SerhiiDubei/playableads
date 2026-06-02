import type { Layout } from "./types.js";
import { resolveLayout, zone, zonesOverlay } from "../kit/layout.js";

/**
 * Two-choice — ілюзія вибору, обидва шляхи ведуть до CTA. Feeling of agency.
 *
 * 2 екрани: choose (2 опції) → outcome (CTA).
 * Zone-driven: архетип `split` (title / stage / actions). pageCss — лише візуал.
 */
const L = resolveLayout("split");

export const twoChoice: Layout = {
  id: "two-choice",
  name: "Two-choice branching",
  description: "2 рівносильні опції → той самий CTA. Дає гравцю feeling of agency, знижує bounce.",
  meta: {
    screenIds: ["choose", "outcome"],
    hasCta: true,
    primaryCtaTexts: ["Play Free", "Continue"],
    maxHeroPx: 260,
    zoneTypes: { choose: "split", outcome: "split" },
  },

  pageCss: () => `
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .title{color:#ffe9b0;font-weight:700;font-size:20px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55;letter-spacing:0.6px}
    .hero-choose{height:128px;max-width:100%;object-fit:contain;filter:drop-shadow(0 8px 12px #0009)}
    .choice-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:330px}
    .choice-row .c-panel{border-width:16px;padding:4px 6px}
    .choice{display:flex;flex-direction:column;align-items:center;padding:2px}
    .choice .ico{font-size:34px;margin-bottom:2px}
    .choice .label{color:#ffe9b0;font-weight:700;font-size:16px;letter-spacing:0.4px}
    .choice .desc{color:#d8c49a;font-size:11px;text-align:center;margin-top:2px;line-height:1.3}
    .hero-outcome{height:188px;max-width:100%;object-fit:contain;
      filter:drop-shadow(0 0 32px #ffe9b099) drop-shadow(0 8px 12px #0009);animation:bob 2.6s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    .outcome-title{color:#ffe9b0;font-weight:700;font-size:24px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 22px #ffd54a}
    .outcome-sub{color:#d8c49a;font-size:13px;text-align:center;max-width:300px}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    const choiceCard = (icon: string, label: string, desc: string, action: string) =>
      k.panel(`<div class="choice" onclick="${action}"><div class="ico">${icon}</div><div class="label">${label}</div><div class="desc">${desc}</div></div>`, "cursor:pointer");
    return `
    <section class="screen active" id="choose" data-type="split">
      ${zonesOverlay(L)}
      ${zone("title", `<div class="title">What Will You Do?</div>`)}
      ${zone("stage", `
        <img class="hero-choose" src="${hero}">
        <div class="choice-row">
          ${choiceCard("⚔", "Attack", "Charge forward", "go('outcome')")}
          ${choiceCard("🛡", "Defend", "Hold the line", "go('outcome')")}
        </div>`)}
      ${zone("actions", k.button("Continue", "go('outcome')", { block: true }))}
    </section>

    <section class="screen" id="outcome" data-type="split">
      ${zonesOverlay(L)}
      ${zone("title", `<div class="title">Excellent!</div>`)}
      ${zone("stage", `
        <img class="hero-outcome" src="${hero}">
        <div class="outcome-title">Victory Awaits</div>
        <div class="outcome-sub">Your choices shape your destiny. Continue the adventure.</div>`)}
      ${zone("actions", k.button("Play Free", "cta()", { block: true, level: "primary" }))}
    </section>`;
  },
};
