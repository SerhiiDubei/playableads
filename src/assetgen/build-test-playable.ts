import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { loadKit, makeKit, kitBytes, NINE, fontFace, type KitAssets } from "./kit/kit.js";
import { stageCss, stageJs } from "./kit/stage.js";

const OUT = "test/menu-playable";
const ASSET_DIR = `${OUT}/assets`;
const ICONS = ["ic-settings", "ic-back", "ic-sound", "ic-plus", "ic-check", "ic-close"];
const KNIGHT_SRC = "out/prompt-lab/heroes3-knight/4-ip-anchored.png";

const FONT_FACE = fontFace("Cinzel", "src/assetgen/kit/cinzel-700.woff2");
const FONT = `"Cinzel",Georgia,serif`;

// Усе у фіксованих px design-координатах (400×860). Адаптивність робить stage-scale.
const pageCss = `
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{font-family:${FONT}}
  .screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
    padding:84px 24px 28px;opacity:0;visibility:hidden;transform:translateY(16px);
    transition:opacity .28s ease,transform .28s ease}
  .screen.active{opacity:1;visibility:visible;transform:none}
  .title{color:#ffe9b0;font-family:${FONT};font-weight:700;letter-spacing:1px;font-size:30px;text-align:center;
    text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
  .sub{color:#d8c49a;font-size:13px}
  .topbar{position:absolute;top:16px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:0 18px;z-index:5}
  .stack{display:flex;flex-direction:column;align-items:stretch;gap:13px;width:320px}
  .knight{height:360px;filter:drop-shadow(0 8px 12px #0009)}
  #stage .c-banner{max-width:344px}
`;

function screens(k: ReturnType<typeof makeKit>, a: KitAssets): string {
  const knight = a["knight"].dataUri;
  return `
  <section class="screen active" id="menu">
    <div class="topbar">${k.pill("ic-plus", "1 250")}${k.iconBtn("ic-settings", "go('options')")}</div>
    ${k.banner("Realm of Valor")}
    <div class="stack">
      ${k.button("New Game", "go('game')", { block: true, level: "primary" })}
      ${k.button("Battle", "go('battle')", { block: true })}
      ${k.button("Shop", "go('shop')", { block: true })}
      ${k.button("Options", "go('options')", { block: true })}
      ${k.button("Exit", "endCard()", { block: true, level: "tertiary" })}
    </div>
  </section>

  <section class="screen" id="game">
    <div class="topbar">${k.iconBtn("ic-back", "go('menu')")}<span></span></div>
    <div class="title">Choose Your Hero</div>
    <img class="knight" src="${knight}">
    ${k.panel(`<div class="gold" style="font-size:18px;text-align:center">Sir Roland</div>
      <div class="sub" style="margin:4px 0 8px;text-align:center">Knight · Level 7</div>${k.bar(65)}`, "width:320px")}
    <div class="stack">${k.button("Begin Quest", "go('battle')", { block: true, level: "primary" })}</div>
  </section>

  <section class="screen" id="battle">
    <div class="topbar">${k.iconBtn("ic-back", "go('menu')")}<span></span></div>
    <div class="title">Battle</div>
    ${k.panel(`<div class="sub" style="text-align:center;padding:6px 2px">Choose your foe and claim victory!</div>`, "width:320px")}
    <div class="stack">${k.button("Fight", "endCard()", { block: true, level: "primary" })}</div>
  </section>

  <section class="screen" id="shop">
    <div class="topbar">${k.iconBtn("ic-back", "go('menu')")}<span></span></div>
    <div class="title">Shop</div>
    ${k.panel(`<div class="k-row" style="justify-content:center">${k.pill("ic-plus", "x3")}${k.pill("ic-check", "x1")}</div>`, "width:320px")}
    <div class="stack">${k.button("Buy", "go('menu')", { block: true, level: "primary" })}</div>
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
}

function html(k: ReturnType<typeof makeKit>, a: KitAssets, pixelated = false): string {
  const pixCss = pixelated ? "img{image-rendering:pixelated}#viewport{image-rendering:pixelated}" : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Realm of Valor — test playable</title>
<style>${FONT_FACE}${stageCss(a["bg-castle"].dataUri)}${pageCss}${k.css}${pixCss}</style></head>
<body><div id="viewport"><div id="stage">${screens(k, a)}</div></div>
<script>window.FbPlayableAd=window.FbPlayableAd||{onCTAClick:function(){try{console.log("[FbPlayableAd] onCTAClick (stub)")}catch(e){}}};</script>
<script>
  var cur='menu';
  function go(id){var a=document.getElementById(cur),b=document.getElementById(id);
    if(a)a.classList.remove('active');if(b)b.classList.add('active');cur=id;}
  function cta(){try{window.FbPlayableAd.onCTAClick();}catch(e){}}
  function endCard(){cta();go('battle');}
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
