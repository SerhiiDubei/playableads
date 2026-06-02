// Демонстрація: екрани зібрані ПОВНІСТЮ з рецептів «група@зона» (groups.ts) + бібли (catalog.ts).
// Жодного ad-hoc верстання — лише розкладки груп, які валідуються правилами.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { loadKit, makeKit, kitBytes, NINE, fontFace, type KitAssets } from "./kit/kit.js";
import { stageCss, stageJs } from "./kit/stage.js";
import { resolveLayout, zoneCss, OVERLAY_CSS, type ZoneSpec } from "./kit/layout.js";
import { composeScreen, type Recipe } from "./kit/groups.js";

const OUT = "test/recipes";
const ASSET_DIR = `${OUT}/assets`;
const ICONS = ["ic-settings", "ic-back", "ic-sound", "ic-plus", "ic-check", "ic-close"];
const KNIGHT_SRC = "out/prompt-lab/heroes3-knight/4-ip-anchored.png";
const FONT_FACE = fontFace("Cinzel", "src/assetgen/kit/cinzel-700.woff2");
const FONT = `"Cinzel",Georgia,serif`;

const TYPES = ["menu", "pick-hero", "endcard"];
const LAYOUTS: Record<string, ZoneSpec> = Object.fromEntries(TYPES.map((t) => [t, resolveLayout(t)]));
const ZONE_CSS = Object.values(LAYOUTS).map(zoneCss).join("");

// ── РЕЦЕПТИ: екран = група@зона. Правила груп (де/скільки/ієрархія/intent) перевіряються композитором.
const RECIPES: Recipe[] = [
  { id: "menu", type: "menu", placements: [
    { group: "currency", zone: "hud", items: [{ icon: "ic-plus", value: "1 250" }] },
    { group: "nav", zone: "hud", items: [{ icon: "ic-settings", onclick: "go('shop')" }] },
    { group: "logo", zone: "title", items: [{ label: "Realm of Valor" }] },
    { group: "menu", zone: "actions", items: [
      { label: "New Game", onclick: "go('shop')", level: "primary" },
      { label: "Battle" }, { label: "Shop", onclick: "go('shop')" }, { label: "Daily" },
      { label: "Options", level: "tertiary" }] },
  ] },
  { id: "shop", type: "pick-hero", placements: [
    { group: "nav", zone: "hud", items: [{ icon: "ic-back", onclick: "go('menu')" }] },
    { group: "currency", zone: "hud", items: [{ icon: "ic-plus", value: "1 250" }, { icon: "ic-check", value: "x8" }] },
    { group: "heading", zone: "title", items: [{ label: "Shop" }] },
    { group: "offers", zone: "stage", items: [
      { label: "Sword · 100", onclick: "buy()" }, { label: "Shield · 150", onclick: "buy()" }, { label: "Potion · 50", onclick: "buy()" }] },
    { group: "checkout", zone: "actions", items: [{ label: "Restore Lives", onclick: "go('endcard')", level: "primary" }] },
  ] },
  { id: "endcard", type: "endcard", placements: [
    { group: "nav", zone: "hud", items: [{ icon: "ic-back", onclick: "go('menu')" }] },
    { group: "heading", zone: "title", items: [{ label: "Realm of Valor" }] },
    { group: "hero", zone: "stage", items: [{ html: `<div class="hero big bg-knight"></div>` }] },
    { group: "checkout", zone: "actions", items: [
      { label: "Install", onclick: "cta()", level: "primary" }, { label: "Replay", onclick: "go('menu')", level: "tertiary" }] },
  ] },
];

const pageCss = `
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{font-family:${FONT}}
  .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transform:translateY(16px);transition:opacity .28s ease,transform .28s ease}
  .screen.active{opacity:1;visibility:visible;transform:none}
  .title{color:#ffe9b0;font-family:${FONT};font-weight:700;letter-spacing:1px;font-size:28px;text-align:center;
    text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
  /* грп = обгортка групи; напрям успадковує від зони (hud=row, actions=column) */
  .grp{display:flex;flex-direction:inherit;gap:9px;align-items:center;justify-content:center;min-height:0}
  /* у колонкових зонах грп заповнює висоту зони → кнопки стискаються flex'ом, як у прямій зоні */
  .zone-actions .grp,.zone-stage .grp{width:100%;height:100%}
  .zone-title .grp{width:100%}
  .zone .c-btn.block{width:100%}
  .zone .c-panel{width:100%}
  .hero{width:100%;height:62%;background-position:center bottom;background-repeat:no-repeat;background-size:contain;filter:drop-shadow(0 8px 12px #0009)}
  .hero.big{height:92%}
`;

function html(k: ReturnType<typeof makeKit>, a: KitAssets): string {
  const body = RECIPES.map((r, i) => composeScreen(r, k, LAYOUTS, i === 0)).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Recipes — group@zone composition</title>
<style>${FONT_FACE}${stageCss(a["bg-castle"].dataUri)}${pageCss}${ZONE_CSS}${OVERLAY_CSS}${k.css}
.bg-knight{background-image:url(${a["knight"].dataUri})}</style></head>
<body><div id="viewport"><div id="stage">${body}</div></div>
<script>
  var order=${JSON.stringify(RECIPES.map((r) => r.id))};var cur=order[0];
  function go(id){var a=document.getElementById(cur),b=document.getElementById(id);if(a)a.classList.remove('active');if(b)b.classList.add('active');cur=id;}
  function buy(){}
  function cta(){try{window.FbPlayableAd&&window.FbPlayableAd.onCTAClick();}catch(e){}}
  if(/zones/.test(location.search+location.hash))document.body.classList.add('show-zones');
</script>
<script>${stageJs()}</script></body></html>`;
}

export async function buildRecipes(styleId = "heroes3"): Promise<{ html: string; assetBytes: number }> {
  const src = `out/${styleId}`;
  const bgSrc = existsSync(`${src}/bg.png`) ? `${src}/bg.png` : `${src}/bg-castle.png`;
  const heroSrc = existsSync(`${src}/hero.png`) ? `${src}/hero.png` : KNIGHT_SRC;
  const assets = await loadKit(src, {
    keys: [...Object.keys(NINE), "banner", ...ICONS],
    extra: [{ key: "bg-castle", src: bgSrc, size: 680 }, { key: "knight", src: heroSrc, size: 520 }],
    writeDir: ASSET_DIR,
  });
  const k = makeKit(assets, { font: FONT });
  return { html: html(k, assets), assetBytes: kitBytes(assets) };
}

async function main() {
  const { html: out, assetBytes } = await buildRecipes("heroes3");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index.html`, out);
  const kb = Buffer.byteLength(out, "utf8") / 1024;
  console.log(`assets: ${(assetBytes / 1024).toFixed(1)} KB`);
  console.log(`index.html: ${kb.toFixed(1)} KB (${(kb / 2048 * 100).toFixed(1)}% of 2MB)`);
  console.log(`recipes: ${RECIPES.map((r) => r.id).join(", ")} (усі валідні)`);
  console.log(`-> ${OUT}/index.html`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
