// Generate a playable game.ts FROM a reference-game entry, then build it.
// GAME-AGNOSTIC: the contract is built from the refgame schema + whatever assets
// exist in labs/<id>-gen/assets/. Works for any deconstructed game (fruit-ninja,
// akuma-no-yoru, …). Run gen-assets first to have art; otherwise code-only.
//
//   npx tsx src/assetgen/refgames/gen-test.ts [game-id]   (default: fruit-ninja)
//
// Pipeline: refgame + assets → LLM (contract) → labs/<id>-gen/game.ts →
// bundle (esbuild) → inline HTML → validate → out/<id>-gen-vN.html (versioned).

import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getReferenceGame } from "./index.js";
import { bundleTemplate } from "../../build/bundler.js";
import { buildHtml, loadAssets } from "../../build/inliner.js";
import { validate } from "../../build/validator.js";
import { loadStyle } from "../../loader.js";
import type { PlayableConfig } from "../../types.js";
import type { ReferenceGame } from "./schema.js";

// Shared skeleton + STABILITY + GSAP + CTA + audio — identical across genres.
function sharedHeader(audioKeys: string[]): string {
  return `Ти генеруєш ОДИН файл game.ts — самодостатній playable-ad на PixiJS v8 + GSAP, за брифом гри (reference-game JSON).

СУВОРИЙ КАРКАС (копіюй структуру):
\`\`\`ts
import { Application, Container, Graphics, Sprite, Texture, Assets, Text } from "pixi.js";
import { gsap } from "gsap";
import { makeArc, makeApproach, makePlatformerBody, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";
import type { PlayableConfig } from "../../src/types.js";
declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;
function num(hex){ return parseInt(hex.replace("#",""),16); }
async function main(){
  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);
  // … гра …
  function layout(){ /* від app.screen.width/height */ }
  layout(); window.addEventListener("resize", layout);
}
void main();
\`\`\`
Кольори: cfg.style.colors.{background,primary,accent,text}; шрифт cfg.style.font.{family,weight}; текст cfg.copy.{title,cta}; cfg.params.

АУДІО: cfg.assets аудіо-ключі: ${audioKeys.length ? audioKeys.join(", ") : "(немає)"}.
${audioKeys.length ? `Грай: function sfx(k){ try{const a=new Audio(cfg.assets[k]); a.volume=0.5; a.play().catch(()=>{});}catch(e){} } — на відповідні події.` : ""}`;
}

const SHARED_TAIL = `СТАБІЛЬНІСТЬ (КРИТИЧНО — інакше "Cannot read properties of null (reading 'x')"):
- Лише app.stage слухає вказівник (eventMode="static", hitArea=app.screen) АБО окремий UI/кнопковий шар. Ігровий хіт-тест роби ВРУЧНУ (відстань/AABB), НЕ через eventMode на ігрових спрайтах.
- Ігровим шарам (світ/вороги/частинки): layer.interactiveChildren=false. Інтерактивні лише кнопки керування + CTA (окремий ui-шар).
- Прибирання обʼєкта: removeChild ПОТІМ destroy; одразу видали з масиву (без знищених посилань).

GSAP: анімуй ЛИШЕ числові властивості Pixi (x, y, alpha, rotation, scale.x/scale.y). НЕ використовуй DOM/CSS-властивості (transformOrigin, css, skew рядком) — вони кидають warning і не діють на Pixi.

CTA викликається РІВНО так (БЕЗ "?."): window.FbPlayableAd.onCTAClick();

ВИВЕДИ ЛИШЕ КОД game.ts у одному \`\`\`ts блоці. Без пояснень.`;

