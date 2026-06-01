import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { loadKit, makeKit, kitBytes, NINE, fontFace, type KitAssets } from "./kit/kit.js";
import { stageCss, stageJs } from "./kit/stage.js";
import { resolveLayout, zoneCss, zone, zonesOverlay, OVERLAY_CSS, type Layout } from "./kit/layout.js";

const OUT = "test/menu-playable";
const ASSET_DIR = `${OUT}/assets`;
const ICONS = ["ic-settings", "ic-back", "ic-sound", "ic-plus", "ic-check", "ic-close"];
const KNIGHT_SRC = "out/prompt-lab/heroes3-knight/4-ip-anchored.png";

const FONT_FACE = fontFace("Cinzel", "src/assetgen/kit/cinzel-700.woff2");
const FONT = `"Cinzel",Georgia,serif`;

const LAYOUTS: Record<string, Layout> = {
  menu: resolveLayout("menu"),
  "pick-hero": resolveLayout("pick-hero"),
  endcard: resolveLayout("endcard"),
};
const ZONE_CSS = Object.values(LAYOUTS).map(zoneCss).join("");

const pageCss = `
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{font-family:${FONT}}
  .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transform:translateY(16px);
    transition:opacity .28s ease,transform .28s ease}
  .screen.active{opacity:1;visibility:visible;transform:none}
  .title{color:#ffe9b0;font-family:${FONT};font-weight:700;letter-spacing:1px;font-size:28px;text-align:center;
    text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
  .sub{color:#d8c49a;font-size:13px;text-align:center}
  .knight,.hero2,.hero3{width:100%;height:62%;background-position:center bottom;background-repeat:no-repeat;background-size:contain;
    filter:drop-shadow(0 8px 12px #0009)}
  .knight.big,.hero2.big,.hero3.big{height:92%}
  .zone .c-btn.block{width:100%}
  .zone .c-panel{width:100%}
  .stars{color:#ffd54a;font-size:18px;letter-spacing:2px}
`;

// один екран = тип (архетип) + компоненти, розкладені по зонах
function screen(id: string, type: string, active: boolean, zones: string): string {
  return `<section class="screen${active ? " active" : ""}" id="${id}" data-type="${type}">${zonesOverlay(LAYOUTS[type])}${zones}</section>`;
}

function screens(k: ReturnType<typeof makeKit>): string {
  return [
    // 1 — головне меню (архетип menu)
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

    // 2 — вибір героя (hero1: heroes3-knight)
    screen("game", "pick-hero", false,
      zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
      zone("title", `<div class="title">Choose Your Hero</div>`) +
      zone("stage", `<div class="knight"></div>` +
        k.panel(`<div class="gold" style="font-size:18px;text-align:center">Sir Roland</div>
          <div class="sub" style="margin:4px 0 8px">Knight · Level 7</div>${k.bar(65)}`)) +
      zone("actions", k.button("Begin Quest", "go('battle')", { block: true, level: "primary" }))),

    // 3 — бій (hero2: diablo2)
    screen("battle", "pick-hero", false,
      zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
      zone("title", `<div class="title">Battle</div>`) +
      zone("stage", `<div class="hero2"></div>` +
        k.panel(`<div class="sub" style="padding:6px 2px">Defeat the foe and claim victory!</div>${k.bar(40)}`)) +
      zone("actions", k.button("Fight", "go('win')", { block: true, level: "primary" }))),

    // 4 — магазин
    screen("shop", "pick-hero", false,
      zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
      zone("title", `<div class="title">Shop</div>`) +
      zone("stage", k.panel(`<div class="k-row" style="justify-content:center">${k.pill("ic-plus", "x3")}${k.pill("ic-check", "x1")}${k.pill("ic-plus", "x5")}</div>`)) +
      zone("actions", k.button("Buy", "go('menu')", { block: true, level: "primary" }))),

    // 5 — налаштування
    screen("options", "pick-hero", false,
      zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
      zone("title", `<div class="title">Options</div>`) +
      zone("stage", k.panel(`<div class="k-row" style="justify-content:center;margin-bottom:10px">
        ${k.iconBtn("ic-sound", "this.style.opacity=this.style.opacity==='0.4'?'1':'0.4'")}${k.iconBtn("ic-settings", "")}</div>
        <div class="sub" style="margin-bottom:6px">Music volume</div>${k.bar(80)}`)) +
      zone("actions", k.button("Save", "go('menu')", { block: true, level: "primary" }))),

    // 6 — щоденна нагорода
    screen("daily", "pick-hero", false,
      zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
      zone("title", `<div class="title">Daily Reward</div>`) +
      zone("stage", k.panel(`<div class="k-row" style="justify-content:center;margin-bottom:8px">
        ${k.pill("ic-plus", "500")}${k.pill("ic-check", "+1")}</div>
        <div class="sub">Day 3 streak — come back tomorrow!</div>`)) +
      zone("actions", k.button("Claim", "go('menu')", { block: true, level: "primary" }))),

    // 7 — підвищення рівня (hero3: pixelart)
    screen("levelup", "pick-hero", false,
      zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
      zone("title", `<div class="title">Level Up!</div>`) +
      zone("stage", `<div class="hero3"></div>` +
        k.panel(`<div class="gold" style="font-size:18px;text-align:center">Level 8</div>${k.bar(100)}`)) +
      zone("actions", k.button("Continue", "go('endcard')", { block: true, level: "primary" }))),

    // 8 — перемога (endcard, hero2)
    screen("win", "endcard", false,
      zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
      zone("title", `<div class="title">Victory!</div><div class="stars">★★★★★</div>`) +
      zone("stage", `<div class="hero2 big"></div>`) +
      zone("actions",
        k.button("Claim Reward", "go('levelup')", { block: true, level: "primary" }) +
        k.button("Replay", "go('menu')", { block: true, level: "tertiary" }))),

    // 9 — поразка (endcard, hero3)
    screen("lose", "endcard", false,
      zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
      zone("title", `<div class="title">Defeated</div>`) +
      zone("stage", `<div class="hero3 big"></div>`) +
      zone("actions",
        k.button("Retry", "go('battle')", { block: true, level: "primary" }) +
        k.button("Quit", "go('menu')", { block: true, level: "tertiary" }))),

    // 10 — фінальний endcard / CTA (hero1)
    screen("endcard", "endcard", false,
      zone("hud", `${k.iconBtn("ic-back", "go('menu')")}<span></span>`) +
      zone("title", `<div class="title">Realm of Valor</div><div class="stars">★★★★★</div>`) +
      zone("stage", `<div class="knight big"></div>`) +
      zone("actions",
        k.button("Install", "cta()", { block: true, level: "primary" }) +
        k.button("Replay", "go('menu')", { block: true, level: "tertiary" }))),
  ].join("");
}

