// Експеримент: 5 екранів = 5 різних художніх підходів до організації,
// але всі лягають у СПІЛЬНУ систему зон (kit/layout). Мета — показати, що зонування
// тримає різні композиційні філософії на різних ассетах.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { loadKit, makeKit, kitBytes, NINE, fontFace, type KitAssets } from "./kit/kit.js";
import { stageCss, stageJs } from "./kit/stage.js";
import { resolveLayout, zoneCss, zone, zonesOverlay, OVERLAY_CSS, type Layout } from "./kit/layout.js";

const OUT = "test/experiments";
const ASSET_DIR = `${OUT}/assets`;
const ICONS = ["ic-settings", "ic-back", "ic-sound", "ic-plus", "ic-check", "ic-close"];
const KNIGHT_SRC = "out/prompt-lab/heroes3-knight/4-ip-anchored.png";

const FONT_FACE = fontFace("Cinzel", "src/assetgen/kit/cinzel-700.woff2");
const FONT = `"Cinzel",Georgia,serif`;

const TYPES = ["immersive", "focal", "split", "grid", "dense"] as const;
const LAYOUTS: Record<string, Layout> = Object.fromEntries(TYPES.map((t) => [t, resolveLayout(t)]));
const ZONE_CSS = Object.values(LAYOUTS).map(zoneCss).join("");

const pageCss = `
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{font-family:${FONT}}
  .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transform:translateY(16px);
    transition:opacity .28s ease,transform .28s ease}
  .screen.active{opacity:1;visibility:visible;transform:none}
  .title{color:#ffe9b0;font-weight:700;letter-spacing:1px;font-size:26px;text-align:center;
    text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
  .sub{color:#d8c49a;font-size:13px;text-align:center}
  .stars{color:#ffd54a;font-size:20px;letter-spacing:3px}
  /* герой на весь контейнер (immersive/split) */
  .hero{width:100%;height:100%;background-position:center bottom;background-repeat:no-repeat;background-size:contain;
    filter:drop-shadow(0 8px 12px #0009)}
  /* мала мініатюра (картки/маскот) */
  .thumb{width:72px;height:72px;background-position:center;background-repeat:no-repeat;background-size:contain}
  .grid2{display:grid;grid-template-columns:repeat(2,156px);justify-content:center;gap:12px;width:100%}
  .tile{display:flex;flex-direction:column;align-items:center;gap:4px}
  .zone .c-btn.block{width:100%}
  .zone .c-panel{width:100%}
`;

function screen(id: string, type: string, active: boolean, zones: string): string {
  return `<section class="screen${active ? " active" : ""}" id="${id}" data-type="${type}">${zonesOverlay(LAYOUTS[type])}${zones}</section>`;
}

function screens(k: ReturnType<typeof makeKit>): string {
  // картка героя для grid-підходу (kit.panel + мініатюра-шар)
  const tile = (bg: string, name: string) =>
    k.panel(`<div class="tile"><div class="thumb ${bg}"></div><div class="sub gold">${name}</div></div>`, "text-align:center");

  return [
    // 1 — IMMERSIVE: арт на весь екран, UI мінімальний, 1 дія
    screen("immersive", "immersive", true,
      zone("hud", `${k.iconBtn("ic-back", "next()")}${k.iconBtn("ic-settings", "")}`) +
      zone("title", `<div class="title">The Last Knight</div>`) +
      zone("stage", `<div class="hero bg-knight"></div>`) +
      zone("actions", k.button("Play Now", "next()", { block: true, level: "primary" }))),

    // 2 — FOCAL: лого по центру, повітря, фокус на старті
    screen("focal", "focal", false,
      zone("hud", `<span></span>${k.iconBtn("ic-settings", "")}`) +
      zone("title", `<div style="width:74%;margin:0 auto">${k.banner("Realm")}</div>`) +
      zone("stage", `<div class="stars">★★★★★</div><div class="sub" style="margin-top:8px">Begin your quest</div>`) +
      zone("actions",
        k.button("Start", "next()", { block: true, level: "primary" }) +
        k.button("Settings", "", { block: true, level: "tertiary" }))),

    // 3 — SPLIT: дашборд — валюта зверху, портрет + статпанель, стек дій
    screen("split", "split", false,
      zone("hud", `${k.pill("ic-plus", "1 250")}${k.pill("ic-check", "x8")}`) +
      zone("title", `<div class="title">Sir Roland</div>`) +
      zone("stage", `<div class="hero bg-hero2"></div>` +
        k.panel(`<div class="gold" style="text-align:center;font-size:15px;margin-bottom:6px">Knight · Lvl 7</div>
          <div class="sub" style="text-align:left;margin:2px 2px 2px">HP</div>${k.bar(80)}
          <div class="sub" style="text-align:left;margin:7px 2px 2px">XP</div>${k.bar(45)}`)) +
      zone("actions",
        k.button("Train", "", { block: true }) +
        k.button("Equip", "", { block: true }) +
        k.button("Fight", "next()", { block: true, level: "primary" }))),

    // 4 — GRID: галерея вибору 2×2 (3 різні герої + locked), 1 CTA
    screen("grid", "grid", false,
      zone("hud", `${k.iconBtn("ic-back", "")}${k.iconBtn("ic-settings", "")}`) +
      zone("title", `<div class="title">Choose Champion</div>`) +
      zone("stage", `<div class="grid2">
        ${tile("bg-knight", "Roland")}
        ${tile("bg-hero2", "Dread")}
        ${tile("bg-hero3", "Pixel")}
        ${k.panel(`<div class="tile">${k.iconBtn("ic-close", "")}<div class="sub">Locked</div></div>`, "text-align:center")}
      </div>`) +
      zone("actions", k.button("Choose", "next()", { block: true, level: "primary" }))),

    // 5 — DENSE: аркадне меню, стек із 6 кнопок (ієрархія: Play primary / Quit tertiary)
    screen("dense", "dense", false,
      zone("hud", `${k.pill("ic-plus", "1 250")}${k.iconBtn("ic-settings", "")}`) +
      zone("title", `<div class="title">Main Menu</div>`) +
      zone("stage", `<div class="thumb bg-hero3" style="margin:0 auto;width:84px;height:84px"></div>`) +
      zone("actions",
        k.button("Play", "next()", { block: true, level: "primary" }) +
        k.button("Levels", "", { block: true }) +
        k.button("Shop", "", { block: true }) +
        k.button("Daily", "", { block: true }) +
        k.button("Friends", "", { block: true }) +
        k.button("Quit", "", { block: true, level: "tertiary" }))),
  ].join("");
}