// PLATFORMER branch — controllable side-scroller (D-pad + attack), pixel-art.
function platformerContract(g: ReferenceGame, imageKeys: string[], audioKeys: string[]): string {
  return [sharedHeader(audioKeys), `ЦЕ КЕРОВАНИЙ 2D ПІКСЕЛЬ-АРТ ПЛАТФОРМЕР (Castlevania-лайк). Гравець КЕРУЄ героїнею: біг/стрибок/меч.

АРТ (ПІКСЕЛЬ-АРТ) — ключі: ${imageKeys.join(", ")}.
Прелоад НА ПОЧАТКУ (await): const tex={}; for (const k of ${JSON.stringify(imageKeys)}) tex[k]=await Assets.load({src:cfg.assets[k],format:k.endsWith(".webp")?"webp":"png"});
ПІКСЕЛЬНИЙ рендер: для кожної текстури tex[k].source.scaleMode="nearest".
- ШАРИ: bgLayer (ЕКРАННО-ФІКСОВАНИЙ, НЕ в world!), world (земля+вороги+герой+ціль, скролиться), uiLayer (кнопки), ctaLayer — кожен окремо, поверх попереднього.
- ФОН (КРИТИЧНО — НІКОЛИ порожніх країв): bgLayer, Sprite tex["bg.webp"], cover на ВЕСЬ екран (scale = Math.max(W/texW, H/texH), позиція по центру), оновлюй у layout(). Паралакс роби ЛЕГКИМ зсувом bg.tilePosition АБО просто лиши фон статичним cover — головне фон ЗАВЖДИ покриває весь екран (бо bgLayer не скролиться з world).
- ЗЕМЛЯ (тайлиться, покриває ВСЮ ширину світу): у world намалюй смугу ground повторенням tex["ground.webp"] від x=0 до WORLD_W (стільки копій, скільки треба); верхній край = groundY (напр. H*0.82). Жодних прогалин.
- ГЕРОЇНЯ: один Sprite, anchor(0.5,1.0) (ноги = низ), scale ~Math.min(W,H)*0.0020. Текстуру МІНЯЙ за станом.
- ВОРОГИ: Sprite demon1/2/3.webp, anchor(0.5,1.0).

ФІЗИКА — ЛИШЕ makePlatformerBody, dt-correct (НЕ вигадуй гравітацію, НЕ x+=speed):
const body = makePlatformerBody({ x:W*0.3, groundY, screenH:H, runSpeedShPerSec:0.5, jumpHeightFraction:0.26, jumpRiseSec:0.4, minX:60, maxX:WORLD_W-60 });
КОЖЕН тік: const dt=Math.min(0.05, app.ticker.deltaMS/1000); body.setMove(input.right?1:(input.left?-1:0)); if(jumpPressed){body.jump();jumpPressed=false;} body.update(dt);
hero.x=body.x; hero.y=body.y; hero.scale.x=Math.abs(baseScale)*body.facing.
КАМЕРА: worldScroll = clamp(body.x - W*0.4, 0, WORLD_W - W); world.x = -worldScroll. (герой ~центр/лівіше). bgLayer НЕ рухай (фіксований cover) — лише за бажання легкий tilePosition-паралакс.
ВОРОГИ у СВІТОВИХ координатах: makeApproach({fromX:enemyWorldX, fromY:groundY, toX:body.x, toY:groundY, screenH:H, speedShPerSec:0.10+Math.random()*0.06}); щотіку update(dt); enemy.x=m.x; enemy.y=groundY. Повільні! Щільність/каденс — DifficultyController (recordHit на вбивство).

КЕРУВАННЯ (екранні кнопки — інтерактивний UI-шар, великі ≥64px, напівпрозорі):
- Внизу-ЛІВОРУЧ: LEFT, RIGHT. Внизу-ПРАВОРУЧ: JUMP, ATTACK. Підпиши стрілками/іконками.
- LEFT/RIGHT = HELD: pointerdown→input.left/right=true; pointerup/pointerupoutside→скинь. JUMP=tap→jumpPressed=true. ATTACK=tap→почни свинг.
- Стан у input={left,right}. НЕ читай позицію вказівника для руху.

АНІМАЦІЯ (4 пози, swap tex за станом; attack > jump > run > idle):
- attacking → hero_attack; !grounded → hero_jump; grounded&&(input.left||input.right) → hero_run; інакше hero_idle.
- run: косметичний bob (накладай на hero.y невеликий sin, НЕ змінюй body.y) + лёгкий rotation-нахил.
- jump: squash scale.y на приземленні (числовий tween). flip — лише scale.x.

БІЙ (ручний хітбокс, БЕЗ eventMode на ворогах):
- ATTACK → attacking=true ~0.3с (+кулдаун ~0.35с). ЩЕДРИЙ хітбокс: прямокутник перед героїнею у напрямку facing, ширина ~hero.width*1.6, висота ~hero.height. Перевір КОЖНОГО живого ворога по AABB у СВІТОВИХ координатах (порівнюй body.x±reach з enemy.x, і близькість по Y до groundY). Влучив → ворог гине (fade+відліт+іскри), score++, sfx. Намалюй slash-арку (Graphics) перед героїнею (gsap alpha). НА час свингу перевіряй хітбокс КОЖЕН тік (не лише в момент тапу), щоб ворог у зоні гарантовано загинув.
- Ворог торкнувся героїні → -1 з 5 життів + червоний флеш + шейк + invuln ~1с. М'яко.

ПРОГРЕС/ЦІЛЬ (ad-rig):
- WORLD_W ~ W*3.5. Праворуч намалюй ціль/бос-маркер. Дійшов (body.x близько WORLD_W) → win-біт (slow-mo) → ендкард+велика CTA.
- ІНАКШЕ — кінець ЛИШЕ по ТАЙМЕРУ ~27с → ендкард. НІКОЛИ не закінчувати по життя=0 (життя косметичні; на 0 гра триває).
- Грейс 1.5с без шкоди. winBias: вороги повільні й рідкі, щедрий хітбокс — дійти майже гарантовано.
- Угорі дрібно: назва (підпис ~18px) + 5 життів + дистанція/score.
- firstActionHint: ${g.firstActionHint}. STICKY CTA: cfg.copy.cta видима ВНИЗУ-ПО-ЦЕНТРУ весь час (над/між кнопками), працює завжди.
- DEV-ХУК (для автотесту, лиши в коді): window.__btns = { left:{x,y,w,h}, right:{x,y,w,h}, jump:{...}, attack:{...}, cta:{...} } — екранні прямокутники кнопок (px).`, SHARED_TAIL].join("\n\n");
}

