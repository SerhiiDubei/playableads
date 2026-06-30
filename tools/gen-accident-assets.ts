// Asset pipeline for the "avoid-the-accident" lab.
//   npx tsx tools/gen-accident-assets.ts [--force]
//
// Phase 1: generate sprites from styles/avoid-the-accident.brief.json (OpenAI
// gpt-image-1.5) into out/avoid-the-accident/*.png.
// Phase 2: trim → resize → webp each sprite into labs/avoid-the-accident/assets/,
// keeping the raw PNG in assets/_src/ for reproducibility (repo weight pipeline).
import { mkdirSync, existsSync, copyFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { runAssetGen } from "../src/assetgen/run.js";

const ID = "avoid-the-accident";
const force = process.argv.includes("--force");
const OUT = `out/${ID}`;
const ASSETS = `labs/${ID}/assets`;
const SRC = `${ASSETS}/_src`;

// on-disk source width per sprite (game scales to display size via makeSprite).
const WIDTHS: Record<string, number> = {
  "player-car": 230,
  "stalled-car": 230,
  "oncoming-car": 230,
  "cyclist": 150,
  "dog": 170,
  "tree": 200,
};

async function main(): Promise<void> {
  console.log("━━ Phase 1: generate sprites ━━");
  const gen = await runAssetGen({
    briefPath: path.resolve(`styles/${ID}.brief.json`),
    force,
    onLog: (m: string) => process.stdout.write(m),
  });
  console.log(`\nPhase 1: ${gen.generated} generated, ${gen.skipped} skipped, ${gen.errors} errors · $${gen.totalCost.toFixed(3)}`);
  if (gen.errors > 0) { console.error("aborting: Phase 1 had errors"); process.exit(1); }

  console.log("\n━━ Phase 2: optimize → labs assets ━━");
  mkdirSync(SRC, { recursive: true });
  let total = 0;
  for (const [key, width] of Object.entries(WIDTHS)) {
    const srcPng = `${OUT}/${key}.png`;
    if (!existsSync(srcPng)) { console.warn(`  skip ${key}: ${srcPng} not found`); continue; }
    copyFileSync(srcPng, `${SRC}/${key}.png`);
    const outWebp = `${ASSETS}/${key}.webp`;
    await sharp(srcPng).trim().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(outWebp);
    const kb = statSync(outWebp).size / 1024;
    total += statSync(outWebp).size;
    console.log(`  ${key}.webp — ${kb.toFixed(1)} KB`);
  }
  console.log(`\nassets total: ${(total / 1024).toFixed(1)} KB (raw, pre-base64) -> ${ASSETS}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
