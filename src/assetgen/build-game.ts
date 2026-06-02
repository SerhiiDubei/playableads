// СТРЕС-ТЕСТ: інтерактивний плейабл з простою грою (tap-to-attack).
// Процес: 1) FLOW (блупринт: функція+переходи) → 2) валідація графа → 3) RECIPES (група@зона) → 4) рендер+логіка.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { loadKit, makeKit, kitBytes, NINE, fontFace, type KitAssets } from "./kit/kit.js";
import { stageCss, stageJs } from "./kit/stage.js";
import { resolveLayout, zoneCss, OVERLAY_CSS, type ZoneSpec } from "./kit/layout.js";
import { composeScreen, type Recipe } from "./kit/groups.js";
import { validateFlow, flowDiagram, type Flow } from "./kit/flow.js";

const OUT = "test/game";
const ASSET_DIR = `${OUT}/assets`;
const ICONS = ["ic-settings", "ic-back", "ic-sound", "ic-plus", "ic-check", "ic-close"];
const KNIGHT_SRC = "out/prompt-lab/heroes3-knight/4-ip-anchored.png";
const FONT_FACE = fontFace("Cinzel", "src/assetgen/kit/cinzel-700.woff2");
const FONT = `"Cinzel",Georgia,serif`;

// ── 1. БЛУПРИНТ: що робить кожен екран і куди веде ──────────────────────────
const FLOW: Flow = {
  entry: "menu", cta: "win",
  screens: [
    { id: "menu", purpose: "Вхід: показати гру і повести в бій", archetype: "menu", scene: "world",
      transitions: [{ on: "New Game", to: "battle" }] },
    { id: "battle", purpose: "Геймплей: тапай дракона, поки HP не впаде до 0", archetype: "battle", scene: "focus", mechanic: "tap-to-attack",
      transitions: [{ on: "enemy defeated", to: "win" }] },
    { id: "win", purpose: "Винагорода + штовхнути на Install", archetype: "endcard", scene: "celebration",
      transitions: [{ on: "Install", to: "CTA" }, { on: "Replay", to: "menu" }] },
  ],
};

const TYPES = [...new Set(FLOW.screens.map((s) => s.archetype))];
const LAYOUTS: Record<string, ZoneSpec> = Object.fromEntries(TYPES.map((t) => [t, resolveLayout(t)]));
const ZONE_CSS = Object.values(LAYOUTS).map(zoneCss).join("");