function html(k: ReturnType<typeof makeKit>, a: KitAssets): string {
  const body = screens(k);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Layout experiments — 5 approaches × zones</title>
<style>${FONT_FACE}${stageCss(a["bg-castle"].dataUri)}${pageCss}${ZONE_CSS}${OVERLAY_CSS}${k.css}
.bg-knight{background-image:url(${a["knight"].dataUri})}
.bg-hero2{background-image:url(${a["hero2"].dataUri})}
.bg-hero3{background-image:url(${a["hero3"].dataUri})}</style></head>
<body><div id="viewport"><div id="stage">${body}</div></div>
<script>
  var order=${JSON.stringify(TYPES)};var cur=order[0];
  function go(id){var a=document.getElementById(cur),b=document.getElementById(id);
    if(a)a.classList.remove('active');if(b)b.classList.add('active');cur=id;}
  function next(){go(order[(order.indexOf(cur)+1)%order.length]);}
  if(/zones/.test(location.search+location.hash))document.body.classList.add('show-zones');
</script>
<script>${stageJs()}</script></body></html>`;
}

export async function buildExperiments(styleId = "heroes3"): Promise<{ html: string; assetBytes: number }> {
  const src = `out/${styleId}`;
  const bgSrc = existsSync(`${src}/bg.png`) ? `${src}/bg.png` : `${src}/bg-castle.png`;
  const heroSrc = existsSync(`${src}/hero.png`) ? `${src}/hero.png` : KNIGHT_SRC;
  const assets = await loadKit(src, {
    keys: [...Object.keys(NINE), "banner", ...ICONS],
    extra: [
      { key: "bg-castle", src: bgSrc, size: 680 },
      { key: "knight", src: heroSrc, size: 520 },
      { key: "hero2", src: existsSync("out/diablo2/hero.png") ? "out/diablo2/hero.png" : heroSrc, size: 520 },
      { key: "hero3", src: existsSync("out/pixelart/hero.png") ? "out/pixelart/hero.png" : heroSrc, size: 520 },
    ],
    writeDir: ASSET_DIR,
  });
  const k = makeKit(assets, { font: FONT });
  return { html: html(k, assets), assetBytes: kitBytes(assets) };
}

async function main() {
  const { html: out, assetBytes } = await buildExperiments("heroes3");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index.html`, out);
  const kb = Buffer.byteLength(out, "utf8") / 1024;
  console.log(`assets: ${(assetBytes / 1024).toFixed(1)} KB`);
  console.log(`index.html: ${kb.toFixed(1)} KB (${(kb / 2048 * 100).toFixed(1)}% of 2MB)`);
  console.log(`screens: ${TYPES.join(", ")}`);
  console.log(`-> ${OUT}/index.html`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
