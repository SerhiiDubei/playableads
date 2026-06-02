// Drag-to-connect "Arcane Gems" — 3 рівні (стани одного екрана puzzle), scene-фони, toast-переходи.
// Процес: FLOW (purpose+scene+mechanic) → validateFlow → RECIPES (група@зона) → рівні+drag (scale-aware).
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { loadKit, makeKit, kitBytes, NINE, fontFace, type KitAssets } from "./kit/kit.js";
import { stageCss, stageJs, DESIGN } from "./kit/stage.js";
import { resolveLayout, zoneCss, OVERLAY_CSS, type ZoneSpec } from "./kit/layout.js";
import { composeScreen, type Recipe } from "./kit/groups.js";
import { validateFlow, flowDiagram, type Flow } from "./kit/flow.js";

const OUT = "test/connect";
const ASSET_DIR = `${OUT}/assets`;
const ICONS = ["ic-settings", "ic-back", "ic-sound", "ic-plus", "ic-check", "ic-close"];
const KNIGHT_SRC = "out/prompt-lab/heroes3-knight/4-ip-anchored.png";
const FONT_FACE = fontFace("Cinzel", "src/assetgen/kit/cinzel-700.woff2");
const FONT = `"Cinzel",Georgia,serif`;
const ALLCOLORS = ["red", "blue", "green", "purple"];

// 3 рівні — стани екрана puzzle. sockets можуть стояти в іншому порядку, ніж gems (це і є складність).
const LEVELS = [
  { gems: ["red", "blue", "green"], sockets: ["red", "blue", "green"] },
  { gems: ["red", "blue", "green", "purple"], sockets: ["green", "purple", "red", "blue"] },
  { gems: ["red", "blue", "green", "purple"], sockets: ["purple", "green", "blue", "red"] },
];

// ── 1. БЛУПРИНТ (тепер зі scene) ──
// entry = puzzle: плейабл одразу ГРАЄТЬСЯ (best practice: хук у перші 3с, не меню-прокладка).
const FLOW: Flow = {
  entry: "puzzle", cta: "win",
  screens: [
    { id: "puzzle", purpose: "Геймплей одразу: 3 рівні, тягни гем у сокет його кольору", archetype: "puzzle", scene: "focus", mechanic: "drag-to-connect",
      transitions: [{ on: "all levels cleared", to: "win" }, { on: "back", to: "menu" }] },
    { id: "menu", purpose: "Опційне меню (доступне через back)", archetype: "menu", scene: "world", transitions: [{ on: "Play", to: "puzzle" }] },
    { id: "win", purpose: "Перемога + нагорода + Install", archetype: "endcard", scene: "celebration", transitions: [{ on: "Install", to: "CTA" }, { on: "Replay", to: "puzzle" }] },
  ],
};
const SCENE = Object.fromEntries(FLOW.screens.map((s) => [s.id, s.scene]));

const TYPES = [...new Set(FLOW.screens.map((s) => s.archetype))];
const LAYOUTS: Record<string, ZoneSpec> = Object.fromEntries(TYPES.map((t) => [t, resolveLayout(t)]));
const ZONE_CSS = Object.values(LAYOUTS).map(zoneCss).join("");