// ── 3. РОЗКЛАДКИ: група@зона (креслимо вже за блупринтом) ────────────────────
const RECIPES: Recipe[] = [
  { id: "menu", type: "menu", placements: [
    { group: "currency", zone: "hud", items: [{ icon: "ic-plus", value: "1 250" }] },
    { group: "nav", zone: "hud", items: [{ icon: "ic-settings", onclick: "" }] },
    { group: "logo", zone: "title", items: [{ label: "Dragon Slayer" }] },
    { group: "menu", zone: "actions", items: [
      { label: "New Game", onclick: "go('battle')", level: "primary" },
      { label: "Heroes" }, { label: "Shop" }, { label: "Options", level: "tertiary" }] },
  ] },
  // ІГРОВИЙ екран: target (тап-ціль, primary у stage) + gauge (HP) у actions
  { id: "battle", type: "battle", placements: [
    { group: "nav", zone: "hud", items: [{ icon: "ic-back", onclick: "go('menu')" }] },
    { group: "currency", zone: "hud", items: [{ icon: "ic-check", value: "Lvl 1" }] },
    { group: "heading", zone: "title", items: [{ label: "Tap to attack!" }] },
    { group: "target", zone: "stage", items: [{ html: `<div class="hero bg-enemy enemy" onclick="hit()"></div>` }] },
    { group: "gauge", zone: "actions", items: [{ value: "100" }] },
  ] },
  { id: "win", type: "endcard", placements: [
    { group: "nav", zone: "hud", items: [{ icon: "ic-back", onclick: "go('menu')" }] },
    { group: "heading", zone: "title", items: [{ label: "Victory!" }] },
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
  .title{color:#ffe9b0;font-family:${FONT};font-weight:700;letter-spacing:1px;font-size:26px;text-align:center;text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
  .grp{display:flex;flex-direction:inherit;gap:10px;align-items:center;justify-content:center;min-height:0}
  .zone-actions .grp,.zone-stage .grp{width:100%;height:100%}
  .zone-title .grp{width:100%}
  .zone .c-btn.block{width:100%}
  .hero{width:100%;height:100%;background-position:center bottom;background-repeat:no-repeat;background-size:contain;filter:drop-shadow(0 8px 12px #0009)}
  .hero.big{height:92%}
  /* ігрова ціль: натискається, реагує на удар */
  .enemy{cursor:pointer;transition:transform .08s}
  .enemy:active{transform:scale(.96)}
  .enemy.hit{animation:enemyHit .28s ease}
  @keyframes enemyHit{0%{transform:translateX(0)}20%{transform:translateX(-9px) rotate(-2deg)}40%{transform:translateX(8px) rotate(2deg)}60%{transform:translateX(-5px)}100%{transform:translateX(0)}}
  .tap-hint{position:absolute;left:0;right:0;bottom:14%;text-align:center;color:#ffe9b0;font-size:13px;letter-spacing:1px;opacity:.85;animation:hintPulse 1.1s ease-in-out infinite;pointer-events:none}
  @keyframes hintPulse{0%,100%{opacity:.4}50%{opacity:1}}
`;

function html(k: ReturnType<typeof makeKit>, a: KitAssets): string {
  const body = RECIPES.map((r, i) => composeScreen(r, k, LAYOUTS, i === 0)).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Dragon Slayer — interactive playable</title>
<style>${FONT_FACE}${stageCss(a["bg-castle"].dataUri)}${pageCss}${ZONE_CSS}${OVERLAY_CSS}${k.css}
.bg-knight{background-image:url(${a["knight"].dataUri})}
.bg-enemy{background-image:url(${a["enemy"].dataUri})}</style></head>
<body><div id="viewport"><div id="stage">${body}</div></div>
<script>window.FbPlayableAd=window.FbPlayableAd||{onCTAClick:function(){try{console.log("[FbPlayableAd] onCTAClick (stub)")}catch(e){}}};</script>
<script>
  var order=${JSON.stringify(RECIPES.map((r) => r.id))};var cur=order[0];
  function go(id){var a=document.getElementById(cur),b=document.getElementById(id);if(a)a.classList.remove('active');if(b)b.classList.add('active');cur=id;
    if(id==='battle'){hp=100;var f=document.querySelector('#battle .fill');if(f)f.style.width='100%';}}
  function cta(){try{window.FbPlayableAd.onCTAClick();}catch(e){}}
  // ── ІГРОВА ЛОГІКА (mechanic: tap-to-attack) ──
  var hp=100;
  function hit(){
    if(cur!=='battle')return;
    hp=Math.max(0,hp-20);
    var f=document.querySelector('#battle .fill');if(f)f.style.width=hp+'%';
    var e=document.querySelector('#battle .enemy');if(e){e.classList.remove('hit');void e.offsetWidth;e.classList.add('hit');}
    if(hp<=0)setTimeout(function(){go('win');},320);
  }
  if(/zones/.test(location.search+location.hash))document.body.classList.add('show-zones');
</script>
<script>${stageJs()}</script></body></html>`;
}

export async function buildGame(styleId = "heroes3"): Promise<{ html: string; assetBytes: number }> {
  // 2. ВАЛІДАЦІЯ блупринту перед будь-яким рендером
  const flowErrs = validateFlow(FLOW);
  if (flowErrs.length) throw new Error("FLOW INVALID:\n  " + flowErrs.join("\n  "));
  console.log("FLOW blueprint:\n" + flowDiagram(FLOW) + "\n");

  const src = `out/${styleId}`;
  const bgSrc = existsSync(`${src}/bg.png`) ? `${src}/bg.png` : `${src}/bg-castle.png`;
  const heroSrc = existsSync(`${src}/hero.png`) ? `${src}/hero.png` : KNIGHT_SRC;
  const enemySrc = existsSync("out/diablo2/hero.png") ? "out/diablo2/hero.png" : heroSrc;
  const assets = await loadKit(src, {
    keys: [...Object.keys(NINE), "banner", ...ICONS],
    extra: [
      { key: "bg-castle", src: bgSrc, size: 680 },
      { key: "knight", src: heroSrc, size: 520 },
      { key: "enemy", src: enemySrc, size: 520 },
    ],
    writeDir: ASSET_DIR,
  });
  const k = makeKit(assets, { font: FONT });
  return { html: html(k, assets), assetBytes: kitBytes(assets) };
}

async function main() {
  const { html: out, assetBytes } = await buildGame("heroes3");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index.html`, out);
  const kb = Buffer.byteLength(out, "utf8") / 1024;
  console.log(`assets: ${(assetBytes / 1024).toFixed(1)} KB`);
  console.log(`index.html: ${kb.toFixed(1)} KB (${(kb / 2048 * 100).toFixed(1)}% of 2MB)`);
  console.log(`-> ${OUT}/index.html`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