// SLASHER branch (default) — swipe/tap with arc/approach motion.
function slasherContract(g: ReferenceGame, imageKeys: string[], audioKeys: string[]): string {
  const hasAssets = imageKeys.length > 0;
  const bgKey = imageKeys.find((k) => /bg|background/i.test(k));
  const halfKeys = imageKeys.filter((k) => /half/i.test(k));
  const splatKeys = imageKeys.filter((k) => /splat/i.test(k));

  const assetBlock = hasAssets
    ? `АРТ-АССЕТИ — ОБОВ'ЯЗКОВО використовуй спрайти (НЕ малюй примітиви замість них):
cfg.assets містить data-URI зображення (ключі): ${imageKeys.join(", ")}.
Передзавантаж усі НА ПОЧАТКУ (await): const tex={}; for (const k of ${JSON.stringify(imageKeys)}) tex[k]=await Assets.load({src:cfg.assets[k],format:k.endsWith(".webp")?"webp":"png"});
${bgKey ? `- ФОН: Sprite з tex["${bgKey}"], cover на весь екран, найнижчий шар.` : "- Фон намалюй кольором cfg.style.colors.background."}
- Ігрові обʼєкти (${g.objects.join(", ")}) — це Sprite з відповідних ключів (підбери за змістом назви ключа). anchor 0.5, масштаб під розмір.
${halfKeys.length ? `- РОЗРІЗ показує НУТРОЩІ: при розрізі ховай цілий спрайт, показуй "half*" (${halfKeys.join(", ")}) як дві половинки через прямокутні маски по куту свайпу (atan2), що розлітаються перпендикулярно + гравітація.` : ""}
${splatKeys.length ? `- СЛІД/БРИЗКИ на фоні: при ударі клади Sprite("splat*") (${splatKeys.join(", ")}) на окремий шар, .tint = колір обʼєкта/крові, alpha ~0.45, випадк. rotation/scale; НАКОПИЧУЮТЬСЯ весь матч.` : ""}`
    : `БЕЗ зовнішніх асетів — малюй усе в коді (Graphics/Text).`;

  return [sharedHeader(audioKeys), `${assetBlock}

РУХ — бери з нашого модуля motion.js, НЕ вигадуй швидкості (px/кадр заборонено):
- Якщо обʼєкти КИДАЮТЬ/підкидають (як фрукти): makeArc({fromX,fromY:H,screenH:H,timeAloftSec:~2.2,apexFraction:~0.7,angleDeg:randomLaunchAngle(Math.random()),spinRadPerSec}). Злітає→зависає на піку→падає.
- Якщо вороги/обʼєкти НАСУВАЮТЬСЯ на гравця (екшн/виживання): makeApproach({fromX,fromY,toX,toY,screenH:H,speedShPerSec:0.4-0.6}). Рухається до цілі зі сталою швидкістю.
- КОЖЕН тік: const dt=app.ticker.deltaMS/1000; m.update(dt); sprite.x=m.x; sprite.y=m.y; (за наявності sprite.rotation=m.rotation). dt-correct, frame-independent.
- Складність: const diff=new DifficultyController(); на успіх diff.recordHit(), промах/пропуск diff.recordMiss(). Каденс=diff.spawnWaitSec(); кількість=diff.parallelCount(). Ескалюй ЩІЛЬНІСТЬ, НЕ швидкість.

ГЕЙМПЛЕЙ (ad-rigged, ПОВНОЦІННА гра):
- coreAction = "${g.coreAction}": ${g.goal}.
- Реалізуй головну дію + відчутний фідбек (gsap, slow-mo на великих моментах).
${g.comboRule ? `- КОМБО: часове вікно ~${g.comboRule.windowMs}мс, множник (${g.comboRule.multiplier}), банер "Combo xN!".` : ""}
${g.specialItems?.length ? `- СПЕЦ-ПРЕДМЕТИ (рідко, з glow): ${g.specialItems.map((s) => `${s.name} — ${s.effect}`).join("; ")}.` : ""}
- НАПРУГА (winBias=rigged, гравець МАЙЖЕ ЗАВЖДИ виживає): ${g.tension}.
- КРИТИЧНО ПРО РІГ (інакше гра кінчається за секунди — це фейл):
  • Гра завершується ЛИШЕ коли вийшов ТАЙМЕР (~25-30с). НЕ завершуй по «життя=0» / score / кількості пропусків. Грай усі секунди незалежно від скіла.
  • Грейс на старті ~1.5с без жодної шкоди (дай гравцю зорієнтуватись).
  • Якщо обʼєкт дійшов/пропущено — це МʼЯКИЙ косметичний штраф (мінус кілька очок або −1 з ~5 «життів», що НЕ обриває гру; навіть на 0 гра триває до таймера).
  • Обʼєкти зʼявляються/рухаються ПОВІЛЬНО (makeApproach 0.10-0.14 sh/s) і не надто часто, щоб гравець ВСТИГАВ майже всіх. Втрата життя — РІДКІСНА подія, не щосекунди; гравець за нормальної гри НЕ втрачає всі життя. Фокус гравця = score/kills, не балансування на межі.
  • Заголовок/назва гри — ДРІБНИЙ компактний підпис УГОРІ (fontSize ~18-22), НЕ великий банер по центру (не перекриває геймплей).
- ЩЕДРИЙ ХІТ-ТЕСТ: свайп, що проходить у радіусі ~80px від обʼєкта = влучання (не вимагай ідеальної точності). Перевіряй сегмент свайпу проти позицій усіх обʼєктів.
- НЕ зупиняй гру на досягненні score; score лише росте.
- STICKY CTA: cfg.copy.cta видима ВНИЗУ весь час, працює завжди; клік → window.FbPlayableAd.onCTAClick().
- firstActionHint: ${g.firstActionHint} (підкажи текстом + рука-підказка).
- Aha-момент: ${g.ahaMoments?.[0]?.desc ?? g.goal}.`, SHARED_TAIL].join("\n\n");
}