// ── 3. РОЗКЛАДКИ (puzzle: ряди порожні — JS заповнює рівнями через DOM) ──
const RECIPES: Recipe[] = [
  { id: "menu", type: "menu", placements: [
    { group: "currency", zone: "hud", items: [{ icon: "ic-plus", value: "1 250" }] },
    { group: "nav", zone: "hud", items: [{ icon: "ic-settings", onclick: "" }] },
    { group: "logo", zone: "title", items: [{ label: "Arcane Gems" }] },
    { group: "menu", zone: "actions", items: [
      { label: "Play", onclick: "go('puzzle')", level: "primary" },
      { label: "How to play" }, { label: "Options", level: "tertiary" }] },
  ] },
  { id: "puzzle", type: "puzzle", placements: [
    { group: "nav", zone: "hud", items: [{ icon: "ic-back", onclick: "go('menu')" }] },
    { group: "currency", zone: "hud", items: [{ icon: "ic-plus", value: "1 250" }] },
    { group: "heading", zone: "title", items: [{ html: `<div class="title">Match the Gems</div>` }] },
    { group: "progress", zone: "title", items: [{ value: String(LEVELS.length) }] },
    { group: "slots", zone: "stage", items: [] },
    { group: "pieces", zone: "stage", items: [] },
  ] },
  { id: "win", type: "endcard", placements: [
    { group: "nav", zone: "hud", items: [{ icon: "ic-back", onclick: "go('menu')" }] },
    { group: "heading", zone: "title", items: [{ html: `<div class="title">All Cleared!</div><div class="stars">★★★</div>` }] },
    { group: "hero", zone: "stage", items: [{ html: `<div class="hero big bg-knight"></div>` }] },
    { group: "checkout", zone: "actions", items: [
      { label: "Install", onclick: "cta()", level: "primary" }, { label: "Replay", onclick: "go('puzzle')", level: "tertiary" }] },
  ] },
];

const pageCss = `
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{font-family:${FONT}}
  /* фон-шар + scrim (обробка на scene) — окремо від UI, щоб filter не чіпав інтерактив */
  #bg{position:fixed;inset:0;background-position:center;background-size:cover;background-repeat:no-repeat;transition:filter .45s ease,transform .45s ease}
  #scrim{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 35%,#000 140%);opacity:0;transition:opacity .45s ease}
  .scene-world #bg{filter:none;transform:none}.scene-world #scrim{opacity:0}
  .scene-focus #bg{filter:brightness(.5) saturate(.8) blur(2px);transform:scale(1.04)}.scene-focus #scrim{opacity:.78}
  .scene-celebration #bg{filter:brightness(1.12) saturate(1.15);transform:scale(1.05)}.scene-celebration #scrim{opacity:.12}
  .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transform:translateY(16px);transition:opacity .28s ease,transform .28s ease}
  .screen.active{opacity:1;visibility:visible;transform:none}
  .title{color:#ffe9b0;font-family:${FONT};font-weight:700;letter-spacing:1px;font-size:26px;text-align:center;text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
  .grp{display:flex;flex-direction:inherit;gap:10px;align-items:center;justify-content:center;min-height:0}
  .zone-actions .grp{width:100%;height:100%}
  .zone-stage .grp-hero{width:100%;height:100%}
  .zone-title .grp{width:100%}
  .zone .c-btn.block{width:100%}
  .hero{width:100%;height:100%;background-position:center bottom;background-repeat:no-repeat;background-size:contain;filter:drop-shadow(0 8px 12px #0009)}
  .hero.big{height:92%}
  /* stepper (рівні) */
  .stepper{display:flex;gap:9px;justify-content:center;margin-top:8px}
  .stepper i{width:11px;height:11px;border-radius:50%;background:#0006;border:1px solid #ffe08a66;transition:.25s}
  .stepper i.on{background:#ffe08a;box-shadow:0 0 9px #ffe08a;border-color:#ffe08a}
  /* drag-гра */
  .grp-slots,.grp-pieces{flex-direction:row;flex-wrap:nowrap;gap:12px;height:auto;width:100%}
  .slot{width:78px;height:78px;background:center/contain no-repeat;filter:drop-shadow(0 4px 6px #0008)}
  .slot.filled{filter:drop-shadow(0 0 12px #ffe08a) saturate(1.2)}
  .piece{width:58px;height:58px;background:center/contain no-repeat;cursor:grab;touch-action:none;filter:drop-shadow(0 5px 7px #0009);will-change:transform}
  .piece:not(.connected){animation:bob 1.6s ease-in-out infinite}
  .piece.dragging{cursor:grabbing;z-index:20;animation:none}
  .piece.connected{cursor:default;animation:none}
  @keyframes bob{0%,100%{filter:drop-shadow(0 5px 7px #0009)}50%{filter:drop-shadow(0 9px 10px #0009) brightness(1.13)}}
  /* toast (перехід між рівнями) */
  #toast{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%) scale(.85);padding:14px 26px;border-radius:14px;
    background:#1a1206ee;border:2px solid #ffe08a;color:#ffe9b0;font-weight:700;font-size:20px;letter-spacing:.5px;
    box-shadow:0 8px 30px #000a,0 0 22px #ffe08a55;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;white-space:nowrap;z-index:60}
  #toast.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
  .stars{color:#ffd54a;font-size:22px;letter-spacing:4px;text-align:center;text-shadow:0 0 12px #ffd54a88}
  /* навчальний жест (рука) — показує перший drag, зникає на першому хваті */
  #hand{position:absolute;left:0;top:0;font-size:38px;pointer-events:none;opacity:0;z-index:55;
    filter:drop-shadow(0 3px 5px #000a);transition:opacity .3s;will-change:transform}
`;

