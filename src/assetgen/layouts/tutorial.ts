import type { Layout } from "./types.js";

/**
 * Tutorial — 3 кроки. Progress-dots угорі (центровані без `left:0;right:0`,
 * щоб уникнути overflow), вміст у центрі, sticky Next-кнопка знизу.
 *
 * Урок з лінта: `position:absolute;left:0;right:0` БУЛО розтягло dot-row на
 * 400px з 13px offset → 13px overflow вправо. Виправлено через
 * `position:absolute;left:50%;transform:translateX(-50%)` що дає АВТО-ширину
 * по контенту і ідеальне центрування.
 */
export const tutorial: Layout = {
  id: "tutorial",
  name: "Tutorial (3-step onboarding)",
  description: "Покрокове знайомство з грою. Progress-bar угорі, ілюстрація і опис у центрі, sticky Next/Install внизу.",
  meta: {
    screenIds: ["t1", "t2", "t3"],
    hasCta: true,
    primaryCtaTexts: ["Install Free"],
    maxHeroPx: 280,
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
      padding:54px 24px 100px;opacity:0;visibility:hidden;transform:translateX(40px);
      transition:opacity .35s ease,transform .35s ease}
    .screen.active{opacity:1;visibility:visible;transform:none}
    .step-progress{position:absolute;top:18px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:5}
    .dot{width:36px;height:6px;border-radius:3px;background:#3a2e1a;transition:background .3s ease}
    .dot.done{background:#c9962f}
    .dot.active{background:#ffe9b0;box-shadow:0 0 12px #ffe9b088}
    .title{color:#ffe9b0;font-family:${font};font-weight:700;letter-spacing:1px;font-size:24px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55;margin-bottom:6px}
    .sub{color:#d8c49a;font-size:13px;text-align:center;max-width:300px;line-height:1.45}
    .hero{height:260px;filter:drop-shadow(0 8px 12px #0009);margin:10px 0}
    .hero-sm{height:200px;filter:drop-shadow(0 8px 12px #0009);margin:6px 0}
    .cta-stack{position:absolute;left:24px;right:24px;bottom:20px;display:flex;flex-direction:column;gap:10px}
    #stage .c-banner{max-width:280px;margin-bottom:10px}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    const dots = (active: number) =>
      `<div class="step-progress">${[0, 1, 2]
        .map((i) => `<span class="dot ${i < active ? "done" : i === active ? "active" : ""}"></span>`)
        .join("")}</div>`;
    return `
    <section class="screen active" id="t1">
      ${dots(0)}
      ${k.banner("Step 1 of 3")}
      <div class="title">Tap to Move</div>
      <img class="hero" src="${hero}">
      <div class="sub">Tap the buttons to guide your hero. Each tap brings you closer to victory.</div>
      <div class="cta-stack">${k.button("Next", "go('t2')", { block: true })}</div>
    </section>

    <section class="screen" id="t2">
      ${dots(1)}
      ${k.banner("Step 2 of 3")}
      <div class="title">Collect Treasure</div>
      ${k.panel(`<div class="k-row" style="justify-content:center;gap:14px;padding:6px 0">
        ${k.pill("ic-plus", "Gold")}
        ${k.pill("ic-check", "Loot")}
      </div>
      <div class="sub" style="margin-top:6px">Every quest rewards you with gold and rare loot.</div>${k.bar(45)}`, "width:300px")}
      <div class="cta-stack">${k.button("Next", "go('t3')", { block: true })}</div>
    </section>

    <section class="screen" id="t3">
      ${dots(2)}
      ${k.banner("Ready?")}
      <div class="title">Your Adventure Awaits</div>
      <img class="hero-sm" src="${hero}">
      <div class="sub">Join thousands of heroes. Install free and start your epic journey.</div>
      <div class="cta-stack">${k.button("Install Free", "cta()", { block: true })}</div>
    </section>`;
  },
};
