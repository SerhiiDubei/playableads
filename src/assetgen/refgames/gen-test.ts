// Schema-quality test: generate a playable game.ts FROM a reference-game entry,
// then build it. Answers: "is the schema rich enough to produce a working game?"
//
// Pipeline: refgame → LLM (tap-the-coin contract) → labs/<id>-gen/game.ts →
// bundle (esbuild) → inline HTML → validate → out/<id>-gen.html.
//
//   npx tsx src/assetgen/refgames/gen-test.ts [game-id]   (default: fruit-ninja)
//
// Code-only (no AI assets) to isolate schema→logic quality, $0, fast.

import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getReferenceGame } from "./index.js";
import { bundleTemplate } from "../../build/bundler.js";
import { buildHtml, loadAssets } from "../../build/inliner.js";
import { validate } from "../../build/validator.js";
import { loadStyle } from "../../loader.js";
import type { PlayableConfig } from "../../types.js";

const CONTRACT = `Ти генеруєш ОДИН файл game.ts — самодостатній playable-ad на PixiJS v8 + GSAP.
Малюєш ВСЕ в коді (Graphics/Text) — БЕЗ зовнішніх картинок (assets порожні).

СУВОРИЙ КОНТРАКТ (копіюй структуру 1-в-1):
\`\`\`ts
import { Application, Container, Graphics, Sprite, Texture, Assets, Text } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

function num(hex: string): number { return parseInt(hex.replace("#", ""), 16); }

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);
  // ... гра тут ...
  // CTA-кнопка викликає РІВНО так (БЕЗ optional chaining ?.): window.FbPlayableAd.onCTAClick();
  function layout(): void { /* позиціонування від app.screen.width/height */ }
  layout();
  window.addEventListener("resize", layout);
}
void main();
\`\`\`

Доступні кольори: cfg.style.colors.{background,primary,accent,text}; шрифт cfg.style.font.{family,weight}.
Текст: cfg.copy.title, cfg.copy.cta. Параметри: cfg.params.

АРТ-АССЕТИ (НОВЕ — ОБОВ'ЯЗКОВО використовуй спрайти, НЕ малюй кружечки):
cfg.assets містить data-URI зображення (webp):
  fruit1.webp..fruit6.webp (цілі фрукти), bomb.webp (бомба), bg.webp (фон-додзьо).
Передзаванаж текстури НА ПОЧАТКУ (await): const tex = {}; for (const k of ["fruit1.webp","fruit2.webp","fruit3.webp","fruit4.webp","fruit5.webp","fruit6.webp","bomb.webp","bg.webp","splat1.webp","splat2.webp","splat3.webp","splat4.webp"]) tex[k] = await Assets.load({ src: cfg.assets[k], format: "webp" });
- ФОН: Sprite з tex["bg.webp"], розтягни на весь екран (cover) у найнижчому шарі.
- ФРУКТ: new Sprite(tex["fruitN.webp"]), anchor 0.5, масштаб під ~r. Випадковий фрукт 1..6.
- БОМБА: new Sprite(tex["bomb.webp"]).
- РОЗРІЗ УЗДОВЖ СВАЙПУ (важливо): запам'ятай кут свайпу (angle = atan2(dy,dx) останнього руху). Цілий спрайт ховай; дві половинки роби з того ж спрайта через маску, ОБЕРНЕНУ на цей кут (поверни контейнер половинок на angle, маски — прямокутники по обидва боки лінії розрізу). Половинки розлітаються ПЕРПЕНДИКУЛЯРНО до лінії свайпу + гравітація.
- СЛІД-ЛЕЗО: за пальцем тягнеться світний слід — масив останніх точок свайпу, малюй як Graphics-смугу зі спаданням alpha (старі точки тьмяніші), білий/світлий glow. Очищай старі точки за ~0.2с.
- СІК НА ФОНІ (якісні асети): на розрізі додай ПОСТІЙНУ пляму на окремий шар над фоном — new Sprite(tex["splatN.webp"]) (N=1..4 випадково), anchor 0.5, .tint = колір фрукта, alpha ~0.45, випадкові rotation і scale 0.4-0.9. Плями білі (тонуються кольором), НАКОПИЧУЮТЬСЯ весь матч (повільно тьмяніють, не зникають одразу) — сигнатура FN. НЕ малюй кляксу Graphics — тільки splat-спрайт.
- SLOW-MO: на великому комбо (3+ за змах) АБО розрізі великого фрукта — на ~0.4с глобально сповільни час (множник tScale=0.35, застосовуй до dt у motion.update(dt*tScale)) + легкий зум світу (scale 1.05). Плавно повертай до 1.

РУХ (НАЙВАЖЛИВІШЕ — бери з нашого модуля, НЕ вигадуй швидкості):
import { makeArc, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";
- Кидай фрукти/бомби ФІЗИЧНОЮ АРКОЮ: const p = makeArc({ fromX, fromY: H, screenH: H, timeAloftSec: 2.2, apexFraction: 0.72, angleDeg: randomLaunchAngle(Math.random()), spinRadPerSec: ... });
  Зберігай p на об'єкті; КОЖЕН тік: const dt = app.ticker.deltaMS/1000; p.update(dt); sprite.x=p.x; sprite.y=p.y; sprite.rotation=p.rotation. Прибирай коли p.done.
- Об'єкт злітає, ЗАВИСАЄ на піку (там і ріжеться), падає. Це обов'язково — не лінійний рух.
- ЗАБОРОНЕНО: x += speed без dt; будь-який розгін ШВИДКОСТІ за часом (напр. 1+elapsed*k).
- Складність: const diff = new DifficultyController(); на розріз diff.recordHit(), промах diff.recordMiss(), бомба diff.recordBombHit().
  Інтервал спавну = diff.spawnWaitSec(); скільки за раз = diff.parallelCount(); шанс бомби = diff.bombProbability().
  Ескалюй ЩІЛЬНІСТЬ (частоту/кількість), НЕ швидкість арки.

АУДІО (обов'язково використай): cfg.assets містить data-URI звуки:
  cfg.assets["slice.wav"], cfg.assets["combo.wav"], cfg.assets["bomb.wav"], cfg.assets["throw.wav"].
Грай так (клонуй щоб накладались): function sfx(k){ const a=new Audio(cfg.assets[k]); a.volume=0.5; a.play().catch(()=>{}); }
- slice.wav — на кожен розріз фрукта; throw.wav — на появу; combo.wav — на комбо; bomb.wav — на вибух.

ВИМОГИ ДО ГРИ (v4 — ПОВНОЦІННА гра, ad-rigged):
- coreAction = свайп ріже все на шляху.
- КОМБО (brief.comboRule): часове вікно — нарізані поспіль фрукти нарощують ланцюг; банер "Combo xN!" + множник + combo.wav. Скидай по таймауту.
- СПЕЦ-ПРЕДМЕТИ (brief.specialItems) — рідко (кожен ~5-8%), познач кольоровим glow-кільцем навколо реюзнутого фрукт-спрайта + банер по розрізу. Реалізуй ВСІ чотири:
  • frenzy (помаранчевий glow): буря фруктів ~5с. Під час frenzy жодних бомб + прибери вже-літаючі бомби.
  • freeze (блакитний glow): сповільнення часу ~3с (tScale=0.4) — легко нарізати.
  • double (золотий glow): множник очок ×2 на ~5с (банер "DOUBLE!").
  • pomegranate (червоно-фіолетовий glow, реюзни plum/fruit6, більший): multi-hit — тапай/ріж швидко для шквалу очок, потім slow-mo zoomout.
- БОМБА = М'ЯКИЙ ШТРАФ, НЕ кінець гри: розріз бомби → шейк + флеш + bomb.wav + мінус кілька очок (або −1 з 3 життів). НЕ викликай finish/endcard від бомби. Гра триває.
- НЕ ЗУПИНЯЙ гру на досягненні score. Жодного "score >= target → finish". Score лише росте; гра — повноцінна.
- ТРИВАЛІСТЬ: гра йде ~25-30с безперервно; ендкард показуй ЛИШЕ коли час вийшов.
- STICKY CTA: кнопка cfg.copy.cta видима ВНИЗУ ВЕСЬ ЧАС під час гри (sticky), і працює завжди (не лише в кінці). По кліку → window.FbPlayableAd.onCTAClick().
- winBias: фруктів багато, бомб мало; гравець завжди почувається успішним.
- firstActionHint: підкажи перший свайп текстом + рука-підказка.
- Без мережі. window.* лише: FbPlayableAd.onCTAClick, addEventListener, Audio.
- CTA ОБОВ'ЯЗКОВО викликається як window.FbPlayableAd.onCTAClick() — точно так, БЕЗ "?." (optional chaining).

СТАБІЛЬНІСТЬ (КРИТИЧНО — інакше падає "Cannot read properties of null (reading 'x')" на pointermove):
- Лише app.stage слухає вказівник (eventMode="static", hitArea=app.screen). Хіт-тест фруктів роби ВРУЧНУ (відстань точки свайпу до позиції фрукта), НЕ через eventMode на спрайтах.
- Усім ІГРОВИМ шарам (фрукти, половинки, партикли, плями, слід-лезо) встанови layer.interactiveChildren=false і НЕ став eventMode на ці спрайти. Інакше Pixi обходить знищені об'єкти й кидає null.x.
- Лише CTA інтерактивний — на ОКРЕМОМУ ui-шарі.
- При прибиранні об'єкта: спершу removeChild з шару, ПОТІМ destroy; одразу видали його з масиву (не лишай знищені посилання).

ВИВЕДИ ЛИШЕ КОД game.ts у одному \`\`\`ts блоці. Без пояснень.`;