function html(k: ReturnType<typeof makeKit>, a: KitAssets): string {
  const body = RECIPES.map((r) => composeScreen(r, k, LAYOUTS, r.id === FLOW.entry)).join("");
  const cbg = (c: string) => `.s-${c}{background-image:url(${a["socket-" + c].dataUri})}.p-${c}{background-image:url(${a["gem-" + c].dataUri})}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Arcane Gems — drag to connect (3 levels)</title>
<style>${FONT_FACE}${stageCss()}${pageCss}${ZONE_CSS}${OVERLAY_CSS}${k.css}
#bg{background-image:url(${a["bg-castle"].dataUri})}
.bg-knight{background-image:url(${a["knight"].dataUri})}
${ALLCOLORS.map(cbg).join("\n")}</style></head>
<body><div id="viewport"><div id="bg"></div><div id="scrim"></div><div id="stage">${body}<div id="toast"></div><div id="hand">👆</div></div></div>
<script>window.FbPlayableAd=window.FbPlayableAd||{onCTAClick:function(){try{console.log("[FbPlayableAd] onCTAClick (stub)")}catch(e){}}};</script>
<script>
  var cur=${JSON.stringify(FLOW.entry)};
  var SCENE=${JSON.stringify(SCENE)};
  function setScene(id){document.getElementById('viewport').className='scene-'+(SCENE[id]||'world');}
  function go(id){var a=document.getElementById(cur),b=document.getElementById(id);if(a)a.classList.remove('active');if(b)b.classList.add('active');cur=id;setScene(id);
    if(id==='puzzle'){renderLevel(0);showHint();}
    if(id==='win')setTimeout(function(){toast('Reward: 500 Gold!');},350);}
  function cta(){try{window.FbPlayableAd.onCTAClick();}catch(e){}}

  // ── РІВНІ (DOM-методи, без innerHTML) ──
  var LEVELS=${JSON.stringify(LEVELS)};
  var level=0, matched=0, drag=null;
  function mkSlot(c){var el=document.createElement('div');el.className='slot s-'+c;el.dataset.color=c;return el;}
  function mkPiece(c){var el=document.createElement('div');el.className='piece p-'+c;el.dataset.color=c;
    el.addEventListener('mousedown',grab);el.addEventListener('touchstart',grab,{passive:false});return el;}
  function fill(box,colors,mk){while(box.firstChild)box.removeChild(box.firstChild);colors.forEach(function(c){box.appendChild(mk(c));});}
  function updateStepper(i){var st=document.querySelector('#puzzle .stepper');if(!st)return;
    [].forEach.call(st.children,function(d,k){d.className=k<=i?'on':'';});}
  function renderLevel(i){level=i;matched=0;var L=LEVELS[i];
    fill(document.querySelector('#puzzle .grp-slots'),L.sockets,mkSlot);
    fill(document.querySelector('#puzzle .grp-pieces'),L.gems,mkPiece);
    updateStepper(i);}
  function toast(t){var el=document.getElementById('toast');el.textContent=t;el.classList.add('show');
    clearTimeout(el._h);el._h=setTimeout(function(){el.classList.remove('show');},900);}
  // навчальний жест: рука програє перший drag (gem→socket), зникає на першому хваті
  function showHint(){if(level!==0)return;var hand=document.getElementById('hand');
    var piece=document.querySelector('#puzzle .grp-pieces .piece');if(!piece)return;
    var slot=[].slice.call(document.querySelectorAll('#puzzle .slot')).filter(function(s){return s.dataset.color===piece.dataset.color;})[0];if(!slot)return;
    var st=document.getElementById('stage').getBoundingClientRect(),sc=scale();
    function loc(el){var r=el.getBoundingClientRect();return {x:(r.left+r.width/2-st.left)/sc,y:(r.top+r.height/2-st.top)/sc};}
    var g=loc(piece),s=loc(slot),dx=s.x-g.x,dy=s.y-g.y;
    hand.style.left=g.x+'px';hand.style.top=g.y+'px';hand.style.opacity='1';
    if(hand._a)hand._a.cancel();
    hand._a=hand.animate([
      {transform:'translate(-28%,-8%) translate(0px,0px) scale(1)',opacity:1,offset:0},
      {transform:'translate(-28%,-8%) translate(0px,0px) scale(.78)',opacity:1,offset:.12},
      {transform:'translate(-28%,-8%) translate('+dx+'px,'+dy+'px) scale(.86)',opacity:1,offset:.6},
      {transform:'translate(-28%,-8%) translate('+dx+'px,'+dy+'px) scale(.86)',opacity:1,offset:.78},
      {transform:'translate(-28%,-8%) translate('+dx+'px,'+dy+'px) scale(.86)',opacity:0,offset:1}
    ],{duration:2000,iterations:Infinity,easing:'ease-in-out'});}
  function hideHint(){var h=document.getElementById('hand');h.style.opacity='0';if(h._a){h._a.cancel();h._a=null;}}

  // ── DRAG (scale-aware: рух курсора / масштаб #stage) ──
  function scale(){return Math.min(innerWidth/${DESIGN.W},innerHeight/${DESIGN.H});}
  function pt(e){var t=e.touches&&e.touches[0];return {x:t?t.clientX:e.clientX,y:t?t.clientY:e.clientY};}
  function grab(e){var el=e.currentTarget;if(el.classList.contains('connected'))return;hideHint();
    var p=pt(e);drag={el:el,sx:p.x,sy:p.y,bx:parseFloat(el.dataset.tx||0),by:parseFloat(el.dataset.ty||0)};
    el.classList.add('dragging');e.preventDefault();}
  function move(e){if(!drag)return;var p=pt(e),sc=scale();
    var tx=drag.bx+(p.x-drag.sx)/sc,ty=drag.by+(p.y-drag.sy)/sc;
    drag.el.dataset.tx=tx;drag.el.dataset.ty=ty;drag.el.style.transform='translate('+tx+'px,'+ty+'px) scale(1.12)';e.preventDefault();}
  function drop(e){if(!drag)return;var el=drag.el;el.classList.remove('dragging');var sc=scale();
    var pr=el.getBoundingClientRect(),cx=pr.left+pr.width/2,cy=pr.top+pr.height/2,hit=null;
    document.querySelectorAll('#puzzle .slot:not(.filled)').forEach(function(s){var r=s.getBoundingClientRect();
      if(cx>r.left&&cx<r.right&&cy>r.top&&cy<r.bottom)hit=s;});
    if(hit&&hit.dataset.color===el.dataset.color){
      var r=hit.getBoundingClientRect();
      var tx=parseFloat(el.dataset.tx)+(r.left+r.width/2-cx)/sc, ty=parseFloat(el.dataset.ty)+(r.top+r.height/2-cy)/sc;
      var base='translate('+tx+'px,'+ty+'px) scale(.8)';
      el.dataset.tx=tx;el.dataset.ty=ty;el.style.transform=base;
      el.classList.add('connected');hit.classList.add('filled');matched++;
      // juice: фішка «пружинить» у гніздо, сокет пульсує
      el.animate([{transform:'translate('+tx+'px,'+ty+'px) scale(1.25)'},{transform:base}],{duration:300,easing:'cubic-bezier(.34,1.56,.64,1)'});
      hit.animate([{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:340,easing:'cubic-bezier(.34,1.56,.64,1)'});
      if(matched>=LEVELS[level].gems.length){
        toast('Level '+(level+1)+' cleared!');
        if(level+1<LEVELS.length)setTimeout(function(){renderLevel(level+1);},950);
        else setTimeout(function(){go('win');},950);
      }
    }else{el.dataset.tx=0;el.dataset.ty=0;el.style.transform='';
      // juice: хибний дроп — тряска + червоний спалах
      el.animate([{transform:'translateX(0)'},{transform:'translateX(-9px)'},{transform:'translateX(8px)'},{transform:'translateX(-5px)'},{transform:'translateX(0)'}],{duration:300});
      el.animate([{filter:'drop-shadow(0 0 11px #ff5a5a) brightness(1.25)'},{filter:'drop-shadow(0 5px 7px #0009)'}],{duration:420});}
    drag=null;e.preventDefault();}
  addEventListener('mousemove',move);addEventListener('mouseup',drop);
  addEventListener('touchmove',move,{passive:false});addEventListener('touchend',drop);
  setScene(cur);
  // старт одразу в грі (entry=puzzle): заповнити 1-й рівень і показати навчальний жест
  if(cur==='puzzle'){renderLevel(0);setTimeout(showHint,120);}
  if(/zones/.test(location.search+location.hash))document.body.classList.add('show-zones');
</script>
<script>${stageJs()}</script></body></html>`;
}

