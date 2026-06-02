import type { Layout } from "./types.js";

export const menu5: Layout = {
  id: "menu5",
  name: "5-screen menu",
  description: "Класичний menu/game/battle/shop/options нав. CTA = endCard через 'Exit' або 'Fight'.",
  meta: {
    screenIds: ["menu", "game", "battle", "shop", "options"],
    hasCta: true,
    primaryCtaTexts: ["Exit", "Fight", "Begin Quest"],
    enforceZones: false, // legacy navigation layout — кнопки по центру за дизайном
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
      padding:84px 24px 28px;opacity:0;visibility:hidden;transform:translateY(16px);
      transition:opacity .28s ease,transform .28s ease}
    .screen.active{opacity:1;visibility:visible;transform:none}
    .title{color:#ffe9b0;font-family:${font};font-weight:700;letter-spacing:1px;font-size:30px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .sub{color:#d8c49a;font-size:13px}
    .topbar{position:absolute;top:16px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:0 18px;z-index:5}
    .stack{display:flex;flex-direction:column;align-items:stretch;gap:13px;width:320px}
    .knight{height:360px;filter:drop-shadow(0 8px 12px #0009)}
    #stage .c-banner{max-width:344px}
  `,

  screens: (k, a) => {
    const knight = a["knight"].dataUri;
    return `
    <section class="screen active" id="menu">
      <div class="topbar">${k.pill("ic-plus", "1 250")}${k.iconBtn("ic-settings", "go('options')")}</div>
      ${k.banner("Realm of Valor")}
      <div class="stack">
        ${k.button("New Game", "go('game')", { block: true })}
        ${k.button("Battle", "go('battle')", { block: true })}
        ${k.button("Shop", "go('shop')", { block: true })}
        ${k.button("Options", "go('options')", { block: true })}
        ${k.button("Exit", "endCard()", { block: true })}
      </div>
    </section>

    <section class="screen" id="game">
      <div class="topbar">${k.iconBtn("ic-back", "go('menu')")}<span></span></div>
      <div class="title">Choose Your Hero</div>
      <img class="knight" src="${knight}">
      ${k.panel(`<div class="gold" style="font-size:18px;text-align:center">Sir Roland</div>
        <div class="sub" style="margin:4px 0 8px;text-align:center">Knight · Level 7</div>${k.bar(65)}`, "width:320px")}
      <div class="stack">${k.button("Begin Quest", "go('battle')", { block: true })}</div>
    </section>

    <section class="screen" id="battle">
      <div class="topbar">${k.iconBtn("ic-back", "go('menu')")}<span></span></div>
      <div class="title">Battle</div>
      ${k.panel(`<div class="sub" style="text-align:center;padding:6px 2px">Choose your foe and claim victory!</div>`, "width:320px")}
      <div class="stack">${k.button("Fight", "endCard()", { block: true })}</div>
    </section>

    <section class="screen" id="shop">
      <div class="topbar">${k.iconBtn("ic-back", "go('menu')")}<span></span></div>
      <div class="title">Shop</div>
      ${k.panel(`<div class="k-row" style="justify-content:center">${k.pill("ic-plus", "x3")}${k.pill("ic-check", "x1")}</div>`, "width:320px")}
      <div class="stack">${k.button("Buy", "go('menu')", { block: true })}</div>
    </section>

    <section class="screen" id="options">
      <div class="topbar">${k.iconBtn("ic-back", "go('menu')")}<span></span></div>
      <div class="title">Options</div>
      ${k.panel(`<div class="k-row" style="justify-content:center;margin-bottom:10px">
        ${k.iconBtn("ic-sound", "this.style.opacity=this.style.opacity==='0.4'?'1':'0.4'")}
        ${k.iconBtn("ic-settings", "")}</div>
        <div class="sub" style="text-align:center;margin-bottom:6px">Music volume</div>${k.bar(80)}`, "width:320px")}
      <div class="stack">${k.button("Save", "go('menu')", { block: true })}</div>
    </section>`;
  },
};
