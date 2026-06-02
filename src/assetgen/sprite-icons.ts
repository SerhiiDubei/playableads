/**
 * Sprite-sheet icons experiment.
 *
 * Замість 6 окремих OpenAI запитів на іконки — один запит з ЯВНОЮ позиційною
 * інструкцією на 3×2 grid іконок, потім нарізає sharp.extract() на 6 окремих
 * PNG. Економія: 6 викликів → 1 виклик (~$0.07 → ~$0.011, −85% на іконках)
 * + значно менше rate-limit retries → швидший wall time.
 *
 * Ризики: AI може промахнутись з позиціями / кількістю / однорідністю стилю.
 * Тест перевіряє чи ця економія реально працює для cyber-heist стилю.
 *
 * Usage:
 *   npx tsx src/assetgen/sprite-icons.ts cyber-heist
 *
 * Reads:  styles/<style>.brief.json + out/<style>/{bg,hero,frames}.png
 * Writes: out/<style>-sprite/{_sprite-icons.png, ic-*.png, *.json, sprite-report.html}
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import OpenAI from "openai";
import sharp from "sharp";
import { resolveAsset } from "./compose.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const RATE = 40; // $ per 1M output tokens (як у run.ts)

const briefId = process.argv[2];
if (!briefId) {
  console.error("usage: tsx src/assetgen/sprite-icons.ts <style-id>");
  process.exit(1);
}

const briefPath = `styles/${briefId}.brief.json`;
const brief = JSON.parse(readFileSync(briefPath, "utf8"));
const srcDir = `out/${briefId}`;
const outDir = `out/${briefId}-sprite`;

// ─────────────────────────────────────────────────────────────────────────────
// Layout: 3 cols × 2 rows = 6 cells. 1024×1024 джерело.
// ─────────────────────────────────────────────────────────────────────────────
const SHEET = 1024;
const COLS = 3;
const ROWS = 2;
// (фактичні розміри cell обчислюються з реальної ширини отриманого PNG у sliceSheet)

type CellSpec = { key: string; col: number; row: number; subjectFragment: string };

function describePos(col: number, row: number): string {
  const colName = col === 0 ? "LEFT" : col === 1 ? "CENTER" : "RIGHT";
  const rowName = row === 0 ? "TOP" : "BOTTOM";
  return `${rowName}-${colName}`;
}

function buildSpritePrompt(brief: any, cells: CellSpec[]): string {
  // Беремо стиль/палітру з resolveAsset на першій іконці — щоб не дублювати логіку
  const stylePreview = resolveAsset(brief, { key: "_style", kind: "icon", subject: "X" });
  // Витягуємо style-частину (без subject) з resolvedAsset.prompt
  const styleBoiler = stylePreview.prompt.replace(/^X\. /, "");
  // Будуємо positional inventory
  const inventory = cells
    .map((c, i) => `${i + 1}) ${describePos(c.col, c.row)}: ${c.subjectFragment}`)
    .join("\n");
  return [
    `A precise ${COLS}×${ROWS} grid of exactly ${cells.length} separate cyberpunk neon UI icon buttons on a fully transparent background.`,
    `Each icon is a perfect circle of IDENTICAL diameter and IDENTICAL neon-rim treatment, placed in its own cell of a ${COLS}-column ${ROWS}-row grid.`,
    `Clean equal transparent gutters between cells. Each icon perfectly centered in its cell with equal transparent margin all around.`,
    `Positions (reading order):\n${inventory}`,
    `All ${cells.length} icons share: the same dark navy face, the same thin neon rim glow style, the same diameter, the same visual weight. No icon larger or differently styled than another. No decorative connectors between icons. No background tiles. No text NO letters NO numerals NO labels.`,
    `Style context: ${styleBoiler}`,
  ].join("\n\n");
}

async function generateSprite(prompt: string): Promise<{ buf: Buffer; tokens: number; ms: number }> {
  const t0 = Date.now();
  const res = await client.images.generate({
    model: brief.defaults?.model ?? "gpt-image-1.5",
    prompt,
    size: "1024x1024",
    quality: brief.defaults?.quality ?? "low",
    output_format: "png",
    background: "transparent",
  } as any);
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");
  return { buf: Buffer.from(b64, "base64"), tokens: res.usage?.output_tokens ?? 0, ms: Date.now() - t0 };
}

async function sliceSheet(sheetBuf: Buffer, cells: CellSpec[]): Promise<{ key: string; slice: Buffer; trimmed: Buffer; w: number; h: number; tw: number; th: number }[]> {
  const out: { key: string; slice: Buffer; trimmed: Buffer; w: number; h: number; tw: number; th: number }[] = [];
  // Спочатку дізнаємось точний розмір (на випадок якщо OpenAI повернув щось не 1024)
  const meta = await sharp(sheetBuf).metadata();
  const W = meta.width ?? SHEET;
  const H = meta.height ?? SHEET;
  const cw = Math.floor(W / COLS);
  const ch = Math.floor(H / ROWS);
  for (const c of cells) {
    const left = c.col * cw;
    const top = c.row * ch;
    // last col/row забирає залишок щоб не лишити 1-2px бордюр
    const width = c.col === COLS - 1 ? W - left : cw;
    const height = c.row === ROWS - 1 ? H - top : ch;
    const slice = await sharp(sheetBuf).extract({ left, top, width, height }).png().toBuffer();
    // Автотрим зрізає transparent gutter навколо круглої іконки
    const trimmedMeta = await sharp(slice).trim({ threshold: 5 }).png().toBuffer({ resolveWithObject: true });
    out.push({ key: c.key, slice, trimmed: trimmedMeta.data, w: width, h: height, tw: trimmedMeta.info.width, th: trimmedMeta.info.height });
  }
  return out;
}

function copyNonIconAssets(): string[] {
  // Копіюємо все що НЕ ic-* з оригіналу — frames, bg, hero, banner, avatar-frame
  const copied: string[] = [];
  const allAssets: Array<{ key: string; kind: string }> = brief.assets;
  for (const a of allAssets) {
    if (a.key.startsWith("ic-")) continue; // sprite перекриває
    for (const ext of ["png", "json"]) {
      const from = `${srcDir}/${a.key}.${ext}`;
      const to = `${outDir}/${a.key}.${ext}`;
      if (existsSync(from)) {
        copyFileSync(from, to);
        if (ext === "png") copied.push(a.key);
      }
    }
  }
  return copied;
}

function writeReport(sheetPath: string, cellsOut: Awaited<ReturnType<typeof sliceSheet>>, tokens: number, ms: number, cost: number): string {
  const C = { bg: "#0e1116", panel: "#161b22", border: "#30363d", text: "#d1d5db", mute: "#8b949e", bright: "#fff", ok: "#3fb950", cyan: "#79c0ff" };
  const cellsHtml = cellsOut
    .map((c) => `<div class="cell">
      <div class="thumb-wrap"><img class="thumb" src="${c.key}.png"></div>
      <div class="key">${c.key}</div>
      <div class="dim">cell ${c.w}×${c.h} → trimmed ${c.tw}×${c.th}</div>
    </div>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sprite icons · ${briefId}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui;background:${C.bg};color:${C.text};padding:24px;max-width:1280px;margin:0 auto}
h1{color:${C.bright};font-size:24px;margin-bottom:6px}
h2{color:${C.bright};font-size:16px;margin:24px 0 10px;border-bottom:1px solid ${C.border};padding-bottom:4px}
.stat{background:${C.panel};padding:12px 16px;border-radius:8px;border:1px solid ${C.border};display:inline-block;margin:6px 12px 0 0;font-size:13px}
.stat b{color:${C.bright};font-size:18px;display:block}
.sheet-wrap{background:repeating-conic-gradient(#2a2a30 0% 25%,#1d1d22 0% 50%) 50%/24px 24px;padding:14px;border-radius:8px;border:1px solid ${C.border};text-align:center;margin-top:14px}
.sheet-wrap img{max-width:512px;display:block;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-top:14px}
.cell{background:${C.panel};padding:10px;border-radius:8px;border:1px solid ${C.border};text-align:center}
.thumb-wrap{background:repeating-conic-gradient(#2a2a30 0% 25%,#1d1d22 0% 50%) 50%/12px 12px;border-radius:6px;padding:6px;margin-bottom:6px}
.thumb{max-width:100px;max-height:100px;display:block;margin:0 auto}
.key{color:${C.cyan};font-family:Consolas,monospace;font-size:12px}
.dim{color:${C.mute};font-size:10px;margin-top:2px}
.note{color:${C.mute};font-size:12px;margin-top:8px;line-height:1.5}
</style></head><body>
<h1>Sprite icons test · ${briefId}</h1>
<div class="note">One OpenAI call, ${cellsOut.length} icons sliced via sharp.extract() + autotrim. Compare against individual generation in out/${briefId}/report.html.</div>
<div>
  <div class="stat"><b>${cost.toFixed(4)}$</b>cost (1 call)</div>
  <div class="stat"><b>${tokens}</b>tokens</div>
  <div class="stat"><b>${(ms / 1000).toFixed(1)}s</b>OpenAI time</div>
  <div class="stat"><b>${cellsOut.length}</b>sliced icons</div>
</div>
<h2>Source sheet (1024×1024)</h2>
<div class="sheet-wrap"><img src="${sheetPath}"></div>
<div class="note">Перевір очима: чи всі ${cellsOut.length} іконок рівномірно розставлені по ${COLS}×${ROWS} grid? Чи однакового розміру? Чи не злились між собою?</div>
<h2>Sliced cells (after sharp.extract + autotrim)</h2>
<div class="grid">${cellsHtml}</div>
<div class="note">Якщо хоч одна іконка обрізана, частково в сусідній cell або має нерівні поля — sprite-підхід для цього стилю не підходить, треба регенерувати окремо.</div>
</body></html>`;
  const reportPath = `${outDir}/sprite-report.html`;
  writeFileSync(reportPath, html);
  return reportPath;
}

async function main() {
  console.log(`Sprite-icons test for ${brief.name} v${brief.version}`);
  mkdirSync(outDir, { recursive: true });

  // Витягуємо ic-* іконки з брифа
  const iconAssets: Array<{ key: string; subject: string }> = brief.assets.filter((a: any) => a.key.startsWith("ic-"));
  if (iconAssets.length === 0) throw new Error("no ic-* assets in brief");
  if (iconAssets.length > COLS * ROWS) throw new Error(`brief has ${iconAssets.length} icons, grid fits only ${COLS * ROWS}`);

  // Розкладаємо в reading-order grid: row 0 left→right, row 1 left→right
  const cells: CellSpec[] = iconAssets.map((a, i) => ({
    key: a.key,
    col: i % COLS,
    row: Math.floor(i / COLS),
    subjectFragment: a.subject.replace(/^round (glossy 3D )?cartoon icon button with a |^round cyberpunk icon button with a /, "").replace(/, [a-z]+ rim with thick black outline|, thin (cyan|magenta) neon rim/, ""),
  }));

  const prompt = buildSpritePrompt(brief, cells);
  console.log(`\n=== sprite prompt (sent to OpenAI) ===\n${prompt}\n=== /prompt ===\n`);

  console.log(`generating sprite sheet (1 call, quality=${brief.defaults?.quality ?? "low"})...`);
  const { buf, tokens, ms } = await generateSprite(prompt);
  const cost = (tokens / 1e6) * RATE;
  console.log(`  ✓ sheet: ${ms}ms ${tokens}tok ~$${cost.toFixed(4)}`);
  const sheetPath = `${outDir}/_sprite-icons.png`;
  writeFileSync(sheetPath, buf);

  console.log(`slicing into ${cells.length} cells (sharp.extract + autotrim)...`);
  const sliced = await sliceSheet(buf, cells);
  for (const s of sliced) {
    // зберігаємо trimmed варіант (loadKit все одно потім trim'не — ця дія idempotent)
    writeFileSync(`${outDir}/${s.key}.png`, s.trimmed);
    // sidecar JSON для трасування
    writeFileSync(`${outDir}/${s.key}.json`, JSON.stringify({
      briefId: brief.id, briefVersion: brief.version, key: s.key, kind: "icon",
      source: "sprite-sheet", spriteSheet: "_sprite-icons.png",
      cell: { col: cells.find((c) => c.key === s.key)!.col, row: cells.find((c) => c.key === s.key)!.row, w: s.w, h: s.h },
      trimmed: { w: s.tw, h: s.th },
      perIconCost: cost / cells.length, perIconMs: Math.round(ms / cells.length),
    }, null, 2));
    console.log(`  ✓ ${s.key}: cell ${s.w}×${s.h} → trimmed ${s.tw}×${s.th}`);
  }

  console.log(`copying non-icon assets from ${srcDir}/...`);
  const copied = copyNonIconAssets();
  for (const k of copied) console.log(`  · ${k}`);

  // manifest комбінований
  const manifest = {
    brief: { id: brief.id, version: brief.version },
    spriteIcons: { sheet: "_sprite-icons.png", cells: cells.length, oneCallCost: cost, oneCallMs: ms, tokens },
    results: [
      // sprite-derived icons
      ...sliced.map((s) => ({
        key: s.key, kind: "icon", prompt: "(sprite-derived)", size: `${s.w}x${s.h}`, quality: brief.defaults?.quality ?? "low",
        model: brief.defaults?.model ?? "gpt-image-1.5",
        ms: Math.round(ms / cells.length), tokens: Math.round(tokens / cells.length), cost: cost / cells.length, colorType: 6,
      })),
      // copied originals (читаємо їхні sidecar з srcDir щоб не загубити статистику)
      ...copied.map((key) => {
        try { return JSON.parse(readFileSync(`${srcDir}/${key}.json`, "utf8")); } catch { return null; }
      }).filter(Boolean),
    ],
  };
  writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));

  const reportPath = writeReport("_sprite-icons.png", sliced, tokens, ms, cost);
  console.log(`\nsprite total: ~$${cost.toFixed(4)}, ${(ms / 1000).toFixed(1)}s wall (single call, no rate-limit retries)`);
  console.log(`per-icon: ~$${(cost / cells.length).toFixed(5)} vs ~$0.018 individual (−${((1 - cost / cells.length / 0.018) * 100).toFixed(0)}%)`);
  console.log(`output dir: ${outDir}/`);
  console.log(`compare: ${reportPath}`);
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