export async function buildConnect(styleId = "heroes3"): Promise<{ html: string; assetBytes: number }> {
  const flowErrs = validateFlow(FLOW);
  if (flowErrs.length) throw new Error("FLOW INVALID:\n  " + flowErrs.join("\n  "));
  console.log("FLOW blueprint:\n" + flowDiagram(FLOW) + "\n");

  const src = `out/${styleId}`;
  const bgSrc = existsSync(`${src}/bg.png`) ? `${src}/bg.png` : `${src}/bg-castle.png`;
  const heroSrc = existsSync(`${src}/hero.png`) ? `${src}/hero.png` : KNIGHT_SRC;
  const gameAssets = ALLCOLORS.flatMap((c) => [
    { key: `gem-${c}`, src: `out/connect/gem-${c}.png`, size: 256 },
    { key: `socket-${c}`, src: `out/connect/socket-${c}.png`, size: 320 },
  ]);
  const assets = await loadKit(src, {
    keys: [...Object.keys(NINE), "banner", ...ICONS],
    extra: [
      { key: "bg-castle", src: bgSrc, size: 760 },
      { key: "knight", src: heroSrc, size: 520 },
      ...gameAssets,
    ],
    writeDir: ASSET_DIR,
  });
  const k = makeKit(assets, { font: FONT });
  return { html: html(k, assets), assetBytes: kitBytes(assets) };
}

async function main() {
  const { html: out, assetBytes } = await buildConnect("heroes3");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index.html`, out);
  const kb = Buffer.byteLength(out, "utf8") / 1024;
  console.log(`assets: ${(assetBytes / 1024).toFixed(1)} KB`);
  console.log(`index.html: ${kb.toFixed(1)} KB (${(kb / 2048 * 100).toFixed(1)}% of 2MB)`);
  console.log(`levels: ${LEVELS.length} · -> ${OUT}/index.html`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
