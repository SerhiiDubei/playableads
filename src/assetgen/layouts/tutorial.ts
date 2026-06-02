import type { Layout } from "./types.js";
import { resolveLayout, zone, zonesOverlay } from "../kit/layout.js";

/**
 * Tutorial — 3 кроки онбордингу. Progress-dots + заголовок у title-зоні,
 * ілюстрація/опис у stage, sticky Next/Install у actions.
 *
 * Zone-driven: архетип `immersive`. pageCss — лише візуал.
 */
const L = resolveLayout("immersive");

export const tutorial: Layout = {
  id: "tutorial",
  name: "Tutorial (3-step onboarding)",
  description: "Покрокове знайомство з грою. Progress-dots + заголовок угорі, ілюстрація і опис у центрі, sticky Next/Install внизу.",
  meta: {
    screenIds: ["t1", "t2", "t3"],
    hasCta: true,
    primaryCtaTexts: ["Install Free"],
    maxHeroPx: 280,
    zoneTypes: { t1: "immersive", t2: "immersive", t3: "immersive" },
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transform:translateX(40px);
      transition:opacity .35s ease,transform .35s ease}
    .screen.active{opacity:1;visibility:visible;transform:none}
    .step-progress{display:flex;gap:8px;justify-content:center}
    .dot{width:36px;height:6px;border-radius:3px;background:#3a2e1a;transition:background .3s ease}
    .dot.done{background:#c9962f}
    .dot.active{background:#ffe9b0;box-shadow:0 0 12px #ffe9b088}
    .title{color:#ffe9b0;font-weight:700;letter-spacing:1px;font-size:22px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .sub{color:#d8c49a;font-size:13px;text-align:center;max-width:300px;line-height:1.45}
    .hero{height:200px;max-width:100%;object-fit:contain;filter:drop-shadow(0 8px 12px #0009)}
    .hero-sm{height:184px;max-width:100%;object-fit:contain;filter:drop-shadow(0 8px 12px #0009)}
    .zone .c-btn.block{width:100%}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    const dots = (active: number) =>
      `<div class="step-progress">${[0, 1, 2]
        .map((i) => `<span class="dot ${i < active ? "done" : i === active ? "active" : ""}"></span>`)
        .join("")}</div>`;
    return `
    <section class="screen active" id="t1" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("title", `${dots(0)}<div class="title">Tap to Move</div>`)}
      ${zone("stage", `
        <img class="hero" src="${hero}">
        <div class="sub">Tap the buttons to guide your hero. Each tap brings you closer to victory.</div>`)}
      ${zone("actions", k.button("Next", "go('t2')", { block: true, level: "primary" }))}
    </section>

    <section class="screen" id="t2" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("title", `${dots(1)}<div class="title">Collect Treasure</div>`)}
      ${zone("stage", k.panel(`<div class="k-row" style="justify-content:center;gap:14px;padding:6px 0">
        ${k.pill("ic-plus", "Gold")}
        ${k.pill("ic-check", "Loot")}
      </div>
      <div class="sub" style="margin-top:6px">Every quest rewards you with gold and rare loot.</div>${k.bar(45)}`, "width:300px"))}
      ${zone("actions", k.button("Next", "go('t3')", { block: true, level: "primary" }))}
    </section>

    <section class="screen" id="t3" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("title", `${dots(2)}<div class="title">Your Adventure Awaits</div>`)}
      ${zone("stage", `
        <img class="hero-sm" src="${hero}">
        <div class="sub">Join thousands of heroes. Install free and start your epic journey.</div>`)}
      ${zone("actions", k.button("Install Free", "cta()", { block: true, level: "primary" }))}
    </section>`;
  },
};
