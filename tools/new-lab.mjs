// Scaffold a track-B GAME lab, wired to the official game-UI kit + the VISIBLE
// pipeline. Freelancing is impossible by default: the game stub already imports
// buildEndcard from kit/ui.ts, and a _pipeline/ folder of stage "papers" + a
// STATUS board are created so the conveyor is visible from step 0.
//
//   node tools/new-lab.mjs <kebab-id>
//
// See docs/PIPELINE.md (the single source for the process).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const id = process.argv[2];
if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
  console.error("usage: node tools/new-lab.mjs <kebab-id>   (e.g. catch-the-coin)");
  process.exit(1);
}
const ROOT = process.cwd();
const labDir = path.join(ROOT, "labs", id);
if (existsSync(labDir)) { console.error(`error: "${id}" already exists at labs/${id}`); process.exit(1); }

mkdirSync(path.join(labDir, "assets", "_src"), { recursive: true });
mkdirSync(path.join(labDir, "_pipeline"), { recursive: true });

// ── manifest.json ──
const manifest = {
  id,
  name: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  description: "TODO: one line — what we advertise + the final action.",
  entry: "game.ts",
  assetBudgetBytes: 1468006,
  style: id,
  copy: { title: "TODO Title", cta: "Learn more" },
  params: { gameDurationSec: 20 },
};
writeFileSync(path.join(labDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// ── styles/<id>.json (brand tokens) — only if absent ──
const styleFile = path.join(ROOT, "styles", `${id}.json`);
if (!existsSync(styleFile)) {
  const style = { id, name: manifest.name, colors: { background: "#101820", primary: "#2DA44E", accent: "#F5A623", text: "#FFFFFF" }, font: { family: "Arial, sans-serif", weight: 800 } };
  writeFileSync(styleFile, JSON.stringify(style, null, 2) + "\n");
}

// ── game.ts stub — WIRED to the official game-UI kit (no freelancing) ──
writeFileSync(path.join(labDir, "game.ts"), `import { Application, Container } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";
import { buildEndcard } from "../../src/assetgen/kit/ui.js"; // game-UI набір (гілка B) — НЕ малюй UI сам

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;
declare global { interface Window { FbPlayableAd: { onCTAClick: () => void } } }

async function main(): Promise<void> {
  if (!window.FbPlayableAd) window.FbPlayableAd = { onCTAClick: () => {} };
  void (() => window.FbPlayableAd.onCTAClick); // validator anchor

  const app = new Application();
  await app.init({ width: window.innerWidth, height: window.innerHeight, background: 0x101820, antialias: true });
  app.canvas.style.touchAction = "none";
  document.body.appendChild(app.canvas);

  // TODO(${id}): build the mechanic here (станція 5). Keep UI in the game-UI kit.
  void Container; void gsap; void cfg;

  // Endcard is WIRED to the official game-UI kit — do NOT draw your own.
  function endGame(): void {
    buildEndcard({
      brand: "Brand Name",
      avoided: 1,
      total: 1,
      headline: cfg.copy?.title ?? "Result",
      subline: "TODO: result line.",
      ctaText: cfg.copy?.cta ?? "Learn more",
      trustText: "TODO trust line",
      onCta: () => window.FbPlayableAd.onCTAClick(),
    });
  }
  void endGame; // call when the game ends
}
void main();
`);

// ── _pipeline/ stage papers ──
const stations = [
  ["01-zadacha", "ЗАДАЧА (бриф)", "- **Продукт / бренд:** \n- **Сегмент (хто гравець):** \n- **Кінцева дія (CTA):** \n- **Дедлайн:** ", "бриф ясний → ✅"],
  ["02-zadum", "ЗАДУМ (концепт)", "- **Механіка** (агностична 5-ка: quiz/swipe/reveal/match/choose): \n- **ТИП:** B (гра)   _(A = меню-демо)_\n- **Екрани:** intro → гра → ендкард\n- **Референс-гра:** ", "ти ✅ концепт"],
  ["03-styl", "СТИЛЬ (бренд)", "- **Палітра:** (заповни `styles/" + id + ".json`)\n- **Шрифт:** \n- **Арт-напрямок / референс стилю:** ", "ти ✅ стиль"],
  ["04-aseti", "АСЕТИ", "- **Потрібні картинки (ключі):** \n- **Бриф для генерації:** `styles/" + id + ".brief.json` (якщо AI)\n- **Статус:** ⬜", "усі є, в стилі → ✅"],
  ["05-zbirka", "ЗБІРКА", "- **Команда:** `npx tsx src/assetgen/build-lab.ts " + id + "`\n- **Вихід:** `test/" + id + "/index.html`\n- **Розмір:** ___ KB / 2 MB", "зібралось, валідне для Meta"],
  ["06-perevirka", "ПЕРЕВІРКА", "- **Команда:** `node tools/verify-lab.mjs " + id + "`\n- **Помилки:** \n- **Оцінка краси (критик):** \n- **Скріни:** `test/" + id + "/qa/`", "усі гейти зелені → ✅"],
  ["07-log", "ЛОГ", "- **Запис у BUILD-LOG:** \n- **Дошка оновлена:** ", "записано"],
  ["08-link", "ЛІНК", "- **Deploy:** `npx vercel deploy --prod --yes` (root index.html)\n- **Публічний лінк:** ", "лінк працює"],
];
for (const [file, title, body, gate] of stations) {
  writeFileSync(path.join(labDir, "_pipeline", `${file}.md`), `# ${title} — ${id}\n\n${body}\n\n_Гейт: ${gate}_\n_Статус: ⬜ чекає_\n`);
}

// ── _pipeline/STATUS.md (per-lab board) ──
const statusRows = stations.map((s, i) => `| ${i + 1} | ${s[1].split(" (")[0]} | ⬜ |`).join("\n");
writeFileSync(path.join(labDir, "_pipeline", "STATUS.md"), `# STATUS — ${id}\n\n| # | Станція | Стан |\n|---|---|---|\n${statusRows}\n\nЛегенда: ⬜ чекає · 🟡 роблю · ✅ готово\n`);

// ── labs/BOARD.md (studio board) — create or append a row ──
const boardFile = path.join(ROOT, "labs", "BOARD.md");
const header = `# BOARD — усі плейбли × станція\n\nЛегенда: ⬜ чекає · 🟡 роблю · ✅ готово · станції 1-8 (див. docs/PIPELINE.md)\n\n| Плейбл | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |\n|---|---|---|---|---|---|---|---|---|\n`;
const row = `| ${id} | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |\n`;
if (!existsSync(boardFile)) writeFileSync(boardFile, header + row);
else {
  const cur = readFileSync(boardFile, "utf8");
  if (!cur.includes(`| ${id} |`)) writeFileSync(boardFile, cur.endsWith("\n") ? cur + row : cur + "\n" + row);
}

console.log(`✓ created labs/${id}/  (manifest, game.ts wired to game-UI kit, assets/, _pipeline/ × 8 + STATUS)`);
console.log(`✓ styles/${id}.json ${existsSync(styleFile) ? "ready" : "?"}`);
console.log(`✓ labs/BOARD.md updated`);
console.log(`\nНаступне: станція 1 — заповни labs/${id}/_pipeline/01-zadacha.md, тоді ✅.`);
