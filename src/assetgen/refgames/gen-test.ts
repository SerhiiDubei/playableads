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

// Build the system-prompt contract from the schema + present asset keys.
function buildContract(g: ReferenceGame, imageKeys: string[], audioKeys: string[]): string {
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

  return `Ти генеруєш ОДИН файл game.ts — самодостатній playable-ad на PixiJS v8 + GSAP, за брифом гри (reference-game JSON).

СУВОРИЙ КАРКАС (копіюй структуру):
\`\`\`ts
import { Application, Container, Graphics, Sprite, Texture, Assets, Text } from "pixi.js";
import { gsap } from "gsap";
import { makeArc, makeApproach, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";
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

${assetBlock}

РУХ — бери з нашого модуля motion.js, НЕ вигадуй швидкості (px/кадр заборонено):
- Якщо обʼєкти КИДАЮТЬ/підкидають (як фрукти): makeArc({fromX,fromY:H,screenH:H,timeAloftSec:~2.2,apexFraction:~0.7,angleDeg:randomLaunchAngle(Math.random()),spinRadPerSec}). Злітає→зависає на піку→падає.
- Якщо вороги/обʼєкти НАСУВАЮТЬСЯ на гравця (екшн/виживання): makeApproach({fromX,fromY,toX,toY,screenH:H,speedShPerSec:0.4-0.6}). Рухається до цілі зі сталою швидкістю.
- КОЖЕН тік: const dt=app.ticker.deltaMS/1000; m.update(dt); sprite.x=m.x; sprite.y=m.y; (за наявності sprite.rotation=m.rotation). dt-correct, frame-independent.
- Складність: const diff=new DifficultyController(); на успіх diff.recordHit(), промах/пропуск diff.recordMiss(). Каденс=diff.spawnWaitSec(); кількість=diff.parallelCount(). Ескалюй ЩІЛЬНІСТЬ, НЕ швидкість.

АУДІО: cfg.assets аудіо-ключі: ${audioKeys.length ? audioKeys.join(", ") : "(немає)"}.
${audioKeys.length ? `Грай: function sfx(k){ try{const a=new Audio(cfg.assets[k]); a.volume=0.5; a.play().catch(()=>{});}catch(e){} } — на відповідні події (удар/поява/комбо/невдача).` : ""}

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
- Aha-момент: ${g.ahaMoments?.[0]?.desc ?? g.goal}.

СТАБІЛЬНІСТЬ (КРИТИЧНО — інакше "Cannot read properties of null (reading 'x')"):
- Лише app.stage слухає вказівник (eventMode="static", hitArea=app.screen). Хіт-тест роби ВРУЧНУ (відстань точки до позиції обʼєкта), НЕ через eventMode на ігрових спрайтах.
- Ігровим шарам: layer.interactiveChildren=false. Лише CTA інтерактивний (окремий ui-шар).
- Прибирання обʼєкта: removeChild ПОТІМ destroy; одразу видали з масиву (без знищених посилань).

CTA викликається РІВНО так (БЕЗ "?."): window.FbPlayableAd.onCTAClick();

ВИВЕДИ ЛИШЕ КОД game.ts у одному \`\`\`ts блоці. Без пояснень.`;
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
