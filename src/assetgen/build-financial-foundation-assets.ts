// Convert generated PNGs into optimized webp dropped in the labs game's assets/.
// Source PNGs come from the Phase-1 generator:
//   npx tsx src/assetgen/run.ts styles/financial-foundation.brief.json [--force]
// then:
//   npx tsx src/assetgen/build-financial-foundation-assets.ts
// The game builder (build-financial-foundation.ts) inlines whatever lives in
// labs/financial-foundation/assets/ via loadAssets(); the game swaps a sprite in
// for any key present (block-debt.webp / block-gold.webp / platform.webp) and
// falls back to the procedural clay draw when a key is absent.
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "../loader.js";

const SRC = path.join(ROOT, "out", "financial-foundation");
const DST = path.join(ROOT, "labs", "financial-foundation", "assets");
const BRIEF = path.join(ROOT, "styles", "financial-foundation.brief.json");

interface BriefAsset {
  key: string;
  kind: string;
  overrides?: { defaults?: { transparent?: boolean } };
}

async function main(): Promise<void> {
  const brief = JSON.parse(readFileSync(BRIEF, "utf8")) as {
    assets: BriefAsset[];
    defaults?: { transparent?: boolean };
  };
  mkdirSync(DST, { recursive: true });
  let total = 0;
  for (const a of brief.assets) {
    const png = path.join(SRC, `${a.key}.png`);
    if (!existsSync(png)) {
      console.warn(`skip ${a.key}: ${png} missing (run the generator first)`);
      continue;
    }
    const transparent = a.overrides?.defaults?.transparent ?? brief.defaults?.transparent ?? true;
    const maxDim = a.kind === "background" ? 1024 : 640;
    let pipe = sharp(png);
    if (transparent) pipe = pipe.trim(); // crop transparent padding to the subject's bbox
    pipe = pipe.resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true });
    const quality = a.kind === "background" ? 90 : 82; // higher q for smooth gradients (avoid banding)
    const out = await pipe.webp({ quality, alphaQuality: 90 }).toBuffer({ resolveWithObject: true });
    writeFileSync(path.join(DST, `${a.key}.webp`), out.data);
    total += out.data.length;
    console.log(`✓ ${a.key}.webp  ${out.info.width}x${out.info.height}  ${(out.data.length / 1024).toFixed(1)} KB`);
  }
  console.log(`total: ${(total / 1024).toFixed(1)} KB -> ${DST}`);
}

main().catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exit(1);
});
