// Schema-quality test: generate a playable game.ts FROM a reference-game entry,
// then build it. Answers: "is the schema rich enough to produce a working game?"
//
// Pipeline: refgame → LLM (tap-the-coin contract) → labs/<id>-gen/game.ts →
// bundle (esbuild) → inline HTML → validate → out/<id>-gen.html.
//
//   npx tsx src/assetgen/refgames/gen-test.ts [game-id]   (default: fruit-ninja)
//
// Code-only (no AI assets) to isolate schema→logic quality, $0, fast.

import { mkdirSync, writeFileSync } from "node:fs";
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
import { Application, Container, Graphics, Text } from "pixi.js";
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

ВИМОГИ ДО ГРИ:
- Реалізуй coreAction як головну взаємодію.
- Реалізуй щонайменше aha-момент #1 (priority 1) з відчутним фідбеком (gsap-анімація).
- Луп ~15-25с АБО до досягнення цілі → потім показати CTA (win-стан).
- Зроби winBias: дай гравцю легко відчути успіх (rigged).
- firstActionHint: підкажи першу дію (текст/стрілка).
- Без зовнішніх ассетів, без мережі, без window.* окрім FbPlayableAd.onCTAClick та addEventListener.
- CTA ОБОВ'ЯЗКОВО викликається як window.FbPlayableAd.onCTAClick() — точно так, БЕЗ "?." (optional chaining).

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
    options: { systemPrompt: CONTRACT, allowedTools: [], settingSources: [], maxTurns: 8, permissionMode: "bypassPermissions" },
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
  writeFileSync(path.join(dir, "game.ts"), code + "\n");
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    id: `${id}-gen`, name: `${g.game} (gen)`, description: g.goal, entry: "game.ts",
    assetBudgetBytes: 1468006, params: {}, brief: g,
  }, null, 2) + "\n");

  // build it directly (bypass TEMPLATES_DIR)
  console.log(`   🔧 збираю…`);
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
    const outPath = path.join("out", `${id}-gen.html`);
    writeFileSync(outPath, html, "utf8");
    console.log(`\n   ✅ ЗІБРАНО: ${outPath}`);
    console.log(`   📦 розмір: ${(v.bytes / 1024).toFixed(1)} KB / ${(v.maxBytes / 1024).toFixed(0)} KB  · validation: ${v.ok ? "OK" : "FAIL"}`);
    if (v.errors.length) console.log(`   ❌ errors: ${v.errors.join("; ")}`);
    if (v.warnings.length) console.log(`   ⚠ warnings: ${v.warnings.join("; ")}`);
    console.log(`\n   👉 відкрий у браузері: file://${path.resolve(outPath)}\n`);
  } catch (e) {
    console.log(`\n   ❌ BUNDLE FAILED:\n${(e as Error).message}\n`);
    console.log(`   (game.ts лишився в ${dir}/ — глянь що згенерувалось)`);
  }
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
