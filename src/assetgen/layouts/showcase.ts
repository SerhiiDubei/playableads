import type { Layout } from "./types.js";
import { resolveLayout, zone, zonesOverlay } from "../kit/layout.js";

/**
 * Showcase = 10-екранний zone-driven демо, що прокручує всі архетипи
 * (menu → pick-hero → endcard) на одному playable з 3 різними героями.
 * Найповніший приклад багатоекранного шаблону на зонах (референс для нових layout-ів).
 *
 * Походження: гілка session/layered-architecture-games (1 червня).
 */
function screen(id: string, type: string, active: boolean, zones: string): string {
  return `<section class="screen${active ? " active" : ""}" id="${id}" data-type="${type}">${zonesOverlay(resolveLayout(type))}${zones}</section>`;
}

export const showcase: Layout = {
  id: "showcase",
  name: "Showcase (10-screen zone tour)",
  description: "10 екранів: меню → вибір героя → бій → шоп → опції → daily → level-up → win → lose → endcard. Демонструє всі зонові архетипи на 3 героях.",
  meta: {
    screenIds: ["menu", "game", "battle", "shop", "options", "daily", "levelup", "win", "lose", "endcard"],
    hasCta: true,
    primaryCtaTexts: ["Install"],
    enforceZones: false, // навігаційний showcase — кнопки по центру за дизайном
    zoneTypes: {
      menu: "menu",
      game: "pick-hero", battle: "pick-hero", shop: "pick-hero", options: "pick-hero",
      daily: "pick-hero", levelup: "pick-hero",
      win: "endcard", lose: "endcard", endcard: "endcard",
    },
  },

  pageCss: () => `
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transform:translateY(16px);
      transition:opacity .28s ease,transform .28s ease}
    .screen.active{opacity:1;visibility:visible;transform:none}
    .title{color:#ffe9b0;font-weight:700;letter-spacing:1px;font-size:28px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .sub{color:#d8c49a;font-size:13px;text-align:center}
    .hero-img{width:100%;height:62%;background-position:center bottom;background-repeat:no-repeat;
      background-size:contain;filter:drop-shadow(0 8px 12px #0009)}
    .hero-img.big{height:92%}
    .stars{color:#ffd54a;font-size:18px;letter-spacing:2px}
  `,

  screens: (k, a) => {
    const hero = (key: string, big = false) =>
      `<div class="hero-img${big ? " big" : ""}" style="background-image:url(${a[key].dataUri})"></div>`;
    return [
      screen("menu", "menu", true,
        zone("hud", `${k.pill("ic-plus", "1 250")}${k.iconBtn("ic-settings", "go('options')")}`) +
        zone("title", k.banner("Realm of Valor")) +
        zone("stage", "") +
        zone("actions",
          k.button("New Game", "go('game')", { block: true, level: "primary" }) +
          k.button("Battle", "go('battle')", { block: true }) +
          k.button("Shop", "go('shop')", { block: true }) +
          k.button("Daily Reward", "go('daily')", { block: true }) +
          k.button("Options", "go('options')", { block: true, level: "tertiary" }))),

      screen("game", "pick-hero", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Choose Your Hero</div>`) +
        zone("stage", hero("knight") +
          k.panel(`<div class="gold" style="font-size:18px;text-align:center">Sir Roland</div>
            <div class="sub" style="margin:4px 0 8px">Knight · Level 7</div>${k.bar(65)}`)) +
        zone("actions", k.button("Begin Quest", "go('battle')", { block: true, level: "primary" }))),

      screen("battle", "pick-hero", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Battle</div>`) +
        zone("stage", hero("hero2") +
          k.panel(`<div class="sub" style="padding:6px 2px">Defeat the foe and claim victory!</div>${k.bar(40)}`)) +
        zone("actions", k.button("Fight", "go('win')", { block: true, level: "primary" }))),

      screen("shop", "pick-hero", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Shop</div>`) +
        zone("stage", k.panel(`<div class="k-row" style="justify-content:center">${k.pill("ic-plus", "x3")}${k.pill("ic-check", "x1")}${k.pill("ic-plus", "x5")}</div>`)) +
        zone("actions", k.button("Buy", "go('menu')", { block: true, level: "primary" }))),

      screen("options", "pick-hero", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Options</div>`) +
        zone("stage", k.panel(`<div class="k-row" style="justify-content:center;margin-bottom:10px">
          ${k.iconBtn("ic-sound", "this.style.opacity=this.style.opacity==='0.4'?'1':'0.4'")}${k.iconBtn("ic-settings", "")}</div>
          <div class="sub" style="margin-bottom:6px">Music volume</div>${k.bar(80)}`)) +
        zone("actions", k.button("Save", "go('menu')", { block: true, level: "primary" }))),

      screen("daily", "pick-hero", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Daily Reward</div>`) +
        zone("stage", k.panel(`<div class="k-row" style="justify-content:center;margin-bottom:8px">
          ${k.pill("ic-plus", "500")}${k.pill("ic-check", "+1")}</div>
          <div class="sub">Day 3 streak — come back tomorrow!</div>`)) +
        zone("actions", k.button("Claim", "go('menu')", { block: true, level: "primary" }))),

      screen("levelup", "pick-hero", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Level Up!</div>`) +
        zone("stage", hero("hero3") +
          k.panel(`<div class="gold" style="font-size:18px;text-align:center">Level 8</div>${k.bar(100)}`)) +
        zone("actions", k.button("Continue", "go('endcard')", { block: true, level: "primary" }))),

      screen("win", "endcard", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Victory!</div><div class="stars">★★★★★</div>`) +
        zone("stage", hero("hero2", true)) +
        zone("actions",
          k.button("Claim Reward", "go('levelup')", { block: true, level: "primary" }) +
          k.button("Replay", "go('menu')", { block: true, level: "tertiary" }))),

      screen("lose", "endcard", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Defeated</div>`) +
        zone("stage", hero("hero3", true)) +
        zone("actions",
          k.button("Retry", "go('battle')", { block: true, level: "primary" }) +
          k.button("Quit", "go('menu')", { block: true, level: "tertiary" }))),

      screen("endcard", "endcard", false,
        zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
        zone("title", `<div class="title">Realm of Valor</div><div class="stars">★★★★★</div>`) +
        zone("stage", hero("knight", true)) +
        zone("actions",
          k.button("Install", "cta()", { block: true, level: "primary" }) +
          k.button("Replay", "go('menu')", { block: true, level: "tertiary" }))),
    ].join("");
  },
};
