import type { Layout } from "./types.js";
import { resolveLayout, zone, zonesOverlay } from "../kit/layout.js";

/**
 * 5-screen menu — класична навігація menu/game/battle/shop/options.
 *
 * Zone-driven: menu → `menu` архетип, решта → `pick-hero`. Кнопки в actions
 * (thumb-зона) з візуальною ієрархією. pageCss — лише візуал.
 */
const screen = (id: string, type: string, active: boolean, inner: string) =>
  `<section class="screen${active ? " active" : ""}" id="${id}" data-type="${type}">${zonesOverlay(resolveLayout(type))}${inner}</section>`;

export const menu5: Layout = {
  id: "menu5",
  name: "5-screen menu",
  description: "Класичний menu/game/battle/shop/options нав. CTA = endCard через 'Exit' або 'Fight'.",
  meta: {
    screenIds: ["menu", "game", "battle", "shop", "options"],
    hasCta: true,
    primaryCtaTexts: ["Exit", "Fight", "Begin Quest"],
    enforceZones: false, // навігаційне меню — кнопки заповнюють центр за дизайном (не install-playable)
    zoneTypes: { menu: "menu", game: "pick-hero", battle: "pick-hero", shop: "pick-hero", options: "pick-hero" },
  },

  pageCss: () => `
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transform:translateY(16px);
      transition:opacity .28s ease,transform .28s ease}
    .screen.active{opacity:1;visibility:visible;transform:none}
    .title{color:#ffe9b0;font-weight:700;letter-spacing:1px;font-size:26px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .sub{color:#d8c49a;font-size:13px}
    .knight{height:210px;max-width:100%;object-fit:contain;filter:drop-shadow(0 8px 12px #0009)}
  `,

  screens: (k, a) => {
    const knight = a["knight"].dataUri;
    return [
      screen("menu", "menu", true,
        zone("hud", `${k.pill("ic-plus", "1 250")}${k.iconBtn("ic-settings", "go('options')")}`) +
        zone("title", k.banner("Realm of Valor")) +
        zone("actions",
          k.button("New Game", "go('game')", { block: true, level: "primary" }) +
          k.button("Battle", "go('battle')", { block: true }) +
          k.button("Shop", "go('shop')", { block: true }) +
          k.button("Options", "go('options')", { block: true }) +
          k.button("Exit", "endCard()", { block: true, level: "tertiary" }))),

      screen("game", "pick-hero", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Choose Your Hero</div>`) +
        zone("stage", `<img class="knight" src="${knight}">` +
          k.panel(`<div class="gold" style="font-size:18px;text-align:center">Sir Roland</div>
            <div class="sub" style="margin:4px 0 8px;text-align:center">Knight · Level 7</div>${k.bar(65)}`)) +
        zone("actions", k.button("Begin Quest", "go('battle')", { block: true, level: "primary" }))),

      screen("battle", "pick-hero", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Battle</div>`) +
        zone("stage", k.panel(`<div class="sub" style="text-align:center;padding:6px 2px">Choose your foe and claim victory!</div>`)) +
        zone("actions", k.button("Fight", "endCard()", { block: true, level: "primary" }))),

      screen("shop", "pick-hero", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Shop</div>`) +
        zone("stage", k.panel(`<div class="k-row" style="justify-content:center">${k.pill("ic-plus", "x3")}${k.pill("ic-check", "x1")}</div>`)) +
        zone("actions", k.button("Buy", "go('menu')", { block: true, level: "primary" }))),

      screen("options", "pick-hero", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Options</div>`) +
        zone("stage", k.panel(`<div class="k-row" style="justify-content:center;margin-bottom:10px">
          ${k.iconBtn("ic-sound", "this.style.opacity=this.style.opacity==='0.4'?'1':'0.4'")}
          ${k.iconBtn("ic-settings", "")}</div>
          <div class="sub" style="text-align:center;margin-bottom:6px">Music volume</div>${k.bar(80)}`)) +
        zone("actions", k.button("Save", "go('menu')", { block: true, level: "primary" }))),
    ].join("");
  },
};