function extractCode(s: string): string {
  const m = s.match(/```(?:ts|typescript)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

async function main(): Promise<void> {
  const id = process.argv[2] ?? "fruit-ninja";
  const g = getReferenceGame(id);
  if (!g) throw new Error(`reference game "${id}" not found`);

  console.log(`\n🎲 Генерую гру з референса: ${g.game} (${g.tags.coreAction})`);
  const prompt = `Ось повний бриф механіки (reference-game JSON). Зроби з нього playable game.ts:\n\n${JSON.stringify(g, null, 2)}`;

  const q = query({
    prompt,
    options: { systemPrompt: CONTRACT, allowedTools: [], settingSources: [], maxTurns: 24, permissionMode: "bypassPermissions" },
  });
  let raw = "";
  let cost = 0;
  for await (const m of q) {
    if (m.type === "result") { if (m.subtype === "success") raw = m.result; cost = m.total_cost_usd ?? 0; }
  }
  const code = extractCode(raw);
  console.log(`   ✍️  згенеровано ${code.length} симв.  ($${cost.toFixed(3)})`);

  // write draft
  const dir = path.join("labs", `${id}-gen`);
  mkdirSync(path.join(dir, "assets"), { recursive: true });

  // ── versioning: never overwrite a previous build ──
  // next version = max existing out/<id>-gen-v<N>.html + 1
  let nextV = 1;
  if (existsSync("out")) {
    const re = new RegExp(`^${id}-gen-v(\\d+)\\.html$`);
    for (const f of readdirSync("out")) {
      const m = f.match(re);
      if (m) nextV = Math.max(nextV, Number(m[1]) + 1);
    }
  }
  const vid = `${id}-gen-v${nextV}`;

  // working game.ts (for the build) + a kept per-version snapshot
  writeFileSync(path.join(dir, "game.ts"), code + "\n");
  writeFileSync(path.join(dir, `game-v${nextV}.ts`), code + "\n");
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    id: `${id}-gen`, name: `${g.game} (gen v${nextV})`, description: g.goal, entry: "game.ts",
    assetBudgetBytes: 1468006, params: {}, brief: g,
  }, null, 2) + "\n");

  // build it directly (bypass TEMPLATES_DIR)
  console.log(`   🔧 збираю v${nextV}…`);
  const style = await loadStyle("fruit-bonanza").catch(() => loadStyle("default"));
  const { assets } = await loadAssets(path.join(dir, "assets"));
  const config: PlayableConfig = {
    copy: { title: g.game, cta: "Play Now" },
    lang: "uk", style, params: {}, assets,
  };
  try {
    const js = await bundleTemplate(path.join(dir, "game.ts"), config);
    const html = buildHtml(js, g.game);
    const v = validate(html);
    // write BOTH a versioned file (kept) and the latest pointer
    const versioned = path.join("out", `${vid}.html`);
    writeFileSync(versioned, html, "utf8");
    writeFileSync(path.join("out", `${id}-gen.html`), html, "utf8"); // latest
    console.log(`\n   ✅ ЗІБРАНО v${nextV}: ${versioned}`);
    console.log(`   📦 розмір: ${(v.bytes / 1024).toFixed(1)} KB / ${(v.maxBytes / 1024).toFixed(0)} KB  · validation: ${v.ok ? "OK" : "FAIL"}`);
    if (v.errors.length) console.log(`   ❌ errors: ${v.errors.join("; ")}`);
    if (v.warnings.length) console.log(`   ⚠ warnings: ${v.warnings.join("; ")}`);
    console.log(`\n   👉 клацни: http://localhost:4321/playable/${vid}  (latest: /playable/${id}-gen)\n`);
  } catch (e) {
    console.log(`\n   ❌ BUNDLE FAILED:\n${(e as Error).message}\n`);
    console.log(`   (game.ts лишився в ${dir}/ — глянь що згенерувалось)`);
  }
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