function html(k: ReturnType<typeof makeKit>, a: KitAssets, pixelated = false): string {
  const pix = pixelated ? "img{image-rendering:pixelated}#viewport{image-rendering:pixelated}" : "";
  const body = screens(k);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Realm of Valor — test playable</title>
<style>${FONT_FACE}${stageCss(a["bg-castle"].dataUri)}${pageCss}${ZONE_CSS}${OVERLAY_CSS}${k.css}${pix}
.knight{background-image:url(${a["knight"].dataUri})}
.hero2{background-image:url(${a["hero2"].dataUri})}
.hero3{background-image:url(${a["hero3"].dataUri})}</style></head>
<body><div id="viewport"><div id="stage">${body}</div></div>
<script>window.FbPlayableAd=window.FbPlayableAd||{onCTAClick:function(){try{console.log("[FbPlayableAd] onCTAClick (stub)")}catch(e){}}};</script>
<script>
  var cur='menu';
  function go(id){var a=document.getElementById(cur),b=document.getElementById(id);
    if(a)a.classList.remove('active');if(b)b.classList.add('active');cur=id;}
  function cta(){try{window.FbPlayableAd.onCTAClick();}catch(e){}}
  if(/zones/.test(location.search+location.hash))document.body.classList.add('show-zones');
</script>
<script>${stageJs()}</script></body></html>`;
}

export async function buildKitPlayable(styleId = "heroes3"): Promise<{ html: string; assetBytes: number }> {
  const src = `out/${styleId}`;
  const pixelated = /pixel/i.test(styleId);
  const bgSrc = existsSync(`${src}/bg.png`) ? `${src}/bg.png` : `${src}/bg-castle.png`;
  const heroSrc = existsSync(`${src}/hero.png`) ? `${src}/hero.png` : KNIGHT_SRC;
  const assets = await loadKit(src, {
    keys: [...Object.keys(NINE), "banner", ...ICONS],
    extra: [
      { key: "bg-castle", src: bgSrc, size: 680 },
      { key: "knight", src: heroSrc, size: 520 },
      // 2 додаткові герої-ассети з інших стилів — 3 різні ассети на 10 екранів
      { key: "hero2", src: existsSync("out/diablo2/hero.png") ? "out/diablo2/hero.png" : heroSrc, size: 520 },
      { key: "hero3", src: existsSync("out/pixelart/hero.png") ? "out/pixelart/hero.png" : heroSrc, size: 520 },
    ],
    writeDir: ASSET_DIR,
    pixelated,
  });
  const k = makeKit(assets, { font: FONT });
  return { html: html(k, assets, pixelated), assetBytes: kitBytes(assets) };
}

async function main() {
  const { html: out, assetBytes } = await buildKitPlayable("heroes3");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index.html`, out);
  const kb = Buffer.byteLength(out, "utf8") / 1024;
  console.log(`assets: ${(assetBytes / 1024).toFixed(1)} KB`);
  console.log(`index.html: ${kb.toFixed(1)} KB (${(kb / 2048 * 100).toFixed(1)}% of 2MB)`);
  console.log(`-> ${OUT}/index.html`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