// Dispatcher: pick the contract branch by playableKind.
function buildContract(g: ReferenceGame, imageKeys: string[], audioKeys: string[]): string {
  const kind = g.playableKind ?? "slasher";
  return kind === "platformer"
    ? platformerContract(g, imageKeys, audioKeys)
    : slasherContract(g, imageKeys, audioKeys);
}

function extractCode(s: string): string {
  const m = s.match(/```(?:ts|typescript)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

async function main(): Promise<void> {
  const id = process.argv[2] ?? "fruit-ninja";
  const g = getReferenceGame(id);
  if (!g) throw new Error(`reference game "${id}" not found`);

  const dir = path.join("labs", `${id}-gen`);
  mkdirSync(path.join(dir, "assets"), { recursive: true });

  // asset keys present (drive the contract)
  const files = existsSync(path.join(dir, "assets")) ? readdirSync(path.join(dir, "assets")) : [];
  const imageKeys = files.filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f)).sort();
  const audioKeys = files.filter((f) => /\.(wav|mp3|ogg)$/i.test(f)).sort();

  console.log(`\n🎲 Генерую: ${g.game} (${g.tags.coreAction}) · ${imageKeys.length} img, ${audioKeys.length} sfx`);
  const contract = buildContract(g, imageKeys, audioKeys);
  const prompt = `Бриф гри (reference-game JSON). Зроби playable game.ts:\n\n${JSON.stringify(g, null, 2)}`;

  const q = query({
    prompt,
    options: { systemPrompt: contract, allowedTools: [], settingSources: [], maxTurns: 24, permissionMode: "bypassPermissions" },
  });
  let raw = "";
  let cost = 0;
  for await (const m of q) {
    if (m.type === "result") { if (m.subtype === "success") raw = m.result; cost = m.total_cost_usd ?? 0; }
  }
  const code = extractCode(raw);
  console.log(`   ✍️  ${code.length} симв.  ($${cost.toFixed(3)})`);

  // versioning: never overwrite
  let nextV = 1;
  if (existsSync("out")) {
    const re = new RegExp(`^${id}-gen-v(\\d+)\\.html$`);
    for (const f of readdirSync("out")) { const mm = f.match(re); if (mm) nextV = Math.max(nextV, Number(mm[1]) + 1); }
  }
  const vid = `${id}-gen-v${nextV}`;
  writeFileSync(path.join(dir, "game.ts"), code + "\n");
  writeFileSync(path.join(dir, `game-v${nextV}.ts`), code + "\n");
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    id: `${id}-gen`, name: `${g.game} (gen v${nextV})`, description: g.goal, entry: "game.ts",
    assetBudgetBytes: 1468006, params: {}, brief: g,
  }, null, 2) + "\n");

  console.log(`   🔧 збираю v${nextV}…`);
  const style = await loadStyle("fruit-bonanza").catch(() => loadStyle("default"));
  const { assets } = await loadAssets(path.join(dir, "assets"));
  const config: PlayableConfig = { copy: { title: g.game, cta: "Play Now" }, lang: "uk", style, params: {}, assets };
  try {
    const js = await bundleTemplate(path.join(dir, "game.ts"), config);
    const html = buildHtml(js, g.game);
    const v = validate(html);
    writeFileSync(path.join("out", `${vid}.html`), html, "utf8");
    writeFileSync(path.join("out", `${id}-gen.html`), html, "utf8");
    console.log(`\n   ✅ v${nextV}: out/${vid}.html · ${(v.bytes / 1024).toFixed(0)}KB/${(v.maxBytes / 1024).toFixed(0)}KB · ${v.ok ? "OK" : "FAIL"}`);
    if (v.errors.length) console.log(`   ❌ ${v.errors.join("; ")}`);
    console.log(`   👉 http://localhost:4321/playable/${vid}\n`);
  } catch (e) {
    console.log(`\n   ❌ BUNDLE FAILED:\n${(e as Error).message}\n   (game.ts у ${dir}/)`);
  }
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
